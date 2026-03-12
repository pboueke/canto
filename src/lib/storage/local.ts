import { Paths, File, Directory } from 'expo-file-system';
import type { Journal, JournalContent, Page, Attachment } from '@/models';
import type { EncryptionService } from '@/lib/encryption';
import type { LocalStore } from './types';

const BASE_DIR_NAME = 'canto';
const JOURNALS_INDEX_NAME = 'journals.json';

function getBaseDir(): Directory {
  return new Directory(Paths.document, BASE_DIR_NAME);
}

function getJournalDir(journalId: string): Directory {
  return new Directory(getBaseDir(), journalId);
}

function getPagesDir(journalId: string): Directory {
  return new Directory(getJournalDir(journalId), 'pages');
}

function getAttachmentsDir(journalId: string): Directory {
  return new Directory(getJournalDir(journalId), 'attachments');
}

function getMetadataFile(journalId: string): File {
  return new File(getJournalDir(journalId), 'metadata.json');
}

function getPageFile(journalId: string, pageId: string): File {
  return new File(getPagesDir(journalId), `${pageId}.json`);
}

function getJournalsIndexFile(): File {
  return new File(getBaseDir(), JOURNALS_INDEX_NAME);
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function getAttachmentFile(journalId: string, pageId: string, attachment: Attachment): File {
  const prefix = attachment.type === 'image' ? 'img' : 'fl';
  const ext = attachment.name.split('.').pop() ?? 'bin';
  const hash = hashCode(attachment.name);
  return new File(getAttachmentsDir(journalId), `${prefix}-${pageId}-${hash}.${ext}`);
}

function ensureDir(dir: Directory): void {
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
}

async function readEncrypted(file: File, encryption: EncryptionService): Promise<string | null> {
  if (!file.exists) return null;
  const ciphertext = await file.text();
  return encryption.decrypt(ciphertext);
}

async function writeEncrypted(
  file: File,
  data: string,
  encryption: EncryptionService,
): Promise<void> {
  const ciphertext = await encryption.encrypt(data);
  if (!file.exists) {
    file.create({ intermediates: true });
  }
  file.write(ciphertext);
}

interface JournalIndex {
  journals: Journal[];
}

export function createLocalStore(encryption: EncryptionService): LocalStore {
  async function readIndex(): Promise<JournalIndex> {
    const file = getJournalsIndexFile();
    const raw = await readEncrypted(file, encryption);
    if (!raw) return { journals: [] };
    return JSON.parse(raw) as JournalIndex;
  }

  async function writeIndex(index: JournalIndex): Promise<void> {
    const file = getJournalsIndexFile();
    await writeEncrypted(file, JSON.stringify(index), encryption);
  }

  return {
    async initialize(): Promise<void> {
      ensureDir(getBaseDir());
    },

    async listJournals(): Promise<Journal[]> {
      const index = await readIndex();
      return index.journals;
    },

    async getJournal(id: string): Promise<JournalContent | null> {
      const metaFile = getMetadataFile(id);
      const raw = await readEncrypted(metaFile, encryption);
      if (!raw) return null;

      const metadata = JSON.parse(raw) as Omit<JournalContent, 'pages'>;

      const pagesDirectory = getPagesDir(id);
      const pages: Page[] = [];

      if (pagesDirectory.exists) {
        const entries = pagesDirectory.list();
        for (const entry of entries) {
          if (entry instanceof File && entry.uri.endsWith('.json')) {
            const pageRaw = await readEncrypted(entry, encryption);
            if (pageRaw) {
              pages.push(JSON.parse(pageRaw) as Page);
            }
          }
        }
      }

      return { ...metadata, pages };
    },

    async saveJournal(journal: JournalContent): Promise<void> {
      ensureDir(getJournalDir(journal.id));
      ensureDir(getPagesDir(journal.id));
      ensureDir(getAttachmentsDir(journal.id));

      // Save metadata (without pages to avoid duplication)
      const { pages, ...metadata } = journal;
      await writeEncrypted(getMetadataFile(journal.id), JSON.stringify(metadata), encryption);

      // Save each page
      for (const page of pages) {
        await writeEncrypted(getPageFile(journal.id, page.id), JSON.stringify(page), encryption);
      }

      // Update index
      const index = await readIndex();
      const entry: Journal = {
        id: journal.id,
        title: journal.title,
        icon: journal.icon,
        date: journal.date,
        secure: journal.secure,
      };

      const existing = index.journals.findIndex((j) => j.id === journal.id);
      if (existing >= 0) {
        index.journals[existing] = entry;
      } else {
        index.journals.push(entry);
      }
      await writeIndex(index);
    },

    async deleteJournal(id: string): Promise<void> {
      const dir = getJournalDir(id);
      if (dir.exists) {
        dir.delete();
      }

      const index = await readIndex();
      index.journals = index.journals.filter((j) => j.id !== id);
      await writeIndex(index);
    },

    async getPage(journalId: string, pageId: string): Promise<Page | null> {
      const file = getPageFile(journalId, pageId);
      const raw = await readEncrypted(file, encryption);
      if (!raw) return null;
      return JSON.parse(raw) as Page;
    },

    async savePage(journalId: string, page: Page): Promise<void> {
      ensureDir(getPagesDir(journalId));
      const updated = { ...page, modified: Date.now() };
      await writeEncrypted(getPageFile(journalId, page.id), JSON.stringify(updated), encryption);
    },

    async deletePage(journalId: string, pageId: string): Promise<void> {
      const page = await this.getPage(journalId, pageId);
      if (!page) return;

      // Soft delete: mark as deleted, update modified timestamp
      const deleted = { ...page, deleted: true, modified: Date.now() };
      await writeEncrypted(getPageFile(journalId, pageId), JSON.stringify(deleted), encryption);
    },

    async saveAttachment(
      journalId: string,
      pageId: string,
      attachment: Attachment,
      data: string,
    ): Promise<string> {
      ensureDir(getAttachmentsDir(journalId));
      const file = getAttachmentFile(journalId, pageId, attachment);

      const encrypted = await encryption.encrypt(data);
      if (!file.exists) {
        file.create({ intermediates: true });
      }
      file.write(encrypted);

      return file.uri;
    },

    async getAttachment(path: string): Promise<string | null> {
      const file = new File(path);
      if (!file.exists) return null;

      const encrypted = await file.text();
      return encryption.decrypt(encrypted);
    },

    async deleteAttachment(path: string): Promise<void> {
      const file = new File(path);
      if (file.exists) {
        file.delete();
      }
    },
  };
}
