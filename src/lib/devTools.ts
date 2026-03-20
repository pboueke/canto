import { getLocalStore, getEncryptionService } from '@/hooks/useStorage';
import { generateUUID, uint8ToBase64 } from '@/lib/encryption/utils';
import { DEFAULT_JOURNAL_SETTINGS, SCHEMA_VERSION } from '@/data';
import type { JournalContent, Page, Attachment } from '@/data';

/**
 * Duplicate a journal N times (deep copy with new IDs, including pages and attachments).
 */
export async function duplicateJournal(
  sourceId: string,
  derivedKey?: Uint8Array,
  count = 1,
): Promise<string[]> {
  const store = await getLocalStore();
  const source = await store.getJournal(sourceId, derivedKey);
  if (!source) throw new Error(`Journal ${sourceId} not found`);

  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const newJournalId = generateUUID();
    const now = new Date().toISOString();

    const newPages: Page[] = [];
    for (const page of source.pages.filter((p) => !p.deleted)) {
      const newPageId = generateUUID();
      const newImages: Attachment[] = [];
      const newFiles: Attachment[] = [];

      // Copy images
      for (const img of page.images.filter((a) => !a.deleted)) {
        const data = await store.getAttachment(img.path, img.encrypted ? derivedKey : undefined);
        if (data) {
          const newAttachment: Attachment = {
            ...img,
            id: generateUUID(),
            path: '',
          };
          const path = await store.saveAttachment(
            newJournalId,
            newPageId,
            newAttachment,
            data,
            img.encrypted ? derivedKey : undefined,
          );
          newAttachment.path = path;
          newImages.push(newAttachment);
        }
      }

      // Copy files
      for (const file of page.files.filter((a) => !a.deleted)) {
        const data = await store.getAttachment(file.path, file.encrypted ? derivedKey : undefined);
        if (data) {
          const newAttachment: Attachment = {
            ...file,
            id: generateUUID(),
            path: '',
          };
          const path = await store.saveAttachment(
            newJournalId,
            newPageId,
            newAttachment,
            data,
            file.encrypted ? derivedKey : undefined,
          );
          newAttachment.path = path;
          newFiles.push(newAttachment);
        }
      }

      newPages.push({
        ...page,
        id: newPageId,
        images: newImages,
        files: newFiles,
        modified: Date.now(),
      });
    }

    const newJournal: JournalContent = {
      ...source,
      id: newJournalId,
      title: `${source.title} (copy ${i + 1})`,
      date: now,
      pages: newPages,
    };

    await store.saveJournal(newJournal, derivedKey);
    ids.push(newJournalId);
  }

  return ids;
}

/**
 * Duplicate a specific page N times within the same journal.
 */
export async function duplicatePage(
  journalId: string,
  pageId: string,
  derivedKey?: Uint8Array,
  count = 1,
): Promise<string[]> {
  const store = await getLocalStore();
  const page = await store.getPage(journalId, pageId, derivedKey);
  if (!page) throw new Error(`Page ${pageId} not found`);

  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const newPageId = generateUUID();
    const newImages: Attachment[] = [];
    const newFiles: Attachment[] = [];

    for (const img of page.images.filter((a) => !a.deleted)) {
      const data = await store.getAttachment(img.path, img.encrypted ? derivedKey : undefined);
      if (data) {
        const newAttachment: Attachment = { ...img, id: generateUUID(), path: '' };
        const path = await store.saveAttachment(
          journalId,
          newPageId,
          newAttachment,
          data,
          img.encrypted ? derivedKey : undefined,
        );
        newAttachment.path = path;
        newImages.push(newAttachment);
      }
    }

    for (const file of page.files.filter((a) => !a.deleted)) {
      const data = await store.getAttachment(file.path, file.encrypted ? derivedKey : undefined);
      if (data) {
        const newAttachment: Attachment = { ...file, id: generateUUID(), path: '' };
        const path = await store.saveAttachment(
          journalId,
          newPageId,
          newAttachment,
          data,
          file.encrypted ? derivedKey : undefined,
        );
        newAttachment.path = path;
        newFiles.push(newAttachment);
      }
    }

    const newPage: Page = {
      ...page,
      id: newPageId,
      images: newImages,
      files: newFiles,
      modified: Date.now(),
    };

    await store.savePage(journalId, newPage, derivedKey);
    ids.push(newPageId);
  }

  return ids;
}

/**
 * Generate N empty journals with default settings.
 */
export async function generateBlankJournals(count = 1): Promise<string[]> {
  const store = await getLocalStore();
  const encryption = getEncryptionService();
  const ids: string[] = [];

  for (let i = 0; i < count; i++) {
    const journalId = generateUUID();
    const saltBytes = encryption.generateSalt();
    const salt = uint8ToBase64(saltBytes);

    const journal: JournalContent = {
      id: journalId,
      title: `Test Journal ${i + 1}`,
      icon: 'book',
      date: new Date().toISOString(),
      secure: false,
      salt,
      pages: [],
      settings: { ...DEFAULT_JOURNAL_SETTINGS },
      schemaVersion: SCHEMA_VERSION,
      version: 1,
    };

    await store.saveJournal(journal);
    ids.push(journalId);
  }

  return ids;
}

/**
 * Generate N blank pages in a journal with random dates within the past year.
 */
export async function generateBlankPages(
  journalId: string,
  count = 1,
  derivedKey?: Uint8Array,
): Promise<string[]> {
  const store = await getLocalStore();
  const ids: string[] = [];

  const now = Date.now();
  const oneYear = 365 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const pageId = generateUUID();
    const randomDate = new Date(now - Math.random() * oneYear);

    const page: Page = {
      id: pageId,
      text: '',
      date: randomDate.toISOString(),
      tags: [],
      files: [],
      images: [],
      comments: [],
      modified: Date.now(),
      deleted: false,
    };

    await store.savePage(journalId, page, derivedKey);
    ids.push(pageId);
  }

  return ids;
}

/**
 * Delete all journals, pages, and attachments from the device.
 */
export async function wipeAllData(): Promise<void> {
  const store = await getLocalStore();
  const journals = await store.listJournals();
  for (const journal of journals) {
    await store.deleteJournal(journal.id);
  }
}
