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

  /** Build a deterministic key tag (first 4 bytes hex) for password-layer detection. */
  function keyTag(key: Uint8Array): string {
    return Array.from(key.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function readEncrypted(path: string, derivedKey?: Uint8Array): Promise<string | null> {
    const ciphertext = store.get(path);
    if (ciphertext === undefined) return null;
    const deviceDecrypted = await encryption.decrypt(ciphertext);
    if (derivedKey) {
      // Mirror real behavior: if the password layer is present and the key matches,
      // strip and return plaintext. If the key doesn't match (different tag), the
      // real `readEncrypted` falls back to the device-decrypted content (which is
      // garbage/ciphertext from the password layer's perspective).
      const expectedPrefix = `aes:${keyTag(derivedKey)}:`;
      if (deviceDecrypted.startsWith(expectedPrefix)) {
        return deviceDecrypted.slice(expectedPrefix.length);
      }
      // Wrong key — return raw device-decrypted (mimics fallback path)
      return deviceDecrypted;
    }
    return deviceDecrypted;
  }

  async function writeEncrypted(
    path: string,
    data: string,
    derivedKey?: Uint8Array,
  ): Promise<void> {
    const toDeviceEncrypt = derivedKey ? `aes:${keyTag(derivedKey)}:${data}` : data;
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
      derivedKey?: Uint8Array,
    ): Promise<string> {
      // Mirror real stores: if attachment.encrypted && derivedKey, apply password layer
      // before device layer. Otherwise just device layer.
      const path = getAttachmentPath(platform, journalId, pageId, attachment);
      const toDeviceEncrypt =
        attachment.encrypted && derivedKey ? `aes:${keyTag(derivedKey)}:${data}` : data;
      const ciphertext = await encryption.encrypt(toDeviceEncrypt);
      store.set(path, ciphertext);
      return path;
    },

    async getAttachment(path: string, derivedKey?: Uint8Array): Promise<string | null> {
      const ciphertext = store.get(path);
      if (ciphertext === undefined) return null;
      const deviceDecrypted = await encryption.decrypt(ciphertext);
      if (derivedKey) {
        const expectedPrefix = `aes:${keyTag(derivedKey)}:`;
        if (deviceDecrypted.startsWith(expectedPrefix)) {
          return deviceDecrypted.slice(expectedPrefix.length);
        }
        // Wrong key or no password layer — fall through to device-decrypted content
        return deviceDecrypted;
      }
      return deviceDecrypted;
    },

    async deleteAttachment(path: string): Promise<void> {
      store.delete(path);
    },

    async reencryptJournal(
      journal: JournalContent,
      oldKey: Uint8Array | undefined,
      newKey: Uint8Array | undefined,
    ): Promise<void> {
      // Mirror src/lib/storage/local.ts behavior:
      // - flip attachment.encrypted flags to match newKey presence
      // - re-encrypt non-deleted pages with newKey
      // - re-encrypt attachment FILES (password layer with newKey)
      // - re-write metadata with newKey
      // - update index entry with new salt/secure
      const newAttEncrypted = !!newKey;
      const remapAttachments = (arr: Attachment[] | undefined): Attachment[] =>
        (arr ?? []).map((a) => ({ ...a, encrypted: newAttEncrypted }));
      const pages = journal.pages
        .filter((p) => !p.deleted)
        .map((p) => ({
          ...p,
          images: remapAttachments(p.images),
          files: remapAttachments(p.files),
        }));

      // Re-encrypt attachment files (all files in attachment prefix)
      const attachKeys = keysWithPrefix(attachmentsPrefix(journal.id));
      for (const key of attachKeys) {
        const raw = store.get(key);
        if (!raw) continue;
        let plaintext = await encryption.decrypt(raw);
        if (oldKey) {
          const oldPrefix = `aes:${keyTag(oldKey)}:`;
          if (plaintext.startsWith(oldPrefix)) {
            plaintext = plaintext.slice(oldPrefix.length);
          }
        }
        const toDeviceEncrypt = newKey ? `aes:${keyTag(newKey)}:${plaintext}` : plaintext;
        const ciphertext = await encryption.encrypt(toDeviceEncrypt);
        store.set(key, ciphertext);
      }

      for (const page of pages) {
        await writeEncrypted(pagePath(journal.id, page.id), JSON.stringify(page), newKey);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { pages: _p, ...metadata } = journal;
      await writeEncrypted(metaPath(journal.id), JSON.stringify(metadata), newKey);

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
      };
      const existing = index.journals.findIndex((j) => j.id === journal.id);
      if (existing >= 0) {
        index.journals[existing] = entry;
      } else {
        index.journals.push(entry);
      }
      await writeIndex(index);
    },

    async reencryptAll(): Promise<void> {
      // not needed for sync tests
    },
  };

  return localStore;
}
