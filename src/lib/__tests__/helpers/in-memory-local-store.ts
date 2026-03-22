/**
 * In-memory LocalStore implementation for sync e2e tests.
 * Executes real storage logic (encryption, path generation, timestamp handling)
 * backed by an in-memory Map instead of filesystem/IndexedDB.
 */
import type { Journal, JournalContent, Page, Attachment } from 'canto-data';
import type { EncryptionService } from '@/lib/encryption';
import type { LocalStore } from '../../storage/types';

export type Platform = 'native' | 'web';

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function getAttachmentPath(
  platform: Platform,
  journalId: string,
  pageId: string,
  attachment: Attachment,
): string {
  const typePrefix = attachment.type === 'image' ? 'img' : 'fl';
  const encPrefix = attachment.encrypted ? 'e' : '';
  const ext = attachment.name.split('.').pop() ?? 'bin';
  const hash = hashCode(attachment.name);
  const filename = `${encPrefix}${typePrefix}-${pageId}-${hash}.${ext}`;

  if (platform === 'web') {
    return `canto/${journalId}/attachments/${filename}`;
  }
  return `file:///data/canto/${journalId}/attachments/${filename}`;
}

interface JournalIndex {
  journals: Journal[];
}

export function createInMemoryLocalStore(
  encryption: EncryptionService,
  platform: Platform,
): LocalStore & { _dump(): Map<string, string> } {
  const store = new Map<string, string>();
  const BASE = 'canto';
  const INDEX_PATH = `${BASE}/journals.json`;

  function journalPath(id: string): string {
    return `${BASE}/${id}`;
  }
  function metaPath(id: string): string {
    return `${journalPath(id)}/metadata.json`;
  }
  function pagePath(jId: string, pId: string): string {
    return `${journalPath(jId)}/pages/${pId}.json`;
  }
  function pagesPrefix(jId: string): string {
    return `${journalPath(jId)}/pages/`;
  }
  function attachmentsPrefix(jId: string): string {
    return `${journalPath(jId)}/attachments/`;
  }

  async function readEncrypted(path: string, derivedKey?: Uint8Array): Promise<string | null> {
    const ciphertext = store.get(path);
    if (ciphertext === undefined) return null;
    const deviceDecrypted = await encryption.decrypt(ciphertext);
    if (derivedKey) {
      // Simulate the aesGcmDecrypt fallback behavior: if it fails, return device-decrypted
      // In our mock, we use a simple prefix to detect password-encrypted data
      if (deviceDecrypted.startsWith('aes:')) {
        return deviceDecrypted.slice(4);
      }
      return deviceDecrypted;
    }
    return deviceDecrypted;
  }

  async function writeEncrypted(
    path: string,
    data: string,
    derivedKey?: Uint8Array,
  ): Promise<void> {
    const toDeviceEncrypt = derivedKey ? `aes:${data}` : data;
    const ciphertext = await encryption.encrypt(toDeviceEncrypt);
    store.set(path, ciphertext);
  }

  async function readIndex(): Promise<JournalIndex> {
    const raw = await readEncrypted(INDEX_PATH);
    if (!raw) return { journals: [] };
    return JSON.parse(raw) as JournalIndex;
  }

  async function writeIndex(index: JournalIndex): Promise<void> {
    await writeEncrypted(INDEX_PATH, JSON.stringify(index));
  }

  function keysWithPrefix(prefix: string): string[] {
    const keys: string[] = [];
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  }

  function deletePrefix(prefix: string): void {
    for (const key of [...store.keys()]) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  }

  const localStore: LocalStore & { _dump(): Map<string, string> } = {
    _dump() {
      return new Map(store);
    },

    async initialize(): Promise<void> {
      // no-op for in-memory
    },

    async listJournals(): Promise<Journal[]> {
      const index = await readIndex();
      return index.journals;
    },

    async getJournal(id: string, derivedKey?: Uint8Array): Promise<JournalContent | null> {
      const raw = await readEncrypted(metaPath(id), derivedKey);
      if (!raw) return null;
      const metadata = JSON.parse(raw) as Omit<JournalContent, 'pages'>;

      const pageKeys = keysWithPrefix(pagesPrefix(id));
      const pages: Page[] = [];
      for (const key of pageKeys) {
        if (key.endsWith('.json')) {
          const pageRaw = await readEncrypted(key, derivedKey);
          if (pageRaw) pages.push(JSON.parse(pageRaw) as Page);
        }
      }

      return { ...metadata, pages } as JournalContent;
    },

    async saveJournal(journal: JournalContent, derivedKey?: Uint8Array): Promise<void> {
      const { pages, ...metadata } = journal;
      await writeEncrypted(metaPath(journal.id), JSON.stringify(metadata), derivedKey);

      for (const page of pages) {
        await writeEncrypted(pagePath(journal.id, page.id), JSON.stringify(page), derivedKey);
      }

      const index = await readIndex();
      const entry: Journal = {
        id: journal.id,
        title: journal.title,
        icon: journal.icon,
        date: journal.date,
        secure: journal.secure,
        salt: journal.salt,
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
      deletePrefix(journalPath(id));
      const index = await readIndex();
      index.journals = index.journals.filter((j) => j.id !== id);
      await writeIndex(index);
    },

    async getPage(
      journalId: string,
      pageId: string,
      derivedKey?: Uint8Array,
    ): Promise<Page | null> {
      const raw = await readEncrypted(pagePath(journalId, pageId), derivedKey);
      if (!raw) return null;
      return JSON.parse(raw) as Page;
    },

    async savePage(
      journalId: string,
      page: Page,
      derivedKey?: Uint8Array,
      preserveModified?: boolean,
    ): Promise<void> {
      const updated = preserveModified ? page : { ...page, modified: Date.now() };
      await writeEncrypted(pagePath(journalId, page.id), JSON.stringify(updated), derivedKey);
    },

    async deletePage(journalId: string, pageId: string, derivedKey?: Uint8Array): Promise<void> {
      const page = await localStore.getPage(journalId, pageId, derivedKey);
      if (!page) return;
      const deleted = { ...page, deleted: true, modified: Date.now() };
      await writeEncrypted(pagePath(journalId, pageId), JSON.stringify(deleted), derivedKey);
    },

    async saveAttachment(
      journalId: string,
      pageId: string,
      attachment: Attachment,
      data: string,
    ): Promise<string> {
      const path = getAttachmentPath(platform, journalId, pageId, attachment);
      const ciphertext = await encryption.encrypt(data);
      store.set(path, ciphertext);
      return path;
    },

    async getAttachment(path: string): Promise<string | null> {
      const ciphertext = store.get(path);
      if (ciphertext === undefined) return null;
      return encryption.decrypt(ciphertext);
    },

    async deleteAttachment(path: string): Promise<void> {
      store.delete(path);
    },

    async reencryptJournal(): Promise<void> {
      // not needed for sync tests
    },

    async reencryptAll(): Promise<void> {
      // not needed for sync tests
    },
  };

  return localStore;
}
