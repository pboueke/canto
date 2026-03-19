import type { Page, Attachment } from '@/models';
import type { LocalStore } from '@/lib/storage/types';
import type { RemoteStore, SyncResult } from './types';

const CONCURRENCY = 4;

/** Run async tasks with bounded concurrency. */
async function parallel<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = CONCURRENCY,
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
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

  /** Upload all attachments for a page that are stored locally. */
  private async uploadPageAttachments(journalId: string, page: Page): Promise<void> {
    const atts = pageAttachments(page).filter((a) => !this.remote.isRemotePath(a.path));
    await parallel(atts, async (att) => {
      // Read without derivedKey: strips device encryption, preserves password layer
      const data = await this.local.getAttachment(att.path);
      if (data) {
        await this.remote.uploadAttachment(journalId, att.path, data);
      }
    });
  }

  /** Download all attachments for a page from remote and update paths to local. */
  private async downloadPageAttachments(journalId: string, page: Page): Promise<void> {
    const atts = pageAttachments(page);
    await parallel(atts, async (att) => {
      const filename = filenameFromPath(att.path);
      const remotePath = this.remote.buildRemotePath(journalId, filename);
      const data = await this.remote.downloadAttachment(remotePath);
      if (data) {
        // Save without derivedKey: applies device encryption only, password layer preserved in data
        const localPath = await this.local.saveAttachment(journalId, page.id, att, data);
        att.path = localPath;
      }
    });
  }

  /**
   * Sync a single journal between local and remote.
   * Strategy: last-write-wins based on `modified` timestamps.
   * Deleted pages are synced as deletions (soft-delete propagation).
   */
  async sync(
    journalId: string,
    derivedKey?: Uint8Array,
    onProgress?: (current: number, total: number) => void,
  ): Promise<SyncResult> {
    const result: SyncResult = {
      uploaded: [],
      downloaded: [],
      deleted: [],
      conflicts: [],
    };

    const localJournal = await this.local.getJournal(journalId, derivedKey);
    if (!localJournal) return result;

    // Upload journal metadata
    await this.remote.uploadJournalMeta(localJournal);

    // Build maps of local and remote pages by ID
    const localPages = new Map(localJournal.pages.map((p) => [p.id, p]));

    const remoteJournal = await this.remote.downloadJournalMeta(journalId);
    const remotePages = new Map((remoteJournal?.pages ?? []).map((p) => [p.id, p]));

    // Determine sync actions for each page
    const allPageIds = new Set([...localPages.keys(), ...remotePages.keys()]);
    const total = allPageIds.size;
    let current = 0;

    for (const pageId of allPageIds) {
      onProgress?.(++current, total);
      const localPage = localPages.get(pageId);
      const remotePage = remotePages.get(pageId);

      if (localPage && !remotePage) {
        // Local only: upload
        if (localPage.deleted) continue; // don't upload deleted pages that were never synced
        await this.uploadPageAttachments(journalId, localPage);
        await this.remote.uploadPage(journalId, localPage);
        result.uploaded.push(pageId);
      } else if (!localPage && remotePage) {
        // Remote only: download
        if (remotePage.deleted) continue; // don't download deleted pages
        const downloaded = await this.remote.downloadPage(journalId, pageId);
        if (downloaded) {
          await this.downloadPageAttachments(journalId, downloaded);
          await this.local.savePage(journalId, downloaded, derivedKey);
          result.downloaded.push(pageId);
        }
      } else if (localPage && remotePage) {
        // Both exist: compare timestamps
        if (localPage.deleted && remotePage.deleted) {
          // Both deleted — clean up
          result.deleted.push(pageId);
        } else if (localPage.deleted) {
          // Locally deleted, remote still exists: propagate deletion
          await this.remote.deletePage(journalId, pageId);
          result.deleted.push(pageId);
        } else if (remotePage.deleted) {
          // Remotely deleted, local still exists: propagate deletion
          await this.local.deletePage(journalId, pageId, derivedKey);
          result.deleted.push(pageId);
        } else if (localPage.modified === remotePage.modified) {
          // In sync, nothing to do
        } else if (localPage.modified > remotePage.modified) {
          // Local is newer: upload
          await this.uploadPageAttachments(journalId, localPage);
          await this.remote.uploadPage(journalId, localPage);
          result.uploaded.push(pageId);
        } else {
          // Remote is newer: download
          const downloaded = await this.remote.downloadPage(journalId, pageId);
          if (downloaded) {
            await this.downloadPageAttachments(journalId, downloaded);
            await this.local.savePage(journalId, downloaded, derivedKey);
            result.downloaded.push(pageId);
          }
        }
      }
    }

    return result;
  }

  /**
   * Sync all journals.
   */
  async syncAll(): Promise<SyncResult[]> {
    const journals = await this.local.listJournals();
    const results: SyncResult[] = [];

    for (const journal of journals) {
      const result = await this.sync(journal.id);
      results.push(result);
    }

    return results;
  }
}
