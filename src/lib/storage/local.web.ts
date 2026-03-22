import type { Journal, JournalContent, Page, Attachment } from 'canto-data';
import type { EncryptionService } from '@/lib/encryption';
import { aesGcmEncrypt, aesGcmDecrypt } from '@/lib/encryption/utils';
import { safeJsonParse } from '@/lib/utils/json';
import type { LocalStore } from './types';

const DB_NAME = 'canto';
const DB_VERSION = 1;
const STORE_NAME = 'files';

const BASE_PATH = 'canto';
const JOURNALS_INDEX_PATH = `${BASE_PATH}/journals.json`;

function getJournalPath(journalId: string): string {
  return `${BASE_PATH}/${journalId}`;
}

function getMetadataPath(journalId: string): string {
  return `${getJournalPath(journalId)}/metadata.json`;
}

function getPagePath(journalId: string, pageId: string): string {
  return `${getJournalPath(journalId)}/pages/${pageId}.json`;
}

function getPagesPrefix(journalId: string): string {
  return `${getJournalPath(journalId)}/pages/`;
}

function getAttachmentsPrefix(journalId: string): string {
  return `${getJournalPath(journalId)}/attachments/`;
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

function getAttachmentPath(journalId: string, pageId: string, attachment: Attachment): string {
  const typePrefix = attachment.type === 'image' ? 'img' : 'fl';
  const encPrefix = attachment.encrypted ? 'e' : '';
  const ext = attachment.name.split('.').pop() ?? 'bin';
  const hash = hashCode(attachment.name);
  return `${getAttachmentsPrefix(journalId)}${encPrefix}${typePrefix}-${pageId}-${hash}.${ext}`;
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'path' });
      }
    };
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Reset the cached DB connection. Exported for test teardown only. */
export function _resetDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

const IDB_TIMEOUT_MS = 10_000;

async function idbGet(path: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`[IDB] Timeout reading ${path}`)),
      IDB_TIMEOUT_MS,
    );
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(path);
    req.onsuccess = () => {
      clearTimeout(timeout);
      const result = req.result as { path: string; data: string } | undefined;
      resolve(result?.data ?? null);
    };
    req.onerror = () => {
      clearTimeout(timeout);
      reject(req.error);
    };
    tx.onabort = () => {
      clearTimeout(timeout);
      reject(tx.error ?? new Error('[IDB] Transaction aborted'));
    };
  });
}

async function idbPut(path: string, data: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`[IDB] Timeout writing ${path}`)),
      IDB_TIMEOUT_MS,
    );
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ path, data });
    tx.oncomplete = () => {
      clearTimeout(timeout);
      resolve();
    };
    tx.onerror = () => {
      clearTimeout(timeout);
      reject(tx.error);
    };
    tx.onabort = () => {
      clearTimeout(timeout);
      reject(tx.error ?? new Error('[IDB] Transaction aborted'));
    };
  });
}

async function idbDelete(path: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`[IDB] Timeout deleting ${path}`)),
      IDB_TIMEOUT_MS,
    );
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(path);
    tx.oncomplete = () => {
      clearTimeout(timeout);
      resolve();
    };
    tx.onerror = () => {
      clearTimeout(timeout);
      reject(tx.error);
    };
    tx.onabort = () => {
      clearTimeout(timeout);
      reject(tx.error ?? new Error('[IDB] Transaction aborted'));
    };
  });
}

/** Delete all entries whose key starts with the given prefix. */
async function idbDeletePrefix(prefix: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`[IDB] Timeout deleting prefix ${prefix}`)),
      IDB_TIMEOUT_MS,
    );
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
    const req = store.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => {
      clearTimeout(timeout);
      resolve();
    };
    tx.onerror = () => {
      clearTimeout(timeout);
      reject(tx.error);
    };
    tx.onabort = () => {
      clearTimeout(timeout);
      reject(tx.error ?? new Error('[IDB] Transaction aborted'));
    };
  });
}

/** List all keys that start with the given prefix. */
async function idbListKeys(prefix: string): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`[IDB] Timeout listing keys for ${prefix}`)),
      IDB_TIMEOUT_MS,
    );
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
    const req = store.getAllKeys(range);
    req.onsuccess = () => {
      clearTimeout(timeout);
      resolve(req.result as string[]);
    };
    req.onerror = () => {
      clearTimeout(timeout);
      reject(req.error);
    };
    tx.onabort = () => {
      clearTimeout(timeout);
      reject(tx.error ?? new Error('[IDB] Transaction aborted'));
    };
  });
}

// ---------------------------------------------------------------------------
// Encrypted read/write (same logic as native)
// ---------------------------------------------------------------------------

async function readEncrypted(
  path: string,
  encryption: EncryptionService,
  derivedKey?: Uint8Array,
): Promise<string | null> {
  const ciphertext = await idbGet(path);
  if (!ciphertext) return null;
  try {
    const deviceDecrypted = await encryption.decrypt(ciphertext);
    if (derivedKey) {
      try {
        return await aesGcmDecrypt(deviceDecrypted, derivedKey);
      } catch {
        return deviceDecrypted;
      }
    }
    return deviceDecrypted;
  } catch (err) {
    console.warn(`[Canto] Failed to decrypt ${path}:`, err);
    return null;
  }
}

async function writeEncrypted(
  path: string,
  data: string,
  encryption: EncryptionService,
  derivedKey?: Uint8Array,
): Promise<void> {
  const toDeviceEncrypt = derivedKey ? await aesGcmEncrypt(data, derivedKey) : data;
  const ciphertext = await encryption.encrypt(toDeviceEncrypt);
  await idbPut(path, ciphertext);
}

// ---------------------------------------------------------------------------
// LocalStore implementation
// ---------------------------------------------------------------------------

interface JournalIndex {
  journals: Journal[];
}

export function createLocalStore(encryption: EncryptionService): LocalStore {
  async function readIndex(): Promise<JournalIndex> {
    const raw = await readEncrypted(JOURNALS_INDEX_PATH, encryption);
    if (!raw) return { journals: [] };
    return safeJsonParse<JournalIndex>(raw, 'journals index');
  }

  async function writeIndex(index: JournalIndex): Promise<void> {
    await writeEncrypted(JOURNALS_INDEX_PATH, JSON.stringify(index), encryption);
  }

  return {
    async initialize(): Promise<void> {
      await openDB();
    },

    async listJournals(): Promise<Journal[]> {
      const index = await readIndex();
      return index.journals;
    },

    async getJournal(id: string, derivedKey?: Uint8Array): Promise<JournalContent | null> {
      const raw = await readEncrypted(getMetadataPath(id), encryption, derivedKey);
      if (!raw) return null;

      const metadata = safeJsonParse<Omit<JournalContent, 'pages'>>(raw, `journal:${id} metadata`);

      const pageKeys = await idbListKeys(getPagesPrefix(id));
      const pages: Page[] = [];

      for (const key of pageKeys) {
        if (key.endsWith('.json')) {
          const pageRaw = await readEncrypted(key, encryption, derivedKey);
          if (pageRaw) {
            pages.push(safeJsonParse<Page>(pageRaw, `page:${key}`));
          }
        }
      }

      return { ...metadata, pages };
    },

    async saveJournal(journal: JournalContent, derivedKey?: Uint8Array): Promise<void> {
      const { pages, ...metadata } = journal;
      await writeEncrypted(
        getMetadataPath(journal.id),
        JSON.stringify(metadata),
        encryption,
        derivedKey,
      );

      for (const page of pages) {
        await writeEncrypted(
          getPagePath(journal.id, page.id),
          JSON.stringify(page),
          encryption,
          derivedKey,
        );
      }

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
      await idbDeletePrefix(getJournalPath(id));

      const index = await readIndex();
      index.journals = index.journals.filter((j) => j.id !== id);
      await writeIndex(index);
    },

    async getPage(
      journalId: string,
      pageId: string,
      derivedKey?: Uint8Array,
    ): Promise<Page | null> {
      const raw = await readEncrypted(getPagePath(journalId, pageId), encryption, derivedKey);
      if (!raw) return null;
      return safeJsonParse<Page>(raw, `page:${pageId}`);
    },

    async savePage(
      journalId: string,
      page: Page,
      derivedKey?: Uint8Array,
      preserveModified?: boolean,
    ): Promise<void> {
      const updated = preserveModified ? page : { ...page, modified: Date.now() };
      await writeEncrypted(
        getPagePath(journalId, page.id),
        JSON.stringify(updated),
        encryption,
        derivedKey,
      );
    },

    async deletePage(journalId: string, pageId: string, derivedKey?: Uint8Array): Promise<void> {
      const page = await this.getPage(journalId, pageId, derivedKey);
      if (!page) return;

      const deleted = { ...page, deleted: true, modified: Date.now() };
      await writeEncrypted(
        getPagePath(journalId, pageId),
        JSON.stringify(deleted),
        encryption,
        derivedKey,
      );

      // Clean up attachment entries from IDB (non-blocking)
      const attachments = [...(page.images ?? []), ...(page.files ?? [])];
      if (attachments.length > 0) {
        Promise.resolve()
          .then(async () => {
            for (const att of attachments) {
              const path = getAttachmentPath(journalId, pageId, att);
              try {
                await idbDelete(path);
              } catch {
                // Best-effort cleanup
              }
            }
          })
          .catch((err) => {
            console.warn(`[Canto] Failed to clean up attachments for page ${pageId}:`, err);
          });
      }
    },

    async saveAttachment(
      journalId: string,
      pageId: string,
      attachment: Attachment,
      data: string,
      derivedKey?: Uint8Array,
    ): Promise<string> {
      const path = getAttachmentPath(journalId, pageId, attachment);

      const toDeviceEncrypt =
        attachment.encrypted && derivedKey ? await aesGcmEncrypt(data, derivedKey) : data;
      const ciphertext = await encryption.encrypt(toDeviceEncrypt);
      await idbPut(path, ciphertext);

      return path;
    },

    async getAttachment(path: string, derivedKey?: Uint8Array): Promise<string | null> {
      const ciphertext = await idbGet(path);
      if (!ciphertext) return null;

      const deviceDecrypted = await encryption.decrypt(ciphertext);
      if (derivedKey) {
        try {
          return await aesGcmDecrypt(deviceDecrypted, derivedKey);
        } catch {
          return deviceDecrypted;
        }
      }
      return deviceDecrypted;
    },

    async deleteAttachment(path: string): Promise<void> {
      await idbDelete(path);
    },

    async reencryptJournal(
      journal: JournalContent,
      oldKey: Uint8Array | undefined,
      newKey: Uint8Array | undefined,
      onProgress?: (current: number, total: number) => void,
    ): Promise<void> {
      const pages = journal.pages.filter((p) => !p.deleted);

      const attachKeys = await idbListKeys(getAttachmentsPrefix(journal.id));
      const total = pages.length + attachKeys.length + 1;

      let progress = 0;
      for (const page of pages) {
        onProgress?.(++progress, total);
        await writeEncrypted(
          getPagePath(journal.id, page.id),
          JSON.stringify(page),
          encryption,
          newKey,
        );
      }

      for (const key of attachKeys) {
        onProgress?.(++progress, total);
        const raw = await idbGet(key);
        if (!raw) continue;
        let plaintext = await encryption.decrypt(raw);
        if (oldKey) {
          try {
            plaintext = await aesGcmDecrypt(plaintext, oldKey);
          } catch {
            // Not password-encrypted
          }
        }
        const toDeviceEncrypt = newKey ? await aesGcmEncrypt(plaintext, newKey) : plaintext;
        const ciphertext = await encryption.encrypt(toDeviceEncrypt);
        await idbPut(key, ciphertext);
      }

      onProgress?.(++progress, total);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { pages: _p, ...metadata } = journal;
      await writeEncrypted(
        getMetadataPath(journal.id),
        JSON.stringify(metadata),
        encryption,
        newKey,
      );

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
      let journals: Journal[] = [];
      const indexData = await idbGet(JOURNALS_INDEX_PATH);
      if (indexData) {
        const decrypted = await oldDeviceDecrypt(indexData);
        const reencrypted = await newDeviceEncrypt(decrypted);
        await idbPut(JOURNALS_INDEX_PATH, reencrypted);
        journals = safeJsonParse<JournalIndex>(decrypted, 'journals index').journals;
      }

      let processed = 0;
      const total = journals.length;

      for (const j of journals) {
        processed++;
        onProgress?.(processed, total);

        // Re-encrypt metadata
        const metaData = await idbGet(getMetadataPath(j.id));
        if (metaData) {
          const decrypted = await oldDeviceDecrypt(metaData);
          const reencrypted = await newDeviceEncrypt(decrypted);
          await idbPut(getMetadataPath(j.id), reencrypted);
        }

        // Re-encrypt pages
        const pageKeys = await idbListKeys(getPagesPrefix(j.id));
        for (const key of pageKeys) {
          const data = await idbGet(key);
          if (data) {
            const decrypted = await oldDeviceDecrypt(data);
            const reencrypted = await newDeviceEncrypt(decrypted);
            await idbPut(key, reencrypted);
          }
        }

        // Re-encrypt attachments
        const attachKeys = await idbListKeys(getAttachmentsPrefix(j.id));
        for (const key of attachKeys) {
          const data = await idbGet(key);
          if (data) {
            const decrypted = await oldDeviceDecrypt(data);
            const reencrypted = await newDeviceEncrypt(decrypted);
            await idbPut(key, reencrypted);
          }
        }
      }
    },
  };
}
