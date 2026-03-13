import { Paths, File, Directory } from 'expo-file-system';
import type { Journal, JournalContent, Page, Attachment } from '@/models';
import type { EncryptionService } from '@/lib/encryption';
import { aesGcmEncrypt, aesGcmDecrypt } from '@/lib/encryption/utils';
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
  const typePrefix = attachment.type === 'image' ? 'img' : 'fl';
  const encPrefix = attachment.encrypted ? 'e' : '';
  const ext = attachment.name.split('.').pop() ?? 'bin';
  const hash = hashCode(attachment.name);
  return new File(
    getAttachmentsDir(journalId),
    `${encPrefix}${typePrefix}-${pageId}-${hash}.${ext}`,
  );
}

function ensureDir(dir: Directory): void {
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
}

async function readEncrypted(
  file: File,
  encryption: EncryptionService,
  derivedKey?: Uint8Array,
): Promise<string | null> {
  if (!file.exists) return null;
  try {
    const ciphertext = await file.text();
    // Layer 1: device decryption (always)
    const deviceDecrypted = await encryption.decrypt(ciphertext);
    // Layer 2: password decryption (if derived key present)
    if (derivedKey) {
      return aesGcmDecrypt(deviceDecrypted, derivedKey);
    }
    return deviceDecrypted;
  } catch (err) {
    console.warn(`[Canto] Failed to decrypt ${file.uri}:`, err);
    return null;
  }
}

async function writeEncrypted(
  file: File,
  data: string,
  encryption: EncryptionService,
  derivedKey?: Uint8Array,
): Promise<void> {
  // Layer 1: password encryption (if derived key present)
  const toDeviceEncrypt = derivedKey ? aesGcmEncrypt(data, derivedKey) : data;
  // Layer 2: device encryption (always)
  const ciphertext = await encryption.encrypt(toDeviceEncrypt);
  if (!file.exists) {
    file.create({ intermediates: true });
  }
  file.write(ciphertext);
}

interface JournalIndex {
  journals: Journal[];
}

function getTmpFile(file: File): File {
  return new File(file.parentDirectory, file.name + '.tmp');
}

/** Move source to target, deleting target first if it exists (Android rejects move to existing). */
function moveFile(source: File, target: File): void {
  if (target.exists) {
    target.delete();
  }
  source.move(target);
}

async function atomicWrite(
  file: File,
  data: string,
  encryption: EncryptionService,
  derivedKey?: Uint8Array,
): Promise<void> {
  const tmp = getTmpFile(file);
  // Write to temp file first
  const toDeviceEncrypt = derivedKey ? aesGcmEncrypt(data, derivedKey) : data;
  const ciphertext = await encryption.encrypt(toDeviceEncrypt);
  if (!tmp.exists) {
    tmp.create({ intermediates: true });
  }
  tmp.write(ciphertext);
  // Atomic rename: move tmp -> final
  moveFile(tmp, file);
}

function recoverTmpFiles(dir: Directory): void {
  if (!dir.exists) return;
  const entries = dir.list();
  for (const entry of entries) {
    if (entry instanceof File && entry.name.endsWith('.tmp')) {
      const finalName = entry.name.slice(0, -4);
      const finalFile = new File(dir, finalName);
      moveFile(entry, finalFile);
    }
  }
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
      // Crash recovery: complete any interrupted re-encryption
      if (getBaseDir().exists) {
        const entries = getBaseDir().list();
        for (const entry of entries) {
          if (entry instanceof Directory) {
            recoverTmpFiles(entry);
            const pagesDir = new Directory(entry, 'pages');
            recoverTmpFiles(pagesDir);
          }
        }
      }
    },

    async listJournals(): Promise<Journal[]> {
      const index = await readIndex();
      return index.journals;
    },

    async getJournal(id: string, derivedKey?: Uint8Array): Promise<JournalContent | null> {
      const metaFile = getMetadataFile(id);
      const raw = await readEncrypted(metaFile, encryption, derivedKey);
      if (!raw) return null;

      const metadata = JSON.parse(raw) as Omit<JournalContent, 'pages'>;

      const pagesDirectory = getPagesDir(id);
      const pages: Page[] = [];

      if (pagesDirectory.exists) {
        const entries = pagesDirectory.list();
        for (const entry of entries) {
          if (entry instanceof File && entry.uri.endsWith('.json')) {
            const pageRaw = await readEncrypted(entry, encryption, derivedKey);
            if (pageRaw) {
              pages.push(JSON.parse(pageRaw) as Page);
            }
          }
        }
      }

      return { ...metadata, pages };
    },

    async saveJournal(journal: JournalContent, derivedKey?: Uint8Array): Promise<void> {
      ensureDir(getJournalDir(journal.id));
      ensureDir(getPagesDir(journal.id));
      ensureDir(getAttachmentsDir(journal.id));

      // Save metadata (without pages to avoid duplication)
      const { pages, ...metadata } = journal;
      await writeEncrypted(
        getMetadataFile(journal.id),
        JSON.stringify(metadata),
        encryption,
        derivedKey,
      );

      // Save each page
      for (const page of pages) {
        await writeEncrypted(
          getPageFile(journal.id, page.id),
          JSON.stringify(page),
          encryption,
          derivedKey,
        );
      }

      // Update index (never password-encrypted — needs to be readable without password)
      const index = await readIndex();
      const entry: Journal = {
        id: journal.id,
        title: journal.title,
        icon: journal.icon,
        date: journal.date,
        secure: journal.secure,
        salt: journal.salt,
        biometric: journal.biometric,
        kdfIterations: journal.kdfIterations,
        themeOverride: journal.settings.themeOverride,
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
      // Always update the index first so the journal disappears from the list
      // even if the directory cleanup fails
      const index = await readIndex();
      index.journals = index.journals.filter((j) => j.id !== id);
      await writeIndex(index);

      const dir = getJournalDir(id);
      if (dir.exists) {
        dir.delete();
      }
    },

    async getPage(
      journalId: string,
      pageId: string,
      derivedKey?: Uint8Array,
    ): Promise<Page | null> {
      const file = getPageFile(journalId, pageId);
      const raw = await readEncrypted(file, encryption, derivedKey);
      if (!raw) return null;
      return JSON.parse(raw) as Page;
    },

    async savePage(journalId: string, page: Page, derivedKey?: Uint8Array): Promise<void> {
      ensureDir(getPagesDir(journalId));
      const updated = { ...page, modified: Date.now() };
      await writeEncrypted(
        getPageFile(journalId, page.id),
        JSON.stringify(updated),
        encryption,
        derivedKey,
      );
    },

    async deletePage(journalId: string, pageId: string, derivedKey?: Uint8Array): Promise<void> {
      const page = await this.getPage(journalId, pageId, derivedKey);
      if (!page) return;

      // Soft delete: mark as deleted, update modified timestamp
      const deleted = { ...page, deleted: true, modified: Date.now() };
      await writeEncrypted(
        getPageFile(journalId, pageId),
        JSON.stringify(deleted),
        encryption,
        derivedKey,
      );
    },

    async saveAttachment(
      journalId: string,
      pageId: string,
      attachment: Attachment,
      data: string,
      derivedKey?: Uint8Array,
    ): Promise<string> {
      ensureDir(getAttachmentsDir(journalId));
      const file = getAttachmentFile(journalId, pageId, attachment);

      // Layer 1: password encryption (if encrypted attachment + derivedKey)
      const toDeviceEncrypt =
        attachment.encrypted && derivedKey ? aesGcmEncrypt(data, derivedKey) : data;
      // Layer 2: device encryption (always)
      const ciphertext = await encryption.encrypt(toDeviceEncrypt);
      if (!file.exists) {
        file.create({ intermediates: true });
      }
      file.write(ciphertext);

      return file.uri;
    },

    async getAttachment(path: string, derivedKey?: Uint8Array): Promise<string | null> {
      const file = new File(path);
      if (!file.exists) return null;

      const ciphertext = await file.text();
      // Layer 1: device decryption (always)
      const deviceDecrypted = await encryption.decrypt(ciphertext);
      // Layer 2: password decryption (if derivedKey provided)
      if (derivedKey) {
        return aesGcmDecrypt(deviceDecrypted, derivedKey);
      }
      return deviceDecrypted;
    },

    async deleteAttachment(path: string): Promise<void> {
      const file = new File(path);
      if (file.exists) {
        file.delete();
      }
    },

    async reencryptJournal(
      journal: JournalContent,
      _oldKey: Uint8Array | undefined,
      newKey: Uint8Array | undefined,
      onProgress?: (current: number, total: number) => void,
    ): Promise<void> {
      const pages = journal.pages.filter((p) => !p.deleted);
      const total = pages.length + 1; // +1 for metadata

      // Step 1: Write all pages to .tmp files
      for (let i = 0; i < pages.length; i++) {
        onProgress?.(i + 1, total);
        const pageFile = getPageFile(journal.id, pages[i].id);
        await atomicWrite(pageFile, JSON.stringify(pages[i]), encryption, newKey);
      }

      // Step 2: Write metadata to .tmp file
      onProgress?.(total, total);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { pages: _p, ...metadata } = journal;
      await atomicWrite(getMetadataFile(journal.id), JSON.stringify(metadata), encryption, newKey);

      // Step 3: Update index
      const index = await readIndex();
      const entry: Journal = {
        id: journal.id,
        title: journal.title,
        icon: journal.icon,
        date: journal.date,
        secure: journal.secure,
        salt: journal.salt,
        biometric: journal.biometric,
        kdfIterations: journal.kdfIterations,
        themeOverride: journal.settings.themeOverride,
      };
      const existing = index.journals.findIndex((j) => j.id === journal.id);
      if (existing >= 0) {
        index.journals[existing] = entry;
      } else {
        index.journals.push(entry);
      }
      await writeIndex(index);
    },

    async reencryptAll(
      oldDeviceDecrypt: (ciphertext: string) => Promise<string>,
      _oldDeviceEncryptUnused: (plaintext: string) => Promise<string>,
      newDeviceEncrypt: (plaintext: string) => Promise<string>,
      onProgress?: (current: number, total: number) => void,
    ): Promise<void> {
      // Re-encrypt the index and parse its content directly
      // (we cannot call readIndex() here because the encryption singleton
      // still has the old device key cached and would fail to decrypt)
      const indexFile = getJournalsIndexFile();
      let journals: Journal[] = [];
      if (indexFile.exists) {
        const raw = await indexFile.text();
        const decrypted = await oldDeviceDecrypt(raw);
        const reencrypted = await newDeviceEncrypt(decrypted);
        const tmp = getTmpFile(indexFile);
        if (!tmp.exists) tmp.create({ intermediates: true });
        tmp.write(reencrypted);
        moveFile(tmp, indexFile);
        journals = (JSON.parse(decrypted) as JournalIndex).journals;
      }
      let processed = 0;
      const total = journals.length;

      for (const j of journals) {
        processed++;
        onProgress?.(processed, total);

        const journalDir = getJournalDir(j.id);
        if (!journalDir.exists) continue;

        // Re-encrypt metadata
        const metaFile = getMetadataFile(j.id);
        if (metaFile.exists) {
          const raw = await metaFile.text();
          const decrypted = await oldDeviceDecrypt(raw);
          const reencrypted = await newDeviceEncrypt(decrypted);
          const tmp = getTmpFile(metaFile);
          if (!tmp.exists) tmp.create({ intermediates: true });
          tmp.write(reencrypted);
          moveFile(tmp, metaFile);
        }

        // Re-encrypt pages
        const pagesDir = getPagesDir(j.id);
        if (pagesDir.exists) {
          const entries = pagesDir.list();
          for (const entry of entries) {
            if (entry instanceof File && entry.uri.endsWith('.json')) {
              const raw = await entry.text();
              const decrypted = await oldDeviceDecrypt(raw);
              const reencrypted = await newDeviceEncrypt(decrypted);
              const tmp = getTmpFile(entry);
              if (!tmp.exists) tmp.create({ intermediates: true });
              tmp.write(reencrypted);
              moveFile(tmp, entry);
            }
          }
        }

        // Re-encrypt attachments
        const attachDir = getAttachmentsDir(j.id);
        if (attachDir.exists) {
          const entries = attachDir.list();
          for (const entry of entries) {
            if (entry instanceof File) {
              const raw = await entry.text();
              const decrypted = await oldDeviceDecrypt(raw);
              const reencrypted = await newDeviceEncrypt(decrypted);
              const tmp = getTmpFile(entry);
              if (!tmp.exists) tmp.create({ intermediates: true });
              tmp.write(reencrypted);
              moveFile(tmp, entry);
            }
          }
        }
      }
    },
  };
}
