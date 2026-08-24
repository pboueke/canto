import type { Page, Attachment, JournalContent } from 'canto-data';
import type { LocalStore } from '@/lib/storage/types';
import type { RemoteStore, SyncResult, SyncIndex } from './types';
import { aesGcmEncrypt, aesGcmDecrypt } from '@/lib/encryption/utils';
import { safeJsonParse } from '@/lib/utils/json';
import { finishSyncDebugTrace, recordSyncDebugPhase, startSyncDebugTrace } from './debug-trace';
import { LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES } from '@/lib/storage/attachment-content';

const CONCURRENCY = 4;
const ATTACHMENT_CONCURRENCY = 2;
/** Old one-value AES-GCM blobs cannot be converted without materializing them. */
// Legacy sync still materializes a complete base64 value at several seams. Keep
// its cap below one chunk until every existing attachment has a descriptor.
export const LEGACY_ATTACHMENT_SYNC_LIMIT_BYTES = LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES;

/** Cap for native-allocation-heavy WebCrypto + fetch work per tab. */
export const WEB_SYNC_NEW_CHUNK_BUDGET = 150;
/** Requested destination size when restarting an already-partial web upload. */
export const WEB_SYNC_RESTART_CHUNK_SIZE_BYTES = 10 * 1024 * 1024;

export interface SyncOptions {
  /**
   * Maximum missing immutable chunks this run may read, encrypt, and upload.
   * Omit on native and key-rotation syncs to retain their atomic behavior.
   */
  newChunkUploadBudget?: number;
  /**
   * Restart partial uploads below this chunk size in a fresh immutable local
   * generation before transferring them. Web only; omitted elsewhere.
   */
  restartPartialUploadChunkSize?: number;
  /** Called immediately before this renderer reads its first reserved chunk. */
  onChunkUploadWorkStarted?: () => void;
}

interface AttachmentUploadOutcome {
  complete: boolean;
  checkpointed: boolean;
}

class NewChunkUploadBudget {
  private remaining: number;

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error('newChunkUploadBudget must be a positive integer');
    }
    this.remaining = limit;
  }

  get exhausted(): boolean {
    return this.remaining === 0;
  }

  /** Reserve work before local reads so a budget boundary never opens a chunk. */
  reserve(indexes: readonly number[]): ReadonlySet<number> {
    const permitted = indexes.slice(0, this.remaining);
    this.remaining -= permitted.length;
    return new Set(permitted);
  }
}

/** Raised when a sync is intentionally invalidated by its manager. */
export class SyncCancelledError extends Error {
  constructor() {
    super('Sync cancelled');
    this.name = 'SyncCancelledError';
  }
}

export function isSyncCancelledError(error: unknown): error is SyncCancelledError {
  return error instanceof SyncCancelledError;
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new SyncCancelledError();
}

/** Run async tasks with bounded concurrency. */
async function parallel<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = CONCURRENCY,
): Promise<void> {
  const queue = items.slice();
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

/** Collect all non-deleted attachments from a page. */
function pageAttachments(page: Page): Attachment[] {
  return [...(page.images ?? []), ...(page.files ?? [])].filter((a) => !a.deleted && a.path);
}

/** Extract filename from a local file path. */
function filenameFromPath(path: string): string {
  return path.split('/').pop() ?? path;
}

export class SyncEngine {
  constructor(
    private local: LocalStore,
    private remote: RemoteStore,
  ) {}

  // Generations are immutable but may be uploaded concurrently by another
  // device from the same page snapshot. A client cannot prove ownership of a
  // partially uploaded generation, so it must never delete chunks after a
  // failed upload. The unreachable generation is intentionally retained for a
  // server-side, reference-aware garbage collector; data safety wins over
  // opportunistic client-side cleanup.

  /**
   * Check whether an entire local page can use the old whole-value attachment
   * route without opening an attachment. Key rotation must perform this check
   * before changing any remote page: publishing the new salt with even one
   * deferred old-key page would make that page unreadable on peers.
   */
  private async canUploadPageAttachments(
    page: Page,
    warnings: SyncResult['warnings'],
  ): Promise<boolean> {
    for (const att of pageAttachments(page)) {
      if (this.remote.isRemotePath(att.path)) continue;
      if (att.content?.format === 'canto-chunked-v1') {
        if (!att.content.generation) {
          warnings.push({
            pageId: page.id,
            name: att.name,
            size: att.size,
            reason: 'chunk-generation-missing',
          });
          return false;
        }
        continue;
      }
      const stored = this.local.getAttachmentStorageSize
        ? await this.local.getAttachmentStorageSize(att.path)
        : { status: 'unknown' as const };
      if (stored.status === 'missing') continue;
      const size = att.size ?? (stored.status === 'known' ? stored.bytes : undefined);
      if (size == null || size > LEGACY_ATTACHMENT_SYNC_LIMIT_BYTES) {
        warnings.push({
          pageId: page.id,
          name: att.name,
          size,
          reason: 'legacy-attachment-too-large',
        });
        return false;
      }
    }
    return true;
  }

  /**
   * Upload all attachments for a page. Chunked data crosses every seam one
   * authenticated payload at a time. An unsafe legacy blob deliberately keeps
   * its page dirty instead of entering the former whole-value sync path.
   */
  private async uploadPageAttachments(
    journalId: string,
    page: Page,
    syncKey: Uint8Array,
    warnings: SyncResult['warnings'],
    signal?: AbortSignal,
    budget?: NewChunkUploadBudget,
    restartPartialUploadChunkSize?: number,
    onChunkUploadWorkStarted?: () => void,
  ): Promise<AttachmentUploadOutcome> {
    const atts = pageAttachments(page).filter((a) => !this.remote.isRemotePath(a.path));
    let deferred = false;
    let checkpointed = false;
    const transfer = async (att: Attachment): Promise<void> => {
      try {
        assertNotCancelled(signal);
        if (att.content?.format === 'canto-chunked-v1') {
          // Descriptors published before canto-data 1.2.0 have no immutable
          // generation. Uploading them at the old attachment-id/index address
          // could overwrite chunks still referenced by the remote page.
          if (!att.content.generation) {
            deferred = true;
            warnings.push({
              pageId: page.id,
              name: att.name,
              size: att.size,
              reason: 'chunk-generation-missing',
            });
            return;
          }
          if (!this.local.forEachAttachmentChunk || !this.remote.uploadAttachmentChunk) {
            throw new Error('Chunked attachment transfer is unavailable');
          }

          let indexes: ReadonlySet<number> | undefined;
          let missingIndexes: number[] | undefined;
          if (budget) {
            if (!this.remote.listAttachmentChunkIndexes) {
              throw new Error('Chunked attachment resume inventory is unavailable');
            }
            const present = await this.remote.listAttachmentChunkIndexes(
              journalId,
              att.id,
              att.content.generation,
              att.content.chunkCount,
              signal,
            );
            assertNotCancelled(signal);
            missingIndexes = Array.from(
              { length: att.content.chunkCount },
              (_, index) => index,
            ).filter((index) => !present.has(index));
            if (missingIndexes.length === 0) return;
            if (
              present.size > 0 &&
              restartPartialUploadChunkSize != null &&
              att.content.chunkSize < restartPartialUploadChunkSize &&
              this.local.migrateAttachmentChunkGeneration
            ) {
              const migrated = await this.local.migrateAttachmentChunkGeneration(
                journalId,
                page.id,
                att.id,
                att.content.generation,
                restartPartialUploadChunkSize,
                syncKey,
              );
              assertNotCancelled(signal);
              Object.assign(page, migrated);
              const replacement = pageAttachments(page).find(
                (candidate) => candidate.id === att.id,
              );
              if (!replacement) throw new Error(`Migrated attachment is missing: ${att.name}`);
              await transfer(replacement);
              return;
            }
            if (budget.exhausted) {
              checkpointed = true;
              return;
            }
            indexes = budget.reserve(missingIndexes);
            if (indexes.size === 0) {
              checkpointed = true;
              return;
            }
          }

          // Notify the manager before IndexedDB/WebCrypto work. If this run is
          // cancelled or fails below, the tab must still not start another
          // bounded run on top of these native allocations.
          if (budget && indexes && indexes.size > 0) onChunkUploadWorkStarted?.();
          await this.local.forEachAttachmentChunk(
            att,
            async (index, data) => {
              assertNotCancelled(signal);
              const encrypted = await aesGcmEncrypt(data, syncKey);
              assertNotCancelled(signal);
              await this.remote.uploadAttachmentChunk!(
                journalId,
                att.id,
                att.content!.generation,
                index,
                encrypted,
                signal,
              );
              recordSyncDebugPhase('attachment-chunk-uploaded');
              assertNotCancelled(signal);
            },
            indexes,
          );
          // The inventory was read before any local chunk work. If the
          // reservation did not cover every missing index, stop now rather
          // than reading the next one in this renderer.
          if (budget && indexes && indexes.size < missingIndexes!.length) checkpointed = true;
          return;
        }

        // Do the metadata-only size lookup before getAttachment: a
        // descriptor-absent payload may only use the old whole-value route
        // when its stored size is known to be safe. Missing is distinct from
        // unknown: retain the historical missing-file warning, but never open
        // an existing historical value merely to estimate its size.
        const stored = this.local.getAttachmentStorageSize
          ? await this.local.getAttachmentStorageSize(att.path)
          : { status: 'unknown' as const };
        if (stored.status === 'missing') {
          console.warn(`[Sync] Missing local attachment: ${att.path} (page ${page.id})`);
          return;
        }
        const size = att.size ?? (stored.status === 'known' ? stored.bytes : undefined);
        if (size == null || size > LEGACY_ATTACHMENT_SYNC_LIMIT_BYTES) {
          deferred = true;
          warnings.push({
            pageId: page.id,
            name: att.name,
            size,
            reason: 'legacy-attachment-too-large',
          });
          return;
        }
        const data = await this.local.getAttachment(att.path);
        assertNotCancelled(signal);
        if (!data) {
          console.warn(`[Sync] Missing local attachment: ${att.path} (page ${page.id})`);
          return;
        }
        const encrypted = await aesGcmEncrypt(data, syncKey);
        assertNotCancelled(signal);
        await this.remote.uploadAttachment(journalId, att.path, encrypted);
        assertNotCancelled(signal);
      } catch (err) {
        if (isSyncCancelledError(err)) throw err;
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `[Sync] Failed to upload attachment ${att.path} (page ${page.id}): ${message}. ` +
            'Please retry sync.',
        );
      }
    };

    // A checkpoint budget must reserve a chunk before its read. Keep transfers
    // serial so two attachment workers cannot race the shared reservation.
    if (budget) {
      for (const initialAttachment of atts) {
        // Migration replaces the page's attachment object with a new immutable
        // generation. Resolve it just before transfer instead of using a stale
        // pre-migration object from the initial attachment list.
        const att = pageAttachments(page).find(
          (attachment) => attachment.id === initialAttachment.id,
        );
        if (att) await transfer(att);
        if (checkpointed) break;
      }
    } else {
      await parallel(atts, transfer, ATTACHMENT_CONCURRENCY);
    }
    return { complete: !deferred && !checkpointed, checkpointed };
  }

  /** Download all attachments for a page from remote, decrypting with syncKey. */
  private async downloadPageAttachments(
    journalId: string,
    page: Page,
    syncKey: Uint8Array,
    warnings: SyncResult['warnings'],
    signal?: AbortSignal,
  ): Promise<boolean> {
    const atts = pageAttachments(page);
    let deferred = false;
    await parallel(
      atts,
      async (att) => {
        assertNotCancelled(signal);
        if (att.content?.format === 'canto-chunked-v1') {
          // Descriptors from the original chunked contract have no immutable
          // generation. Reading their mutable attachment-id/index addresses
          // could combine a concurrently replaced payload with this page.
          // Leave the page dirty rather than fetching or saving it.
          if (!att.content.generation) {
            deferred = true;
            warnings.push({
              pageId: page.id,
              name: att.name,
              size: att.size,
              reason: 'chunk-generation-missing',
            });
            return;
          }
          if (!this.local.saveAttachmentChunks || !this.remote.downloadAttachmentChunk) {
            throw new Error('Chunked attachment transfer is unavailable');
          }
          const remote = this.remote;
          async function* chunks(): AsyncGenerator<string> {
            for (let index = 0; index < att.content!.chunkCount; index++) {
              assertNotCancelled(signal);
              const encrypted = await remote.downloadAttachmentChunk!(
                journalId,
                att.id,
                att.content!.generation,
                index,
                signal,
              );
              if (!encrypted) throw new Error(`Attachment chunk not found: ${att.name} #${index}`);
              const data = await aesGcmDecrypt(encrypted, syncKey);
              assertNotCancelled(signal);
              yield data;
            }
          }
          const localPath = await this.local.saveAttachmentChunks(
            journalId,
            page.id,
            att,
            chunks(),
          );
          assertNotCancelled(signal);
          att.path = localPath;
          return;
        }
        // Remote legacy blobs have no metadata-only size endpoint. Never
        // fetch/decrypt a whole value unless the page declares it safely below
        // one chunk; missing size is deliberately unsafe rather than guessed.
        if (att.size == null || att.size > LEGACY_ATTACHMENT_SYNC_LIMIT_BYTES) {
          const filename = filenameFromPath(att.path);
          att.path = this.remote.buildRemotePath(journalId, filename);
          warnings.push({
            pageId: page.id,
            name: att.name,
            size: att.size,
            reason: 'legacy-attachment-too-large',
          });
          return;
        }
        const filename = filenameFromPath(att.path);
        const remotePath = this.remote.buildRemotePath(journalId, filename);
        const encrypted = await this.remote.downloadAttachment(remotePath);
        assertNotCancelled(signal);
        if (!encrypted) {
          throw new Error(`[Sync] Attachment not found on remote: ${remotePath} (page ${page.id})`);
        }
        const data = await aesGcmDecrypt(encrypted, syncKey);
        assertNotCancelled(signal);
        const localPath = await this.local.saveAttachment(journalId, page.id, att, data);
        assertNotCancelled(signal);
        att.path = localPath;
      },
      ATTACHMENT_CONCURRENCY,
    );
    return !deferred;
  }

  /**
   * Sync a single journal between local and remote.
   *
   * All data is encrypted with syncKey before upload and decrypted after download.
   * syncKey is required for all journals:
   *   - Password-protected: derived from password + salt
   *   - Non-secure: derived from empty password + salt
   *
   * Strategy: last-write-wins based on `modified` timestamps.
   * Deleted pages are synced as deletions (soft-delete propagation).
   */
  async sync(
    journalId: string,
    syncKey: Uint8Array,
    onProgress?: (current: number, total: number) => void,
    /**
     * The remote registry salt observed at the end of the previous successful
     * sync from this device. Used to disambiguate "I just changed my password
     * locally" (push) from "another device changed the password" (abort).
     * Pass `undefined` for the very first sync of a journal.
     */
    previousRemoteSalt?: string,
    signal?: AbortSignal,
    options?: SyncOptions,
  ): Promise<SyncResult> {
    const tracing = startSyncDebugTrace();
    let traceOutcome: 'completed' | 'failed' | 'cancelled' = 'failed';
    try {
      assertNotCancelled(signal);
      const result: SyncResult = {
        uploaded: [],
        downloaded: [],
        deleted: [],
        conflicts: [],
        warnings: [],
      };

      const loadedJournal = await this.local.getJournal(journalId, syncKey);
      recordSyncDebugPhase('local-journal-loaded');
      assertNotCancelled(signal);
      if (!loadedJournal) {
        traceOutcome = 'completed';
        return result;
      }
      // A sync must use one immutable view of local metadata/pages. In particular,
      // do not rebuild the final index from a second getJournal call: a page saved
      // while attachment/page upload is in flight was not uploaded by this run and
      // must remain dirty for the next one.
      const localJournal = safeJsonParse<JournalContent>(
        JSON.stringify(loadedJournal),
        `journal:${journalId} sync snapshot`,
      );

      // Compare local salt and encrypted-flag with remote registry. When they differ
      // we must determine whether the local user just changed the password (push) or
      // another device changed it (abort to avoid corrupting remote with stale data).
      const remoteJournals = await this.remote.listRemoteJournals();
      assertNotCancelled(signal);
      const remoteJournal = remoteJournals.find((j) => j.id === journalId);
      const saltMismatch =
        remoteJournal != null &&
        remoteJournal.salt != null &&
        localJournal.salt != null &&
        remoteJournal.salt !== localJournal.salt;

      if (saltMismatch && previousRemoteSalt != null) {
        // We have history. Use it to disambiguate who changed the salt.
        const localChanged = localJournal.salt !== previousRemoteSalt;
        const remoteChanged = remoteJournal!.salt !== previousRemoteSalt;

        if (!localChanged && remoteChanged) {
          // Local hasn't changed since last sync, but remote differs — another
          // device rotated the key. Aborting prevents us from clobbering the
          // remote with our stale data.
          throw new Error(
            `Sync aborted: the password for "${localJournal.title}" was changed on another ` +
              `device. Remove this journal locally and re-import it from cloud to continue syncing.`,
          );
        }
        if (localChanged && remoteChanged) {
          // Both sides diverged from the last-known state — conflict, can't auto-resolve.
          throw new Error(
            `Sync aborted: the password for "${localJournal.title}" was changed on another ` +
              `device AND locally (conflict). Remove this journal locally and re-import.`,
          );
        }
        // Otherwise: localChanged=true && remoteChanged=false → local rotated key, push it.
      }
      // Note: encrypted-flag mismatch without salt-mismatch is not normally possible
      // (adding/removing a password always generates a new salt — see JournalSettings.tsx).
      // If it does occur, we fall through to push behaviour (no worse than the original
      // engine, and this corner case is not the one the cross-device bug exposes).
      const keyChanged = saltMismatch;
      // Password/key changes must stay atomic. A bounded web run is permitted
      // only when it cannot publish pages under a new registry salt.
      const chunkBudget =
        !keyChanged && options?.newChunkUploadBudget != null
          ? new NewChunkUploadBudget(options.newChunkUploadBudget)
          : undefined;

      // A changed password/sync key is an all-or-nothing remote transition. Do
      // this metadata-only preflight before uploading *any* page/chunk so an old
      // key remains published when a legacy/generation-less attachment is
      // deferred. The user can then resolve the warning without losing peer
      // access to the previously published journal.
      if (keyChanged) {
        for (const page of localJournal.pages) {
          if (page.deleted) continue;
          if (!(await this.canUploadPageAttachments(page, result.warnings))) return result;
        }
      }

      // Build local page map
      const localPages = new Map(localJournal.pages.map((p) => [p.id, p]));

      // Download remote sync index for timestamp comparison (no decryption needed)
      const remoteIndex = (await this.remote.downloadSyncIndex(journalId)) ?? {};
      assertNotCancelled(signal);

      // A key rotation cannot publish a new salt while a non-deleted remote-only
      // page remains encrypted with the old key. Fetching it with the new key
      // would fail, and publishing the registry would strand it for peers.
      // This check is deliberately after the index download but before any page
      // or metadata write, so the previous remote key remains authoritative.
      if (keyChanged && previousRemoteSalt != null) {
        const remoteOnlyPageId = Object.entries(remoteIndex).find(
          ([pageId, entry]) => !localPages.has(pageId) && !entry.deleted,
        )?.[0];
        if (remoteOnlyPageId) {
          throw new Error(
            `Sync aborted: password rotation requires remote page ${remoteOnlyPageId} to be ` +
              'available locally before publishing the new key.',
          );
        }
      }

      // Resolve exact existing chunk IDs once for only the pages this invocation
      // will upload. This avoids a Drive search before every bounded chunk request.
      if (this.remote.prepareAttachmentChunkUploads && !chunkBudget) {
        const attachmentsToUpload = localJournal.pages
          .filter((page) => {
            const remoteEntry = remoteIndex[page.id];
            return (
              !page.deleted &&
              (!remoteEntry ||
                (!remoteEntry.deleted && (keyChanged || page.modified > remoteEntry.modified)))
            );
          })
          .flatMap((page) => pageAttachments(page))
          .filter(
            (attachment) =>
              attachment.content?.format === 'canto-chunked-v1' &&
              !!attachment.content.generation &&
              !this.remote.isRemotePath(attachment.path),
          );
        if (attachmentsToUpload.length > 0) {
          await this.remote.prepareAttachmentChunkUploads(journalId, attachmentsToUpload, signal);
          assertNotCancelled(signal);
        }
      }

      // Determine sync actions for each page
      const allPageIds = new Set([...localPages.keys(), ...Object.keys(remoteIndex)]);
      // Start from the remote snapshot. Entries are replaced only after this
      // invocation has durably published the matching local snapshot page. This
      // also retains remote pages whose payload or attachments could not be
      // downloaded, instead of incorrectly removing/overwriting their index row.
      const nextIndex: SyncIndex = { ...remoteIndex };
      const publishSnapshotEntry = (page: Page) => {
        nextIndex[page.id] = {
          modified: page.modified,
          ...(page.deleted ? { deleted: true } : {}),
        };
      };
      const mergeLatestRemoteIndex = (latest: SyncIndex) => {
        for (const [pageId, latestEntry] of Object.entries(latest)) {
          const pendingEntry = nextIndex[pageId];
          if (
            !pendingEntry ||
            latestEntry.modified > pendingEntry.modified ||
            (latestEntry.modified === pendingEntry.modified &&
              latestEntry.deleted === true &&
              pendingEntry.deleted !== true)
          ) {
            nextIndex[pageId] = latestEntry;
          }
        }
      };
      const uploadMergedSyncIndex = async () => {
        // Re-read immediately before every index write so a concurrently
        // published page is retained. The provider still owns conditional
        // update semantics; this merge prevents a checkpoint from blindly
        // replacing entries that arrived since this run's initial snapshot.
        const latest = (await this.remote.downloadSyncIndex(journalId)) ?? {};
        assertNotCancelled(signal);
        mergeLatestRemoteIndex(latest);
        await this.remote.uploadSyncIndex(journalId, nextIndex);
        assertNotCancelled(signal);
      };
      const checkpointCompletedPage = async (): Promise<boolean> => {
        if (!chunkBudget) return false;
        // The index is the publication boundary. Each completed page is
        // durable before this renderer can stop; partial generations never
        // receive an index entry.
        await uploadMergedSyncIndex();
        if (!chunkBudget.exhausted) return false;
        result.checkpointed = true;
        traceOutcome = 'completed';
        return true;
      };
      const total = allPageIds.size;
      let current = 0;

      for (const pageId of allPageIds) {
        assertNotCancelled(signal);
        onProgress?.(++current, total);
        const localPage = localPages.get(pageId);
        const remoteEntry = remoteIndex[pageId];

        if (localPage && !remoteEntry) {
          // Local only: retain an unsynced deletion marker but never upload its page.
          if (localPage.deleted) {
            publishSnapshotEntry(localPage);
            continue;
          }
          const attachmentOutcome = await this.uploadPageAttachments(
            journalId,
            localPage,
            syncKey,
            result.warnings,
            signal,
            chunkBudget,
            options?.restartPartialUploadChunkSize,
            options?.onChunkUploadWorkStarted,
          );
          if (!attachmentOutcome.complete) {
            if (attachmentOutcome.checkpointed) {
              result.checkpointed = true;
              traceOutcome = 'completed';
              return result;
            }
            continue;
          }
          assertNotCancelled(signal);
          const encrypted = await aesGcmEncrypt(JSON.stringify(localPage), syncKey);
          assertNotCancelled(signal);
          await this.remote.uploadPage(journalId, pageId, encrypted);
          assertNotCancelled(signal);
          publishSnapshotEntry(localPage);
          result.uploaded.push(pageId);
          if (await checkpointCompletedPage()) return result;
        } else if (!localPage && remoteEntry) {
          // Remote only: download
          if (remoteEntry.deleted) continue;
          try {
            const encryptedPage = await this.remote.downloadPage(journalId, pageId);
            if (encryptedPage) {
              const decrypted = await aesGcmDecrypt(encryptedPage, syncKey);
              const downloaded = safeJsonParse<Page>(decrypted, `page:${pageId}`);
              if (
                !(await this.downloadPageAttachments(
                  journalId,
                  downloaded,
                  syncKey,
                  result.warnings,
                  signal,
                ))
              ) {
                continue;
              }
              assertNotCancelled(signal);
              await this.local.savePage(journalId, downloaded, syncKey, true);
              assertNotCancelled(signal);
              result.downloaded.push(pageId);
            }
          } catch (err) {
            if (isSyncCancelledError(err)) throw err;
            console.warn(`[Sync] Failed to download page ${pageId}:`, err);
          }
        } else if (localPage && remoteEntry) {
          // Both exist: compare timestamps
          if (localPage.deleted && remoteEntry.deleted) {
            // Both deleted — retain the snapshot deletion marker.
            publishSnapshotEntry(localPage);
            result.deleted.push(pageId);
          } else if (localPage.deleted) {
            // Locally deleted, remote still exists: propagate deletion
            await this.remote.deletePage(journalId, pageId);
            assertNotCancelled(signal);
            publishSnapshotEntry(localPage);
            result.deleted.push(pageId);
          } else if (remoteEntry.deleted) {
            // Remotely deleted, local still exists: propagate deletion
            await this.local.deletePage(journalId, pageId, syncKey);
            assertNotCancelled(signal);
            result.deleted.push(pageId);
          } else if (keyChanged) {
            // Key changed: force re-upload with new encryption key. Batching
            // is intentionally disabled for this all-or-nothing transition.
            const attachmentOutcome = await this.uploadPageAttachments(
              journalId,
              localPage,
              syncKey,
              result.warnings,
              signal,
            );
            if (!attachmentOutcome.complete) continue;
            assertNotCancelled(signal);
            const encrypted = await aesGcmEncrypt(JSON.stringify(localPage), syncKey);
            assertNotCancelled(signal);
            await this.remote.uploadPage(journalId, pageId, encrypted);
            assertNotCancelled(signal);
            publishSnapshotEntry(localPage);
            result.uploaded.push(pageId);
          } else if (localPage.modified === remoteEntry.modified) {
            // In sync, nothing to do
          } else if (localPage.modified > remoteEntry.modified) {
            // Local is newer: upload
            const attachmentOutcome = await this.uploadPageAttachments(
              journalId,
              localPage,
              syncKey,
              result.warnings,
              signal,
              chunkBudget,
              options?.restartPartialUploadChunkSize,
              options?.onChunkUploadWorkStarted,
            );
            if (!attachmentOutcome.complete) {
              if (attachmentOutcome.checkpointed) {
                result.checkpointed = true;
                traceOutcome = 'completed';
                return result;
              }
              continue;
            }
            assertNotCancelled(signal);
            const encrypted = await aesGcmEncrypt(JSON.stringify(localPage), syncKey);
            assertNotCancelled(signal);
            await this.remote.uploadPage(journalId, pageId, encrypted);
            assertNotCancelled(signal);
            publishSnapshotEntry(localPage);
            // Retain prior published generations: see the race-safety note above.
            result.uploaded.push(pageId);
            if (await checkpointCompletedPage()) return result;
          } else {
            // Remote is newer: download
            try {
              const encryptedPage = await this.remote.downloadPage(journalId, pageId);
              if (encryptedPage) {
                const decrypted = await aesGcmDecrypt(encryptedPage, syncKey);
                const downloaded = safeJsonParse<Page>(decrypted, `page:${pageId}`);
                if (
                  !(await this.downloadPageAttachments(
                    journalId,
                    downloaded,
                    syncKey,
                    result.warnings,
                    signal,
                  ))
                ) {
                  continue;
                }
                assertNotCancelled(signal);
                await this.local.savePage(journalId, downloaded, syncKey, true);
                assertNotCancelled(signal);
                result.downloaded.push(pageId);
              }
            } catch (err) {
              if (isSyncCancelledError(err)) throw err;
              console.warn(`[Sync] Failed to download page ${pageId}:`, err);
            }
          }
        }
      }

      // Upload encrypted journal metadata + registry LAST. Doing this after
      // page re-uploads ensures atomic-ish key rotation: if the sync is
      // interrupted mid-upload, the remote registry still has the old salt and
      // the next sync will re-detect the key change and retry. Updating the
      // registry first would leave the remote in a corrupted state (registry
      // says "use new key" but pages are still encrypted with the old key).
      assertNotCancelled(signal);
      const { pages, ...metaWithoutPages } = localJournal;
      void pages;
      const encryptedMeta = await aesGcmEncrypt(JSON.stringify(metaWithoutPages), syncKey);
      assertNotCancelled(signal);
      await this.remote.uploadJournalMeta(journalId, encryptedMeta, {
        title: localJournal.title,
        encrypted: localJournal.secure,
        salt: localJournal.salt,
        kdfIterations: localJournal.kdfIterations,
      });
      assertNotCancelled(signal);
      await uploadMergedSyncIndex();

      traceOutcome = 'completed';
      return result;
    } catch (error) {
      traceOutcome = isSyncCancelledError(error) ? 'cancelled' : 'failed';
      throw error;
    } finally {
      if (tracing) finishSyncDebugTrace(traceOutcome);
    }
  }

  /**
   * Sync all journals.
   * @param getKey - lookup function for per-journal sync keys (required for all journals)
   */
  async syncAll(getKey: (journalId: string) => Uint8Array | undefined): Promise<SyncResult[]> {
    const journals = await this.local.listJournals();
    const results: SyncResult[] = [];

    for (const journal of journals) {
      const syncKey = getKey(journal.id);
      if (!syncKey) {
        console.warn(`[Sync] No sync key for journal ${journal.id}, skipping`);
        continue;
      }
      const result = await this.sync(journal.id, syncKey);
      results.push(result);
    }

    return results;
  }
}
