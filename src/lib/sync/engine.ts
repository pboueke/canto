import type { Page, Attachment, JournalContent } from 'canto-data';
import type { LocalStore } from '@/lib/storage/types';
import type { RemoteStore, SyncResult, SyncIndex } from './types';
import { aesGcmEncrypt, aesGcmDecrypt } from '@/lib/encryption/utils';
import { safeJsonParse } from '@/lib/utils/json';

const CONCURRENCY = 4;

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

/** Build a SyncIndex from a list of pages. */
function buildSyncIndex(pages: Page[]): SyncIndex {
  const index: SyncIndex = {};
  for (const p of pages) {
    index[p.id] = { modified: p.modified, ...(p.deleted ? { deleted: true } : {}) };
  }
  return index;
}

export class SyncEngine {
  constructor(
    private local: LocalStore,
    private remote: RemoteStore,
  ) {}

  /** Upload all attachments for a page, encrypting with syncKey. */
  private async uploadPageAttachments(
    journalId: string,
    page: Page,
    syncKey: Uint8Array,
  ): Promise<void> {
    const atts = pageAttachments(page).filter((a) => !this.remote.isRemotePath(a.path));
    await parallel(atts, async (att) => {
      const data = await this.local.getAttachment(att.path);
      if (!data) {
        console.warn(`[Sync] Missing local attachment: ${att.path} (page ${page.id})`);
        return;
      }
      const encrypted = await aesGcmEncrypt(data, syncKey);
      await this.remote.uploadAttachment(journalId, att.path, encrypted);
    });
  }

  /** Download all attachments for a page from remote, decrypting with syncKey. */
  private async downloadPageAttachments(
    journalId: string,
    page: Page,
    syncKey: Uint8Array,
  ): Promise<void> {
    const atts = pageAttachments(page);
    await parallel(atts, async (att) => {
      const filename = filenameFromPath(att.path);
      const remotePath = this.remote.buildRemotePath(journalId, filename);
      const encrypted = await this.remote.downloadAttachment(remotePath);
      if (!encrypted) {
        throw new Error(`[Sync] Attachment not found on remote: ${remotePath} (page ${page.id})`);
      }
      const data = await aesGcmDecrypt(encrypted, syncKey);
      const localPath = await this.local.saveAttachment(journalId, page.id, att, data);
      att.path = localPath;
    });
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
  ): Promise<SyncResult> {
    const result: SyncResult = {
      uploaded: [],
      downloaded: [],
      deleted: [],
      conflicts: [],
    };

    const localJournal = await this.local.getJournal(journalId, syncKey);
    if (!localJournal) return result;

    // Compare local salt and encrypted-flag with remote registry. When they differ
    // we must determine whether the local user just changed the password (push) or
    // another device changed it (abort to avoid corrupting remote with stale data).
    const remoteJournals = await this.remote.listRemoteJournals();
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

    // Build local page map
    const localPages = new Map(localJournal.pages.map((p) => [p.id, p]));

    // Download remote sync index for timestamp comparison (no decryption needed)
    const remoteIndex = (await this.remote.downloadSyncIndex(journalId)) ?? {};

    // Determine sync actions for each page
    const allPageIds = new Set([...localPages.keys(), ...Object.keys(remoteIndex)]);
    const total = allPageIds.size;
    let current = 0;

    for (const pageId of allPageIds) {
      onProgress?.(++current, total);
      const localPage = localPages.get(pageId);
      const remoteEntry = remoteIndex[pageId];

      if (localPage && !remoteEntry) {
        // Local only: upload
        if (localPage.deleted) continue; // don't upload deleted pages that were never synced
        await this.uploadPageAttachments(journalId, localPage, syncKey);
        const encrypted = await aesGcmEncrypt(JSON.stringify(localPage), syncKey);
        await this.remote.uploadPage(journalId, pageId, encrypted);
        result.uploaded.push(pageId);
      } else if (!localPage && remoteEntry) {
        // Remote only: download
        if (remoteEntry.deleted) continue;
        try {
          const encryptedPage = await this.remote.downloadPage(journalId, pageId);
          if (encryptedPage) {
            const decrypted = await aesGcmDecrypt(encryptedPage, syncKey);
            const downloaded = safeJsonParse<Page>(decrypted, `page:${pageId}`);
            await this.downloadPageAttachments(journalId, downloaded, syncKey);
            await this.local.savePage(journalId, downloaded, syncKey, true);
            result.downloaded.push(pageId);
          }
        } catch (err) {
          console.warn(`[Sync] Failed to download page ${pageId}:`, err);
        }
      } else if (localPage && remoteEntry) {
        // Both exist: compare timestamps
        if (localPage.deleted && remoteEntry.deleted) {
          // Both deleted — clean up
          result.deleted.push(pageId);
        } else if (localPage.deleted) {
          // Locally deleted, remote still exists: propagate deletion
          await this.remote.deletePage(journalId, pageId);
          result.deleted.push(pageId);
        } else if (remoteEntry.deleted) {
          // Remotely deleted, local still exists: propagate deletion
          await this.local.deletePage(journalId, pageId, syncKey);
          result.deleted.push(pageId);
        } else if (keyChanged) {
          // Key changed: force re-upload with new encryption key
          await this.uploadPageAttachments(journalId, localPage, syncKey);
          const encrypted = await aesGcmEncrypt(JSON.stringify(localPage), syncKey);
          await this.remote.uploadPage(journalId, pageId, encrypted);
          result.uploaded.push(pageId);
        } else if (localPage.modified === remoteEntry.modified) {
          // In sync, nothing to do
        } else if (localPage.modified > remoteEntry.modified) {
          // Local is newer: upload
          await this.uploadPageAttachments(journalId, localPage, syncKey);
          const encrypted = await aesGcmEncrypt(JSON.stringify(localPage), syncKey);
          await this.remote.uploadPage(journalId, pageId, encrypted);
          result.uploaded.push(pageId);
        } else {
          // Remote is newer: download
          try {
            const encryptedPage = await this.remote.downloadPage(journalId, pageId);
            if (encryptedPage) {
              const decrypted = await aesGcmDecrypt(encryptedPage, syncKey);
              const downloaded = safeJsonParse<Page>(decrypted, `page:${pageId}`);
              await this.downloadPageAttachments(journalId, downloaded, syncKey);
              await this.local.savePage(journalId, downloaded, syncKey, true);
              result.downloaded.push(pageId);
            }
          } catch (err) {
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
    const updatedJournal = await this.local.getJournal(journalId, syncKey);
    if (updatedJournal) {
      const { pages: _pages, ...metaWithoutPages } = updatedJournal;
      const encryptedMeta = await aesGcmEncrypt(JSON.stringify(metaWithoutPages), syncKey);
      await this.remote.uploadJournalMeta(journalId, encryptedMeta, {
        title: updatedJournal.title,
        encrypted: updatedJournal.secure,
        salt: updatedJournal.salt,
        kdfIterations: updatedJournal.kdfIterations,
      });

      // Upload sync index with current state of all pages (local + downloaded)
      await this.remote.uploadSyncIndex(journalId, buildSyncIndex(updatedJournal.pages));
    }

    return result;
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
