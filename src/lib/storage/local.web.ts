import type { Journal, JournalContent, Page, Attachment } from 'canto-data';
import type { EncryptionService } from '@/lib/encryption';
import { aesGcmEncrypt, aesGcmDecrypt, generateUUID, uint8ToBase64 } from '@/lib/encryption/utils';
import { safeJsonParse } from '@/lib/utils/json';
import {
  catalogToOverview,
  createPageCatalog,
  isPageCatalogV1,
  withCatalogPage,
  type PageCatalogV1,
} from '@/lib/journal-overview';
import type {
  JournalImportRecoveryInfo,
  JournalOverviewReadOptions,
  JournalSyncSnapshot,
  LocalStore,
} from './types';
import { serializeDeviceKeyWrites } from './write-barrier';
import { recordStorageIo } from './io-counters';
import {
  base64ByteLength,
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
const IMPORTS_PREFIX = `${BASE_PATH}/.imports/`;

function getJournalPath(journalId: string): string {
  return `${BASE_PATH}/${journalId}`;
}

function getMetadataPath(journalId: string): string {
  return `${getJournalPath(journalId)}/metadata.json`;
}

function getPageCatalogPath(journalId: string): string {
  return `${getJournalPath(journalId)}/page-catalog.json`;
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

function getImportMarkerPath(id: string): string {
  return `${IMPORTS_PREFIX}${id}`;
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
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let settled = false;
    const clearHandlers = () => {
      clearTimeout(timeout);
      tx.oncomplete = null;
      tx.onerror = null;
      tx.onabort = null;
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      clearHandlers();
      resolve();
    };
    const rejectOnce = (error: Error | DOMException | null) => {
      if (settled) return;
      settled = true;
      clearHandlers();
      reject(error);
    };
    const timeout = setTimeout(() => {
      rejectOnce(new Error(`[IDB] Timeout writing ${path}`));
      try {
        tx.abort();
      } catch {
        // The transaction may have completed between timeout and abort.
      }
    }, IDB_TIMEOUT_MS);

    tx.oncomplete = resolveOnce;
    tx.onerror = () => rejectOnce(tx.error);
    tx.onabort = () => rejectOnce(tx.error ?? new Error('[IDB] Transaction aborted'));
    try {
      store.put({ path, data });
    } catch (error) {
      rejectOnce(error instanceof Error ? error : new Error(String(error)));
    }
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
  recordStorageIo('decryptions');
  if (path.endsWith('/metadata.json')) recordStorageIo('metadataReads');
  else if (path.endsWith('/page-catalog.json')) recordStorageIo('catalogReads');
  else if (path.includes('/pages/') && path.endsWith('.json')) recordStorageIo('pageReads');
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

/**
 * Older journals can retain an encrypted attachment flag after their password
 * layer was removed. Chunk manifests preserve that flag, so treat a failed
 * password decrypt as device-only data and let frame validation decide whether
 * the chunk is otherwise valid.
 */
async function decryptAttachmentFrame(
  frame: string,
  encrypted: boolean,
  derivedKey?: Uint8Array,
): Promise<string> {
  if (!encrypted || !derivedKey) return frame;
  try {
    return await aesGcmDecrypt(frame, derivedKey);
  } catch {
    return frame;
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

type JournalImportPhase = 'prepared' | 'writing' | 'publishing' | 'committed';
interface JournalImportMarker {
  version: 1 | 2;
  journalId: string;
  phase: JournalImportPhase;
  expectedPageCount?: number;
}

function parseJournalImportMarker(value: string, id: string): JournalImportMarker | null {
  try {
    const marker = JSON.parse(value) as Partial<JournalImportMarker>;
    if (
      (marker.version === 1 || marker.version === 2) &&
      marker.journalId === id &&
      (marker.phase === 'prepared' ||
        marker.phase === 'writing' ||
        marker.phase === 'publishing' ||
        marker.phase === 'committed') &&
      (marker.expectedPageCount === undefined ||
        (Number.isSafeInteger(marker.expectedPageCount) && marker.expectedPageCount >= 0))
    ) {
      return marker as JournalImportMarker;
    }
  } catch {
    // Unknown/corrupt markers are never publication authority.
  }
  return null;
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

  function journalIndexEntry(metadata: Omit<JournalContent, 'pages'>): Journal {
    return {
      id: metadata.id,
      title: metadata.title,
      icon: metadata.icon,
      date: metadata.date,
      secure: metadata.secure,
      salt: metadata.salt,
      biometric: metadata.biometric,
      kdfIterations: metadata.kdfIterations,
      themeOverride: metadata.settings.themeOverride,
    };
  }

  async function recoveredImportIndexEntry(marker: JournalImportMarker): Promise<Journal | null> {
    if (marker.phase !== 'publishing' || marker.expectedPageCount === undefined) return null;
    const metadataRaw = await readEncrypted(getMetadataPath(marker.journalId), encryption);
    if (!metadataRaw) return null;
    try {
      const metadata = safeJsonParse<Omit<JournalContent, 'pages'>>(
        metadataRaw,
        `journal:${marker.journalId} import metadata`,
      );
      if (metadata.id !== marker.journalId || metadata.secure) return null;
      const catalog = await readPageCatalog(marker.journalId);
      const pageCount = (await idbListKeys(getPagesPrefix(marker.journalId))).filter((path) =>
        path.endsWith('.json'),
      ).length;
      if (
        !catalog ||
        catalog.pageCount !== marker.expectedPageCount ||
        pageCount !== marker.expectedPageCount
      ) {
        return null;
      }
      return journalIndexEntry(metadata);
    } catch {
      return null;
    }
  }

  async function recoverIncompleteJournalImports(): Promise<void> {
    const index = await readIndex();
    const committedIds = new Set(index.journals.map((journal) => journal.id));
    for (const markerPath of await idbListKeys(IMPORTS_PREFIX)) {
      const id = markerPath.slice(IMPORTS_PREFIX.length);
      if (!id) continue;
      const raw = await idbGet(markerPath);
      const marker = raw ? parseJournalImportMarker(raw, id) : null;
      const journalId = marker?.journalId ?? id;
      if (!committedIds.has(journalId) && marker) {
        const recovered = await recoveredImportIndexEntry(marker);
        if (recovered) {
          index.journals.push(recovered);
          await writeIndex(index);
          committedIds.add(journalId);
        }
      }
      if (!committedIds.has(journalId)) await idbDeletePrefix(`${getJournalPath(journalId)}/`);
      await idbDelete(markerPath);
    }
  }

  async function writePageCatalog(
    journalId: string,
    pages: readonly Page[],
    derivedKey?: Uint8Array,
  ): Promise<void> {
    await writeEncrypted(
      getPageCatalogPath(journalId),
      JSON.stringify(createPageCatalog(journalId, pages)),
      encryption,
      derivedKey,
    );
  }

  async function readPageCatalog(
    journalId: string,
    derivedKey?: Uint8Array,
  ): Promise<PageCatalogV1 | null> {
    const raw = await readEncrypted(getPageCatalogPath(journalId), encryption, derivedKey);
    if (!raw) return null;
    try {
      const parsed = safeJsonParse<unknown>(raw, `journal:${journalId} page catalog`);
      return isPageCatalogV1(parsed, journalId) ? parsed : null;
    } catch {
      return null;
    }
  }

  async function readJournalPages(
    journalId: string,
    derivedKey?: Uint8Array,
    options?: JournalOverviewReadOptions,
    skipMalformedPages = false,
  ): Promise<Page[]> {
    if (options?.signal?.aborted) throw new Error('Journal catalog rebuild cancelled');
    const pageKeys = (await idbListKeys(getPagesPrefix(journalId))).filter((key) =>
      key.endsWith('.json'),
    );
    const pages: Page[] = [];
    options?.onRebuildProgress?.({ current: 0, total: pageKeys.length });
    for (const [index, key] of pageKeys.entries()) {
      if (options?.signal?.aborted) throw new Error('Journal catalog rebuild cancelled');
      const pageRaw = await readEncrypted(key, encryption, derivedKey);
      if (pageRaw) {
        try {
          pages.push(safeJsonParse<Page>(pageRaw, `page:${key}`));
        } catch (error) {
          if (!skipMalformedPages) throw error;
        }
      }
      options?.onRebuildProgress?.({ current: index + 1, total: pageKeys.length });
    }
    return pages;
  }

  async function encryptForStorage(data: string, derivedKey?: Uint8Array): Promise<string> {
    const inner = derivedKey ? await aesGcmEncrypt(data, derivedKey) : data;
    return encryption.encrypt(inner);
  }

  async function commitPageAndCatalog(
    journalId: string,
    page: Page,
    catalog: PageCatalogV1,
    derivedKey?: Uint8Array,
  ): Promise<void> {
    const root = transactionRoot(`page-${generateUUID()}`);
    const transaction: StorageTransaction = { phase: 'prepared', files: [] };
    try {
      transaction.files.push(
        await stageRawFile(
          root,
          0,
          getPagePath(journalId, page.id),
          await encryptForStorage(JSON.stringify(page), derivedKey),
        ),
        await stageRawFile(
          root,
          1,
          getPageCatalogPath(journalId),
          await encryptForStorage(JSON.stringify(catalog), derivedKey),
        ),
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
  }

  async function commitJournalAndIndex(
    journal: JournalContent,
    metadata: Omit<JournalContent, 'pages'>,
    index: JournalIndex,
    derivedKey?: Uint8Array,
  ): Promise<void> {
    const root = transactionRoot(`journal-${generateUUID()}`);
    const transaction: StorageTransaction = { phase: 'prepared', files: [] };
    try {
      let fileIndex = 0;
      transaction.files.push(
        await stageRawFile(
          root,
          fileIndex++,
          getMetadataPath(journal.id),
          await encryptForStorage(JSON.stringify(metadata), derivedKey),
        ),
      );
      for (const page of journal.pages) {
        transaction.files.push(
          await stageRawFile(
            root,
            fileIndex++,
            getPagePath(journal.id, page.id),
            await encryptForStorage(JSON.stringify(page), derivedKey),
          ),
        );
      }
      transaction.files.push(
        await stageRawFile(
          root,
          fileIndex++,
          getPageCatalogPath(journal.id),
          await encryptForStorage(
            JSON.stringify(createPageCatalog(journal.id, journal.pages)),
            derivedKey,
          ),
        ),
        await stageRawFile(
          root,
          fileIndex,
          JOURNALS_INDEX_PATH,
          await encryptForStorage(JSON.stringify(index)),
        ),
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
  }

  const store: LocalStore = {
    async initialize(): Promise<void> {
      await openDB();
      await recoverTransactions();
      await recoverIncompleteJournalImports();
    },

    async listJournals(): Promise<Journal[]> {
      const index = await readIndex();
      return index.journals;
    },

    async getJournal(id: string, derivedKey?: Uint8Array): Promise<JournalContent | null> {
      const raw = await readEncrypted(getMetadataPath(id), encryption, derivedKey);
      if (!raw) return null;

      const metadata = safeJsonParse<Omit<JournalContent, 'pages'>>(raw, `journal:${id} metadata`);

      const pages = await readJournalPages(id, derivedKey);
      return { ...metadata, pages };
    },

    async getJournalOverview(
      id: string,
      derivedKey?: Uint8Array,
      options?: JournalOverviewReadOptions,
    ) {
      const metadataRaw = await readEncrypted(getMetadataPath(id), encryption, derivedKey);
      if (!metadataRaw) return null;
      const metadata = safeJsonParse<Omit<JournalContent, 'pages'>>(
        metadataRaw,
        `journal:${id} metadata`,
      );
      const catalog = await readPageCatalog(id, derivedKey);
      if (catalog) return catalogToOverview(metadata, catalog);

      recordStorageIo('catalogRebuilds');
      // A malformed legacy page must not prevent the journal catalog from
      // reopening. The raw page is retained for recovery; sync remains strict
      // and therefore cannot overwrite it with an incomplete local snapshot.
      const pages = await readJournalPages(id, derivedKey, options, true);
      if (options?.signal?.aborted) throw new Error('Journal catalog rebuild cancelled');
      await writePageCatalog(id, pages, derivedKey);
      return catalogToOverview(metadata, createPageCatalog(id, pages));
    },

    async getJournalSyncSnapshot(
      id: string,
      derivedKey?: Uint8Array,
    ): Promise<JournalSyncSnapshot | null> {
      const overview = await this.getJournalOverview!(id, derivedKey);
      if (!overview) return null;
      return {
        metadata: overview.metadata,
        pages: new Map(
          overview.pages.map((page) => [
            page.id,
            { modified: page.modified ?? 0, ...(page.deleted ? { deleted: true } : {}) },
          ]),
        ),
      };
    },

    async saveJournal(journal: JournalContent, derivedKey?: Uint8Array): Promise<void> {
      const metadata = { ...journal } as Partial<JournalContent>;
      delete metadata.pages;
      const journalMetadata = metadata as Omit<JournalContent, 'pages'>;
      const index = await readIndex();
      const entry = journalIndexEntry(journalMetadata);
      const existing = index.journals.findIndex((j) => j.id === journal.id);
      if (existing >= 0) {
        index.journals[existing] = entry;
      } else {
        index.journals.push(entry);
      }
      await commitJournalAndIndex(journal, journalMetadata, index, derivedKey);
    },

    async saveJournalMetadata(metadata, derivedKey): Promise<void> {
      await writeEncrypted(
        getMetadataPath(metadata.id),
        JSON.stringify(metadata),
        encryption,
        derivedKey,
      );
      const index = await readIndex();
      const entry = journalIndexEntry(metadata);
      const existing = index.journals.findIndex((journal) => journal.id === metadata.id);
      if (existing >= 0) index.journals[existing] = entry;
      else index.journals.push(entry);
      await writeIndex(index);
    },

    async beginJournalImport(id: string): Promise<void> {
      await idbPut(
        getImportMarkerPath(id),
        JSON.stringify({ version: 2, journalId: id, phase: 'prepared' }),
      );
    },

    async updateJournalImport(id, phase, recovery?: JournalImportRecoveryInfo): Promise<void> {
      const path = getImportMarkerPath(id);
      if (!(await idbHas(path))) throw new Error(`Journal import marker is missing: ${id}`);
      await idbPut(
        path,
        JSON.stringify({
          version: 2,
          journalId: id,
          phase,
          ...(recovery ? { expectedPageCount: recovery.expectedPageCount } : {}),
        }),
      );
    },

    async completeJournalImport(id: string): Promise<void> {
      await idbDelete(getImportMarkerPath(id));
    },

    async abortJournalImport(id: string): Promise<void> {
      await this.deleteJournal(id);
      await idbDelete(getImportMarkerPath(id));
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
      let catalog = await readPageCatalog(journalId, derivedKey);
      if (!catalog) {
        catalog = createPageCatalog(
          journalId,
          await readJournalPages(journalId, derivedKey, undefined, true),
        );
      }
      await commitPageAndCatalog(journalId, updated, withCatalogPage(catalog, updated), derivedKey);
    },

    async deletePage(journalId: string, pageId: string, derivedKey?: Uint8Array): Promise<void> {
      const page = await this.getPage(journalId, pageId, derivedKey);
      if (!page) return;

      const deleted = { ...page, deleted: true, modified: Date.now() };
      let catalog = await readPageCatalog(journalId, derivedKey);
      if (!catalog) {
        catalog = createPageCatalog(
          journalId,
          await readJournalPages(journalId, derivedKey, undefined, true),
        );
      }
      if (catalog) {
        await commitPageAndCatalog(
          journalId,
          deleted,
          withCatalogPage(catalog, deleted),
          derivedKey,
        );
      }

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
            uint8ToBase64(bytes),
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
      let resolvedPath = path;
      // A background sync can replace a partial immutable generation while a
      // page screen is open. Follow its bounded redirect chain so that screen's
      // stale attachment descriptor still opens the replacement content.
      for (let redirectDepth = 0; redirectDepth < 4; redirectDepth++) {
        const ciphertext = await idbGetAttachment(resolvedPath);
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
        const manifestCiphertext = await idbGetAttachment(getChunkManifestPath(resolvedPath));
        if (manifestCiphertext) {
          const manifest = safeJsonParse<{
            journalId: string;
            pageId: string;
            attachment: Attachment;
          }>(await encryption.decrypt(manifestCiphertext), `attachment manifest:${resolvedPath}`);
          const content = manifest.attachment.content;
          if (!content || content.format !== 'canto-chunked-v1') {
            throw new Error(`Invalid chunked attachment manifest: ${manifest.attachment.name}`);
          }
          const chunks: string[] = [];
          for (let index = 0; index < content.chunkCount; index++) {
            const raw = await idbGetAttachment(getChunkPath(resolvedPath, index));
            if (!raw)
              throw new Error(`Attachment chunk missing: ${manifest.attachment.name} #${index}`);
            const frame = await decryptAttachmentFrame(
              await encryption.decrypt(raw),
              manifest.attachment.encrypted,
              derivedKey,
            );
            chunks.push(
              decodeChunkFrame(
                frame,
                manifest.journalId,
                manifest.pageId,
                manifest.attachment,
                index,
              ),
            );
          }
          return joinBase64Chunks(chunks);
        }
        const redirectCiphertext = await idbGetAttachment(`${resolvedPath}.redirect`);
        if (!redirectCiphertext) return null;
        resolvedPath = await encryption.decrypt(redirectCiphertext);
      }
      throw new Error(`Attachment redirect chain is too deep: ${path}`);
    },

    async deleteAttachment(path: string): Promise<void> {
      await idbDelete(path);
      await idbDelete(`${path}.size`);
      await idbDeletePrefix(`${path}/`);
    },

    async forEachAttachmentChunk(attachment, visitor, indexes): Promise<void> {
      if (!attachment.content || attachment.content.format !== 'canto-chunked-v1') {
        throw new Error(`Chunked content descriptor required for attachment: ${attachment.name}`);
      }
      for (let index = 0; index < attachment.content.chunkCount; index++) {
        // A resumed web sync supplies only missing remote indexes. Skipping
        // here is deliberately before IndexedDB and WebCrypto work.
        if (indexes && !indexes.has(index)) continue;
        const raw = await idbGetAttachment(getChunkPath(attachment.path, index));
        if (!raw) throw new Error(`Attachment chunk missing: ${attachment.name} #${index}`);
        await visitor(index, await encryption.decrypt(raw));
      }
    },

    async forEachAttachmentDisplayChunk(attachment, visitor, derivedKey): Promise<void> {
      if (attachment.content?.format !== 'canto-chunked-v1') {
        if (
          attachment.size === undefined ||
          attachment.size > LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES
        ) {
          throw new Error(
            `Legacy attachment is too large to materialize safely: ${attachment.name}`,
          );
        }
        const data = await this.getAttachment(
          attachment.path,
          attachment.encrypted ? derivedKey : undefined,
        );
        if (!data) throw new Error(`Attachment not found: ${attachment.name}`);
        await visitor(0, data);
        return;
      }

      const root = attachment.path;
      const manifestRaw = await idbGetAttachment(getChunkManifestPath(root));
      if (!manifestRaw) throw new Error(`Attachment manifest missing: ${attachment.name}`);
      const manifest = safeJsonParse<{
        journalId: string;
        pageId: string;
        attachment: Attachment;
      }>(await encryption.decrypt(manifestRaw), `attachment manifest:${attachment.path}`);
      if (
        manifest.attachment.id !== attachment.id ||
        manifest.attachment.content?.generation !== attachment.content.generation ||
        manifest.attachment.content?.chunkCount !== attachment.content.chunkCount
      ) {
        throw new Error(`Attachment manifest identity mismatch: ${attachment.name}`);
      }

      let written = 0;
      for (let index = 0; index < attachment.content.chunkCount; index++) {
        const raw = await idbGetAttachment(getChunkPath(root, index));
        if (!raw) throw new Error(`Attachment chunk missing: ${attachment.name} #${index}`);
        const frame = await decryptAttachmentFrame(
          await encryption.decrypt(raw),
          attachment.encrypted,
          derivedKey,
        );
        const data = decodeChunkFrame(
          frame,
          manifest.journalId,
          manifest.pageId,
          attachment,
          index,
        );
        written += base64ByteLength(data);
        await visitor(index, data);
      }
      if (written !== attachment.content.byteLength) {
        throw new Error(`Attachment display length mismatch: ${attachment.name}`);
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
      const unsafeLegacySizes = new Map<string, number | undefined>();
      for (const attachment of legacyAttachments) {
        // The sidecar is the local storage measurement. Metadata can be stale,
        // so a small declared value must not authorize a large whole-value read.
        const raw = await idbGet(`${attachment.path}.size`);
        const stored = raw == null ? undefined : Number(raw);
        const declared = attachment.size;
        const validStored = stored != null && Number.isSafeInteger(stored) && stored >= 0;
        const validDeclared = declared == null || (Number.isSafeInteger(declared) && declared >= 0);
        const size = validStored && validDeclared ? Math.max(stored, declared ?? 0) : undefined;
        if (size == null || size > LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES) {
          unsafeLegacyPaths.add(attachment.path);
          unsafeLegacySizes.set(attachment.path, size);
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
            skippedAttachments.push({
              name: attachment.name,
              size: unsafeLegacySizes.get(attachment.path) ?? attachment.size,
            });
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
      const chunkFrames = pages
        .flatMap((page) => [...(page.images ?? []), ...(page.files ?? [])])
        .reduce(
          (count, attachment) =>
            count +
            (attachment.content?.format === 'canto-chunked-v1' ? attachment.content.chunkCount : 0),
          0,
        );
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
      const total = chunkFrames + pages.length + encryptedAttachmentKeys.length + 1;

      const replacementRoots: { oldRoot: string; newRoot: string }[] = [];
      const transactionRootPath = transactionRoot(`password-${generateUUID()}`);
      const transaction: StorageTransaction = { phase: 'prepared', files: [] };
      let progress = 0;
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
                  const frame = await decryptAttachmentFrame(
                    await encryption.decrypt(raw),
                    oldAttachment.encrypted,
                    oldKey,
                  );
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
                  onProgress?.(++progress, total);
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
