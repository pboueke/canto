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
  ): Promise<SyncResult> {
    const result: SyncResult = {
      uploaded: [],
      downloaded: [],
      deleted: [],
      conflicts: [],
    };

    const localJournal = await this.local.getJournal(journalId, syncKey);
    if (!localJournal) return result;

    // Upload encrypted journal metadata
    const { pages: _pages, ...metaWithoutPages } = localJournal;
    const encryptedMeta = await aesGcmEncrypt(JSON.stringify(metaWithoutPages), syncKey);
    await this.remote.uploadJournalMeta(journalId, encryptedMeta, {
      title: localJournal.title,
      encrypted: localJournal.secure,
      salt: localJournal.salt,
    });

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
        if (remoteEntry.deleted) continue; // don't download deleted pages
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

    // Upload sync index with current state of all pages (local + downloaded)
    const updatedJournal = await this.local.getJournal(journalId, syncKey);
    if (updatedJournal) {
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
