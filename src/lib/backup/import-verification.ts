import type { JournalContent } from 'canto-data';
import type { LocalStore } from '@/lib/storage';

/**
 * Confirm the just-published import without reopening every page file when the
 * storage adapter provides its encrypted preview catalog.
 */
export async function verifyImportedJournal(
  store: LocalStore,
  journal: JournalContent,
  derivedKey?: Uint8Array,
): Promise<void> {
  let metadata: Omit<JournalContent, 'pages'> | undefined;
  let pageCount: number | undefined;

  if (store.getJournalOverview) {
    const overview = await store.getJournalOverview(journal.id, derivedKey);
    metadata = overview?.metadata;
    pageCount = overview?.pages.length;
  } else {
    // Compatibility with test and third-party storage adapters that predate
    // the catalog. Production adapters implement the bounded path above.
    const persisted = await store.getJournal(journal.id, derivedKey);
    if (persisted) {
      const { pages, ...persistedMetadata } = persisted;
      void pages;
      metadata = persistedMetadata;
      pageCount = persisted.pages.length;
    }
  }

  const isValid =
    metadata !== undefined &&
    metadata.id === journal.id &&
    metadata.title === journal.title &&
    JSON.stringify(metadata.settings) === JSON.stringify(journal.settings) &&
    pageCount === journal.pages.length;
  if (!isValid) throw new Error('saved journal did not match the imported journal');
}
