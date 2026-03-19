import type { LocalStore } from '@/lib/storage/types';
import type { RemoteStore, SyncResult } from './types';

export class SyncEngine {
  constructor(
    private local: LocalStore,
    private remote: RemoteStore,
  ) {}

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
        await this.remote.uploadPage(journalId, localPage);
        result.uploaded.push(pageId);
      } else if (!localPage && remotePage) {
        // Remote only: download
        if (remotePage.deleted) continue; // don't download deleted pages
        const downloaded = await this.remote.downloadPage(journalId, pageId);
        if (downloaded) {
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
          await this.remote.uploadPage(journalId, localPage);
          result.uploaded.push(pageId);
        } else {
          // Remote is newer: download
          const downloaded = await this.remote.downloadPage(journalId, pageId);
          if (downloaded) {
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
