import type { Journal, JournalContent, Page, Attachment } from 'canto-data';
import type { EncryptionService } from '@/lib/encryption';
import { aesGcmEncrypt, aesGcmDecrypt, generateUUID } from '@/lib/encryption/utils';
import { safeJsonParse } from '@/lib/utils/json';
import type { LocalStore } from './types';
import { serializeDeviceKeyWrites } from './write-barrier';
import {
  base64ByteLength,
  chunkBytesToBase64,
  decodeChunkFrame,
  encodeChunkFrame,
  joinBase64Chunks,
  splitBase64Chunks,
  LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES,
} from './attachment-content';

const DB_NAME = 'canto';
const DB_VERSION = 1;
const STORE_NAME = 'files';

const BASE_PATH = 'canto';
const JOURNALS_INDEX_PATH = `${BASE_PATH}/journals.json`;
const DEVICE_KEY_ROTATION_COMPLETE_PATH = `${BASE_PATH}/.device-key-rotation-complete`;

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

function getChunkRoot(journalId: string, pageId: string, attachment: Attachment): string {
  // A generation is a local copy-on-write root. The page starts referencing it
  // only after all chunks and the manifest have been written successfully.
  const generation = attachment.content?.generation ?? 'legacy';
  return `${getAttachmentsPrefix(journalId)}chunk-v1-${pageId}-${attachment.id}-${generation}`;
}

function getChunkPath(root: string, index: number): string {
  return `${root}/${index}`;
}

function getChunkManifestPath(root: string): string {
  return `${root}/manifest`;
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
const ATTACHMENT_READ_TIMEOUT_MS = 60_000;
const ATTACHMENT_READ_ATTEMPTS = 3;
const ATTACHMENT_RETRY_DELAYS_MS = [100, 300];

/** Attachments above this size remain device-encrypted but are not password-encrypted on web. */
export const WEB_PASSWORD_ATTACHMENT_LIMIT_BYTES = 32 * 1024 * 1024;

async function idbGet(path: string, timeoutMs = IDB_TIMEOUT_MS): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(path);
    let settled = false;
    const clearHandlers = () => {
      clearTimeout(timeout);
      req.onsuccess = null;
      req.onerror = null;
      tx.onabort = null;
    };
    const resolveOnce = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearHandlers();
      resolve(value);
    };
    const rejectOnce = (error: Error | DOMException | null) => {
      if (settled) return;
      settled = true;
      clearHandlers();
      reject(error);
    };
    const timeout = setTimeout(() => {
      rejectOnce(new Error(`[IDB] Timeout reading ${path}`));
      try {
        tx.abort();
      } catch {
        // The request may have completed between the timeout and abort attempt.
      }
    }, timeoutMs);

    req.onsuccess = () => {
      const result = req.result as { path: string; data: string } | undefined;
      resolveOnce(result?.data ?? null);
    };
    req.onerror = () => rejectOnce(req.error);
    tx.onabort = () => rejectOnce(tx.error ?? new Error('[IDB] Transaction aborted'));
  });
}

async function idbHas(path: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getKey(path);
    const timeout = setTimeout(() => {
      try {
        tx.abort();
      } catch {
        // The request may have completed between the timeout and abort attempt.
      }
      reject(new Error(`[IDB] Timeout checking ${path}`));
    }, IDB_TIMEOUT_MS);
    req.onsuccess = () => {
      clearTimeout(timeout);
      resolve(req.result !== undefined);
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

function isRetryableAttachmentReadError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith('[IDB] Timeout reading') || message === '[IDB] Transaction aborted';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function idbGetAttachment(path: string): Promise<string | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ATTACHMENT_READ_ATTEMPTS; attempt++) {
    try {
      return await idbGet(path, ATTACHMENT_READ_TIMEOUT_MS);
    } catch (err) {
      lastError = err;
      if (!isRetryableAttachmentReadError(err) || attempt === ATTACHMENT_READ_ATTEMPTS - 1) {
        throw err;
      }
      await delay(ATTACHMENT_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
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

/** Size sidecars are raw decimal metadata, not encrypted attachment content. */
async function isAttachmentSizeSidecar(path: string): Promise<boolean> {
  if (!path.endsWith('.size')) return false;
  const value = await idbGet(path);
  return value !== null && /^(?:0|[1-9]\d*)$/.test(value) && (await idbHas(path.slice(0, -5)));
}

function isChunkManifest(path: string): boolean {
  return path.endsWith('/manifest');
}

// ---------------------------------------------------------------------------
// Crash-recoverable raw ciphertext transactions
// ---------------------------------------------------------------------------

const TRANSACTIONS_PREFIX = `${BASE_PATH}/.transactions/`;
type TransactionPhase = 'prepared' | 'committing';
interface StorageTransaction {
  phase: TransactionPhase;
  files: { target: string; staged: string }[];
  newRoots?: string[];
  oldRoots?: string[];
}

function transactionRoot(id: string): string {
  return `${TRANSACTIONS_PREFIX}${id}`;
}

function transactionMarkerPath(root: string): string {
  return `${root}/marker`;
}

async function writeTransactionMarker(
  root: string,
  transaction: StorageTransaction,
): Promise<void> {
  // The marker contains paths and state only. Ciphertexts remain in private
  // IndexedDB records; no plaintext or key material is ever recorded here.
  await idbPut(transactionMarkerPath(root), JSON.stringify(transaction));
}

async function readTransactionMarker(root: string): Promise<StorageTransaction | null> {
  const raw = await idbGet(transactionMarkerPath(root));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StorageTransaction;
  } catch {
    return null;
  }
}

async function stageRawFile(
  root: string,
  index: number,
  target: string,
  ciphertext: string,
): Promise<{ target: string; staged: string }> {
  const staged = `${root}/file-${index}`;
  await idbPut(staged, ciphertext);
  return { target, staged };
}

async function applyStorageTransaction(transaction: StorageTransaction): Promise<void> {
  for (const { target, staged } of transaction.files) {
    const raw = await idbGet(staged);
    if (raw == null) throw new Error(`Incomplete storage transaction staging: ${staged}`);
    await idbPut(target, raw);
  }
  for (const root of transaction.oldRoots ?? []) await idbDeletePrefix(`${root}/`);
}

async function recoverTransactions(): Promise<void> {
  const keys = await idbListKeys(TRANSACTIONS_PREFIX);
  const roots = new Set(keys.map((key) => key.split('/').slice(0, -1).join('/')));
  for (const root of roots) {
    const transaction = await readTransactionMarker(root);
    if (transaction?.phase === 'committing') await applyStorageTransaction(transaction);
    if (transaction?.phase !== 'committing') {
      for (const newRoot of transaction?.newRoots ?? []) await idbDeletePrefix(`${newRoot}/`);
    }
    await idbDeletePrefix(`${root}/`);
  }
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

  const store: LocalStore = {
    async initialize(): Promise<void> {
      await openDB();
      await recoverTransactions();
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

    async hasCompletedDeviceKeyRotation(): Promise<boolean> {
      return idbHas(DEVICE_KEY_ROTATION_COMPLETE_PATH);
    },

    async clearCompletedDeviceKeyRotation(): Promise<void> {
      await idbDelete(DEVICE_KEY_ROTATION_COMPLETE_PATH);
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
              try {
                if (att.content?.format === 'canto-chunked-v1') {
                  await idbDeletePrefix(`${att.path}/`);
                } else {
                  await idbDelete(att.path);
                }
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
      if (attachment.content?.format === 'canto-chunked-v1') {
        const root = getChunkRoot(journalId, pageId, attachment);
        if ((await idbListKeys(`${root}/`)).length > 0) {
          throw new Error(`Attachment generation already exists: ${attachment.name}`);
        }
        try {
          const chunks = splitBase64Chunks(data, attachment.content);
          for (let index = 0; index < chunks.length; index++) {
            const frame = encodeChunkFrame(journalId, pageId, attachment, index, chunks[index]);
            const inner =
              attachment.encrypted && derivedKey ? await aesGcmEncrypt(frame, derivedKey) : frame;
            await idbPut(getChunkPath(root, index), await encryption.encrypt(inner));
          }
          await idbPut(
            getChunkManifestPath(root),
            await encryption.encrypt(JSON.stringify({ journalId, pageId, attachment })),
          );
          return root;
        } catch (error) {
          await idbDeletePrefix(`${root}/`);
          throw error;
        }
      }
      const path = getAttachmentPath(journalId, pageId, attachment);
      const toDeviceEncrypt =
        attachment.encrypted && derivedKey ? await aesGcmEncrypt(data, derivedKey) : data;
      const ciphertext = await encryption.encrypt(toDeviceEncrypt);
      await idbPut(path, ciphertext);
      await idbPut(`${path}.size`, String(base64ByteLength(data)));
      return path;
    },

    async saveAttachmentStream(journalId, pageId, attachment, chunks, derivedKey): Promise<string> {
      if (attachment.content?.format !== 'canto-chunked-v1') {
        throw new Error(`Chunked content descriptor required for attachment: ${attachment.name}`);
      }
      const root = getChunkRoot(journalId, pageId, attachment);
      if ((await idbListKeys(`${root}/`)).length > 0) {
        throw new Error(`Attachment generation already exists: ${attachment.name}`);
      }
      let index = 0;
      let written = 0;
      try {
        for await (const bytes of chunks) {
          if (bytes.length === 0) continue;
          if (bytes.length > attachment.content.chunkSize) {
            throw new Error(`Attachment stream chunk exceeds limit: ${attachment.name}`);
          }
          if (index >= attachment.content.chunkCount) {
            throw new Error(`Too many attachment chunks: ${attachment.name}`);
          }
          written += bytes.length;
          const frame = encodeChunkFrame(
            journalId,
            pageId,
            attachment,
            index,
            chunkBytesToBase64(bytes),
          );
          const inner =
            attachment.encrypted && derivedKey ? await aesGcmEncrypt(frame, derivedKey) : frame;
          await idbPut(getChunkPath(root, index++), await encryption.encrypt(inner));
        }
        if (index !== attachment.content.chunkCount || written !== attachment.content.byteLength) {
          throw new Error(`Attachment stream length mismatch: ${attachment.name}`);
        }
        await idbPut(
          getChunkManifestPath(root),
          await encryption.encrypt(JSON.stringify({ journalId, pageId, attachment })),
        );
        return root;
      } catch (error) {
        await idbDeletePrefix(`${root}/`);
        throw error;
      }
    },

    async getAttachment(path: string, derivedKey?: Uint8Array): Promise<string | null> {
      const ciphertext = await idbGetAttachment(path);
      if (ciphertext) {
        const deviceDecrypted = await encryption.decrypt(ciphertext);
        if (derivedKey) {
          try {
            return await aesGcmDecrypt(deviceDecrypted, derivedKey);
          } catch {
            return deviceDecrypted;
          }
        }
        return deviceDecrypted;
      }
      const manifestCiphertext = await idbGetAttachment(getChunkManifestPath(path));
      if (!manifestCiphertext) return null;
      const manifest = JSON.parse(await encryption.decrypt(manifestCiphertext)) as {
        journalId: string;
        pageId: string;
        attachment: Attachment;
      };
      const chunks: string[] = [];
      for (let index = 0; index < manifest.attachment.content!.chunkCount; index++) {
        const raw = await idbGetAttachment(getChunkPath(path, index));
        if (!raw)
          throw new Error(`Attachment chunk missing: ${manifest.attachment.name} #${index}`);
        let frame = await encryption.decrypt(raw);
        if (manifest.attachment.encrypted && derivedKey)
          frame = await aesGcmDecrypt(frame, derivedKey);
        chunks.push(
          decodeChunkFrame(frame, manifest.journalId, manifest.pageId, manifest.attachment, index),
        );
      }
      return joinBase64Chunks(chunks);
    },

    async deleteAttachment(path: string): Promise<void> {
      await idbDelete(path);
      await idbDelete(`${path}.size`);
      await idbDeletePrefix(`${path}/`);
    },

    async forEachAttachmentChunk(attachment, visitor): Promise<void> {
      if (!attachment.content || attachment.content.format !== 'canto-chunked-v1') {
        throw new Error(`Chunked content descriptor required for attachment: ${attachment.name}`);
      }
      for (let index = 0; index < attachment.content.chunkCount; index++) {
        const raw = await idbGetAttachment(getChunkPath(attachment.path, index));
        if (!raw) throw new Error(`Attachment chunk missing: ${attachment.name} #${index}`);
        await visitor(index, await encryption.decrypt(raw));
      }
    },

    async saveAttachmentChunks(journalId, pageId, attachment, chunks): Promise<string> {
      if (!attachment.content || attachment.content.format !== 'canto-chunked-v1') {
        throw new Error(`Chunked content descriptor required for attachment: ${attachment.name}`);
      }
      const root = getChunkRoot(journalId, pageId, attachment);
      const existingKeys = await idbListKeys(`${root}/`);
      if (existingKeys.length > 0) {
        if (existingKeys.includes(getChunkManifestPath(root))) return root;
        throw new Error(`Incomplete attachment generation already exists: ${attachment.name}`);
      }
      let count = 0;
      try {
        for await (const chunk of chunks) {
          if (count >= attachment.content.chunkCount)
            throw new Error(`Too many attachment chunks: ${attachment.name}`);
          await idbPut(getChunkPath(root, count++), await encryption.encrypt(chunk));
        }
        if (count !== attachment.content.chunkCount)
          throw new Error(`Missing attachment chunks: ${attachment.name}`);
        await idbPut(
          getChunkManifestPath(root),
          await encryption.encrypt(JSON.stringify({ journalId, pageId, attachment })),
        );
        return root;
      } catch (error) {
        await idbDeletePrefix(`${root}/`);
        throw error;
      }
    },

    async getAttachmentStorageSize(path: string) {
      // Older records have no sidecar and are deliberately reported as unknown:
      // opening their value just to estimate its size would recreate the OOM path.
      const raw = await idbGet(`${path}.size`);
      if (raw == null) {
        return (await idbHas(path))
          ? { status: 'unknown' as const }
          : { status: 'missing' as const };
      }
      const size = Number(raw);
      return Number.isSafeInteger(size) && size >= 0
        ? { status: 'known' as const, bytes: size }
        : { status: 'unknown' as const };
    },

    async reencryptJournal(
      journal: JournalContent,
      oldKey: Uint8Array | undefined,
      newKey: Uint8Array | undefined,
      onProgress?: (current: number, total: number) => void,
    ) {
      const skippedAttachments: { name: string; size?: number }[] = [];
      const skippedPaths = new Set<string>();
      const legacyAttachments = journal.pages
        .filter((page) => !page.deleted)
        .flatMap((page) => [...(page.images ?? []), ...(page.files ?? [])])
        .filter((attachment) => !attachment.content);
      const unsafeLegacyPaths = new Set<string>();
      for (const attachment of legacyAttachments) {
        const raw = await idbGet(`${attachment.path}.size`);
        const stored = raw == null ? undefined : Number(raw);
        const size = attachment.size ?? stored;
        if (
          size == null ||
          !Number.isSafeInteger(size) ||
          size < 0 ||
          size > LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES
        ) {
          unsafeLegacyPaths.add(attachment.path);
        }
      }
      const incompatible = legacyAttachments.find(
        (attachment) => attachment.encrypted && unsafeLegacyPaths.has(attachment.path),
      );
      if (incompatible) {
        throw new Error(`Cannot safely re-encrypt legacy attachment: ${incompatible.name}`);
      }
      // Chunked payloads are password-encrypted one bounded frame at a time.
      // Unsafe legacy values remain device-encrypted and outside the journal
      // password layer rather than being opened as one whole string.
      const remapAttachments = (arr: Attachment[] | undefined): Attachment[] =>
        (arr ?? []).map((attachment) => {
          if (!attachment.content && unsafeLegacyPaths.has(attachment.path)) {
            skippedPaths.add(attachment.path);
            skippedAttachments.push({ name: attachment.name, size: attachment.size });
            return { ...attachment, encrypted: false };
          }
          // A password transition must never rewrite chunks addressed by the
          // published page. Give the replacement frames a new local/remote
          // generation and publish the page only after that generation exists.
          if (attachment.content?.format === 'canto-chunked-v1') {
            return {
              ...attachment,
              encrypted: !!newKey,
              content: { ...attachment.content, generation: generateUUID() },
            };
          }
          return { ...attachment, encrypted: !!newKey };
        });
      const pages = journal.pages
        .filter((p) => !p.deleted)
        .map((p) => ({
          ...p,
          images: remapAttachments(p.images),
          files: remapAttachments(p.files),
        }));

      const replacementRoots: { oldRoot: string; newRoot: string }[] = [];
      const transactionRootPath = transactionRoot(`password-${generateUUID()}`);
      const transaction: StorageTransaction = { phase: 'prepared', files: [] };
      try {
        // Create every chunked replacement generation before modifying pages.
        // If any bounded frame fails, the published page still points to its
        // untouched previous generation.
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
          const oldPage = journal.pages.find((page) => page.id === pages[pageIndex].id)!;
          const newPage = pages[pageIndex];
          for (const kind of ['images', 'files'] as const) {
            for (let index = 0; index < oldPage[kind].length; index++) {
              const oldAttachment = oldPage[kind][index];
              const newAttachment = newPage[kind][index];
              if (
                !oldAttachment.content ||
                oldAttachment.content.format !== 'canto-chunked-v1' ||
                !newAttachment.content ||
                newAttachment.content.format !== 'canto-chunked-v1'
              )
                continue;
              const oldRoot = oldAttachment.path;
              const newRoot = getChunkRoot(journal.id, newPage.id, newAttachment);
              try {
                for (
                  let chunkIndex = 0;
                  chunkIndex < oldAttachment.content.chunkCount;
                  chunkIndex++
                ) {
                  const raw = await idbGetAttachment(getChunkPath(oldRoot, chunkIndex));
                  if (!raw)
                    throw new Error(
                      `Attachment chunk missing: ${oldAttachment.name} #${chunkIndex}`,
                    );
                  let frame = await encryption.decrypt(raw);
                  if (oldAttachment.encrypted && oldKey) frame = await aesGcmDecrypt(frame, oldKey);
                  const data = decodeChunkFrame(
                    frame,
                    journal.id,
                    oldPage.id,
                    oldAttachment,
                    chunkIndex,
                  );
                  const nextFrame = encodeChunkFrame(
                    journal.id,
                    newPage.id,
                    newAttachment,
                    chunkIndex,
                    data,
                  );
                  const inner =
                    newAttachment.encrypted && newKey
                      ? await aesGcmEncrypt(nextFrame, newKey)
                      : nextFrame;
                  await idbPut(getChunkPath(newRoot, chunkIndex), await encryption.encrypt(inner));
                }
                await idbPut(
                  getChunkManifestPath(newRoot),
                  await encryption.encrypt(
                    JSON.stringify({
                      journalId: journal.id,
                      pageId: newPage.id,
                      attachment: newAttachment,
                    }),
                  ),
                );
                newAttachment.path = newRoot;
                replacementRoots.push({ oldRoot, newRoot });
              } catch (error) {
                await idbDeletePrefix(`${newRoot}/`);
                throw error;
              }
            }
          }
        }

        const attachKeys = await idbListKeys(getAttachmentsPrefix(journal.id));
        const encryptedAttachmentKeys: string[] = [];
        const safeLegacyPaths = new Set(
          legacyAttachments
            .filter((attachment) => !unsafeLegacyPaths.has(attachment.path))
            .map((attachment) => attachment.path),
        );
        for (const key of attachKeys) {
          if (
            safeLegacyPaths.has(key) &&
            !(await isAttachmentSizeSidecar(key)) &&
            !isChunkManifest(key) &&
            !key.includes('/chunk-v1-')
          )
            encryptedAttachmentKeys.push(key);
        }
        const total = pages.length + encryptedAttachmentKeys.length + 1;

        let progress = 0;
        for (const page of pages) {
          onProgress?.(++progress, total);
          const payload = JSON.stringify(page);
          const inner = newKey ? await aesGcmEncrypt(payload, newKey) : payload;
          transaction.files.push(
            await stageRawFile(
              transactionRootPath,
              transaction.files.length,
              getPagePath(journal.id, page.id),
              await encryption.encrypt(inner),
            ),
          );
        }

        for (const key of encryptedAttachmentKeys) {
          onProgress?.(++progress, total);
          if (skippedPaths.has(key)) continue;
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
          transaction.files.push(
            await stageRawFile(
              transactionRootPath,
              transaction.files.length,
              key,
              await encryption.encrypt(toDeviceEncrypt),
            ),
          );
        }

        // Chunk manifests are deliberately device-encrypted only: their attachment
        // flags must follow the rewritten pages, but they are not attachment payloads.
        for (const page of pages) {
          for (const attachment of [...(page.images ?? []), ...(page.files ?? [])]) {
            if (attachment.content?.format === 'canto-chunked-v1' && attachment.path) {
              await idbPut(
                getChunkManifestPath(attachment.path),
                await encryption.encrypt(
                  JSON.stringify({ journalId: journal.id, pageId: page.id, attachment }),
                ),
              );
            }
          }
        }

        onProgress?.(++progress, total);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { pages: _p, ...metadata } = journal;
        const metadataPayload = JSON.stringify(metadata);
        const metadataInner = newKey
          ? await aesGcmEncrypt(metadataPayload, newKey)
          : metadataPayload;
        transaction.files.push(
          await stageRawFile(
            transactionRootPath,
            transaction.files.length,
            getMetadataPath(journal.id),
            await encryption.encrypt(metadataInner),
          ),
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
        transaction.files.push(
          await stageRawFile(
            transactionRootPath,
            transaction.files.length,
            JOURNALS_INDEX_PATH,
            await encryption.encrypt(JSON.stringify(index)),
          ),
        );
        transaction.newRoots = replacementRoots.map(({ newRoot }) => newRoot);
        transaction.oldRoots = replacementRoots.map(({ oldRoot }) => oldRoot);
        await writeTransactionMarker(transactionRootPath, transaction);
        transaction.phase = 'committing';
        await writeTransactionMarker(transactionRootPath, transaction);
        await applyStorageTransaction(transaction);
        await idbDeletePrefix(`${transactionRootPath}/`);
        // The new page is now durable. Old roots are only garbage-collected
        // afterwards, so a failed copy can never make the published version
        // unreadable.
        return { skippedAttachments };
      } catch (error) {
        if (transaction.phase === 'prepared') {
          await Promise.all(
            replacementRoots.map(({ newRoot }) =>
              idbDeletePrefix(`${newRoot}/`).catch(() => undefined),
            ),
          );
          await idbDeletePrefix(`${transactionRootPath}/`).catch(() => undefined);
        }
        throw error;
      }
    },

    async reencryptAll(
      oldDeviceDecrypt: (ciphertext: string) => Promise<string>,
      _oldDeviceEncryptUnused: (plaintext: string) => Promise<string>,
      newDeviceEncrypt: (plaintext: string) => Promise<string>,
      onProgress?: (current: number, total: number) => void,
    ): Promise<void> {
      const indexData = await idbGet(JOURNALS_INDEX_PATH);
      const journals = indexData
        ? safeJsonParse<JournalIndex>(await oldDeviceDecrypt(indexData), 'journals index').journals
        : [];
      const root = transactionRoot(`device-${generateUUID()}`);
      const transaction: StorageTransaction = { phase: 'prepared', files: [] };
      try {
        const keys = (await idbListKeys(`${BASE_PATH}/`)).filter(
          (key) =>
            !key.startsWith(TRANSACTIONS_PREFIX) &&
            key !== DEVICE_KEY_ROTATION_COMPLETE_PATH &&
            !key.endsWith('.size'),
        );
        const unsafeLegacy = [] as string[];
        for (const key of keys) {
          if (
            !key.includes('/attachments/') ||
            key.includes('/chunk-v1-') ||
            isChunkManifest(key)
          ) {
            continue;
          }
          const rawSize = await idbGet(`${key}.size`);
          const size = rawSize == null ? undefined : Number(rawSize);
          if (
            size == null ||
            !Number.isSafeInteger(size) ||
            size < 0 ||
            size > LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES
          ) {
            unsafeLegacy.push(key);
          }
        }
        if (unsafeLegacy.length > 0) {
          throw new Error(
            `Cannot safely rotate device key for legacy attachment: ${unsafeLegacy[0]}`,
          );
        }
        let staged = 0;
        let processed = 0;
        for (const journal of journals) {
          const prefix = `${getJournalPath(journal.id)}/`;
          for (const key of keys.filter((candidate) => candidate.startsWith(prefix))) {
            const ciphertext = await idbGet(key);
            if (ciphertext != null) {
              transaction.files.push(
                await stageRawFile(
                  root,
                  staged++,
                  key,
                  await newDeviceEncrypt(await oldDeviceDecrypt(ciphertext)),
                ),
              );
            }
          }
          onProgress?.(++processed, journals.length);
        }
        if (indexData != null) {
          transaction.files.push(
            await stageRawFile(
              root,
              staged,
              JOURNALS_INDEX_PATH,
              await newDeviceEncrypt(await oldDeviceDecrypt(indexData)),
            ),
          );
        }
        // This raw marker is staged with every ciphertext. It becomes visible
        // only at the same durable commit point, and contains no key material.
        transaction.files.push(
          await stageRawFile(root, staged + 1, DEVICE_KEY_ROTATION_COMPLETE_PATH, 'complete'),
        );
        await writeTransactionMarker(root, transaction);
        transaction.phase = 'committing';
        await writeTransactionMarker(root, transaction);
        await applyStorageTransaction(transaction);
        await idbDeletePrefix(`${root}/`);
      } catch (error) {
        if (transaction.phase === 'prepared') await idbDeletePrefix(`${root}/`);
        throw error;
      }
    },
  };
  return serializeDeviceKeyWrites(store);
}
