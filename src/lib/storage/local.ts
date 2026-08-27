import { Paths, File, Directory } from 'expo-file-system';
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
  ReencryptionResult,
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

const BASE_DIR_NAME = 'canto';
const JOURNALS_INDEX_NAME = 'journals.json';
const DEVICE_KEY_ROTATION_COMPLETE_NAME = '.device-key-rotation-complete';
const IMPORTS_DIR_NAME = '.imports';

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

function getPageCatalogFile(journalId: string): File {
  return new File(getJournalDir(journalId), 'page-catalog.json');
}

function getPageFile(journalId: string, pageId: string): File {
  return new File(getPagesDir(journalId), `${pageId}.json`);
}

function getJournalsIndexFile(): File {
  return new File(getBaseDir(), JOURNALS_INDEX_NAME);
}

/** Durable, keyless proof that a device-data transaction committed. */
function getDeviceKeyRotationCompleteFile(): File {
  return new File(getBaseDir(), DEVICE_KEY_ROTATION_COMPLETE_NAME);
}

function getImportsDir(): Directory {
  return new Directory(getBaseDir(), IMPORTS_DIR_NAME);
}

function getImportMarker(id: string): File {
  return new File(getImportsDir(), id);
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

function getChunkRoot(journalId: string, pageId: string, attachment: Attachment): Directory {
  // New descriptors receive an immutable generation, so writes are copy-on-
  // write and the old root remains readable until the updated page is saved.
  const generation = attachment.content?.generation ?? 'legacy';
  return new Directory(
    getAttachmentsDir(journalId),
    `chunk-v1-${pageId}-${attachment.id}-${generation}`,
  );
}

function getChunkFile(root: Directory, index: number): File {
  return new File(root, String(index));
}

function getChunkManifest(root: Directory): File {
  return new File(root, 'manifest');
}

function listFilesRecursively(dir: Directory): File[] {
  if (!dir.exists) return [];
  const files: File[] = [];
  for (const entry of dir.list()) {
    if (entry instanceof File) files.push(entry);
    else if (entry instanceof Directory) files.push(...listFilesRecursively(entry));
  }
  return files;
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
  recordStorageIo('decryptions');
  if (file.uri.endsWith('/metadata.json')) recordStorageIo('metadataReads');
  else if (file.uri.endsWith('/page-catalog.json')) recordStorageIo('catalogReads');
  else if (file.uri.includes('/pages/') && file.uri.endsWith('.json')) recordStorageIo('pageReads');
  try {
    const ciphertext = await file.text();
    // Layer 1: device decryption (always)
    const deviceDecrypted = await encryption.decrypt(ciphertext);
    // Layer 2: password decryption (if derived key present)
    if (derivedKey) {
      try {
        return await aesGcmDecrypt(deviceDecrypted, derivedKey);
      } catch {
        // Data is not password-encrypted — return device-decrypted content.
        // This happens for metadata/pages in journals with encrypted attachments
        // but no active password (auto-derive provides a key, but only
        // attachments are password-encrypted, not metadata).
        return deviceDecrypted;
      }
    }
    return deviceDecrypted;
  } catch (err) {
    console.warn(`[Canto] Failed to decrypt ${file.uri}:`, err);
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
  file: File,
  data: string,
  encryption: EncryptionService,
  derivedKey?: Uint8Array,
): Promise<void> {
  // Layer 1: password encryption (if derived key present)
  const toDeviceEncrypt = derivedKey ? await aesGcmEncrypt(data, derivedKey) : data;
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

/** Move source to target, deleting target first if it exists (Android rejects move to existing). */
function moveFile(source: File, target: File): void {
  if (target.exists) {
    target.delete();
  }
  source.move(target);
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

/**
 * Transaction staging is deliberately separate from .tmp recovery.  A staged
 * file is never moved away: keeping it until the durable commit marker is
 * removed lets startup replay a partially applied commit without either key.
 * Marker JSON carries paths only, never plaintext or key material.
 */
const TRANSACTIONS_DIR_NAME = '.transactions';
type TransactionPhase = 'prepared' | 'committing';
interface StorageTransaction {
  phase: TransactionPhase;
  files: { target: string; staged: string }[];
  newRoots?: string[];
  oldRoots?: string[];
}

function getTransactionsDir(): Directory {
  return new Directory(getBaseDir(), TRANSACTIONS_DIR_NAME);
}

function getTransactionDir(id: string): Directory {
  return new Directory(getTransactionsDir(), id);
}

function getTransactionMarker(dir: Directory): File {
  return new File(dir, 'marker.json');
}

function writeTransactionMarker(dir: Directory, transaction: StorageTransaction): void {
  const marker = getTransactionMarker(dir);
  if (!marker.exists) marker.create({ intermediates: true });
  marker.write(JSON.stringify(transaction));
}

async function readTransactionMarker(dir: Directory): Promise<StorageTransaction | null> {
  const marker = getTransactionMarker(dir);
  if (!marker.exists) return null;
  try {
    return JSON.parse(await marker.text()) as StorageTransaction;
  } catch {
    // An incomplete marker has not passed a durable commit point.  Retaining
    // the old view is safer than trying to infer a partially written intent.
    return null;
  }
}

function stageRawFile(dir: Directory, index: number, target: File, ciphertext: string) {
  const staged = new File(dir, `file-${index}`);
  if (!staged.exists) staged.create({ intermediates: true });
  staged.write(ciphertext);
  return { target: target.uri, staged: staged.uri };
}

async function applyStorageTransaction(transaction: StorageTransaction): Promise<void> {
  for (const { target, staged } of transaction.files) {
    const source = new File(staged);
    if (!source.exists) throw new Error(`Incomplete storage transaction staging: ${staged}`);
    const destination = new File(target);
    if (!destination.exists) destination.create({ intermediates: true });
    destination.write(await source.text());
  }
  for (const root of transaction.oldRoots ?? []) {
    const directory = new Directory(root);
    if (directory.exists) directory.delete();
  }
}

async function recoverTransactions(): Promise<void> {
  const root = getTransactionsDir();
  if (!root.exists) return;
  for (const entry of root.list()) {
    if (!(entry instanceof Directory)) continue;
    const transaction = await readTransactionMarker(entry);
    if (transaction?.phase === 'committing') {
      await applyStorageTransaction(transaction);
    }
    // A missing/corrupt/prepared marker deliberately rolls back to the old
    // committed files. New chunk roots were never referenced by old pages.
    if (transaction?.phase !== 'committing') {
      for (const rootPath of transaction?.newRoots ?? []) {
        const directory = new Directory(rootPath);
        if (directory.exists) directory.delete();
      }
    }
    if (entry.exists) entry.delete();
  }
}

export function createLocalStore(encryption: EncryptionService): LocalStore {
  async function readIndex(): Promise<JournalIndex> {
    const file = getJournalsIndexFile();
    const raw = await readEncrypted(file, encryption);
    if (!raw) return { journals: [] };
    return safeJsonParse<JournalIndex>(raw, 'journals index');
  }

  async function writeIndex(index: JournalIndex): Promise<void> {
    const file = getJournalsIndexFile();
    await writeEncrypted(file, JSON.stringify(index), encryption);
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
    // A password-encrypted metadata file cannot be validated after process
    // death without asking for the journal password. In that case rollback is
    // safer than publishing an unverifiable root. Non-secure imports can be
    // validated entirely with device encryption and replayed idempotently.
    if (marker.phase !== 'publishing' || marker.expectedPageCount === undefined) return null;
    const metadataRaw = await readEncrypted(getMetadataFile(marker.journalId), encryption);
    if (!metadataRaw) return null;
    try {
      const metadata = safeJsonParse<Omit<JournalContent, 'pages'>>(
        metadataRaw,
        `journal:${marker.journalId} import metadata`,
      );
      if (metadata.id !== marker.journalId || metadata.secure) return null;
      const catalog = await readPageCatalog(marker.journalId);
      const pageFiles = getPagesDir(marker.journalId);
      const pageCount = pageFiles.exists
        ? pageFiles.list().filter((entry) => entry instanceof File && entry.uri.endsWith('.json'))
            .length
        : 0;
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
    const markers = getImportsDir();
    if (!markers.exists) return;
    const index = await readIndex();
    const committedIds = new Set(index.journals.map((journal) => journal.id));
    for (const entry of markers.list()) {
      if (!(entry instanceof File)) continue;
      const marker = await entry
        .text()
        .then((value) => parseJournalImportMarker(value, entry.name));
      const journalId = marker?.journalId ?? entry.name;
      if (!committedIds.has(journalId) && marker) {
        const recovered = await recoveredImportIndexEntry(marker);
        if (recovered) {
          index.journals.push(recovered);
          await writeIndex(index);
          committedIds.add(journalId);
        }
      }
      if (!committedIds.has(journalId)) {
        const journalDir = getJournalDir(journalId);
        if (journalDir.exists) journalDir.delete();
      }
      if (entry.exists) entry.delete();
    }
  }

  async function writePageCatalog(
    journalId: string,
    pages: readonly Page[],
    derivedKey?: Uint8Array,
  ): Promise<void> {
    await writeEncrypted(
      getPageCatalogFile(journalId),
      JSON.stringify(createPageCatalog(journalId, pages)),
      encryption,
      derivedKey,
    );
  }

  async function readPageCatalog(
    journalId: string,
    derivedKey?: Uint8Array,
  ): Promise<PageCatalogV1 | null> {
    const raw = await readEncrypted(getPageCatalogFile(journalId), encryption, derivedKey);
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
    const pagesDirectory = getPagesDir(journalId);
    if (!pagesDirectory.exists) {
      options?.onRebuildProgress?.({ current: 0, total: 0 });
      return [];
    }
    const pageFiles = pagesDirectory
      .list()
      .filter((entry): entry is File => entry instanceof File && entry.uri.endsWith('.json'));
    const pages: Page[] = [];
    options?.onRebuildProgress?.({ current: 0, total: pageFiles.length });
    for (const [index, entry] of pageFiles.entries()) {
      if (options?.signal?.aborted) throw new Error('Journal catalog rebuild cancelled');
      const pageRaw = await readEncrypted(entry, encryption, derivedKey);
      if (pageRaw) {
        try {
          pages.push(safeJsonParse<Page>(pageRaw, `page:${entry.name}`));
        } catch (error) {
          if (!skipMalformedPages) throw error;
        }
      }
      options?.onRebuildProgress?.({ current: index + 1, total: pageFiles.length });
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
    const transactionDir = getTransactionDir(`page-${generateUUID()}`);
    transactionDir.create({ intermediates: true });
    const transaction: StorageTransaction = { phase: 'prepared', files: [] };
    try {
      transaction.files.push(
        stageRawFile(
          transactionDir,
          0,
          getPageFile(journalId, page.id),
          await encryptForStorage(JSON.stringify(page), derivedKey),
        ),
        stageRawFile(
          transactionDir,
          1,
          getPageCatalogFile(journalId),
          await encryptForStorage(JSON.stringify(catalog), derivedKey),
        ),
      );
      writeTransactionMarker(transactionDir, transaction);
      transaction.phase = 'committing';
      writeTransactionMarker(transactionDir, transaction);
      await applyStorageTransaction(transaction);
      transactionDir.delete();
    } catch (error) {
      if (transaction.phase === 'prepared' && transactionDir.exists) transactionDir.delete();
      throw error;
    }
  }

  async function commitJournalAndIndex(
    journal: JournalContent,
    metadata: Omit<JournalContent, 'pages'>,
    index: JournalIndex,
    derivedKey?: Uint8Array,
  ): Promise<void> {
    const transactionDir = getTransactionDir(`journal-${generateUUID()}`);
    transactionDir.create({ intermediates: true });
    const transaction: StorageTransaction = { phase: 'prepared', files: [] };
    try {
      let fileIndex = 0;
      transaction.files.push(
        stageRawFile(
          transactionDir,
          fileIndex++,
          getMetadataFile(journal.id),
          await encryptForStorage(JSON.stringify(metadata), derivedKey),
        ),
      );
      for (const page of journal.pages) {
        transaction.files.push(
          stageRawFile(
            transactionDir,
            fileIndex++,
            getPageFile(journal.id, page.id),
            await encryptForStorage(JSON.stringify(page), derivedKey),
          ),
        );
      }
      transaction.files.push(
        stageRawFile(
          transactionDir,
          fileIndex++,
          getPageCatalogFile(journal.id),
          await encryptForStorage(
            JSON.stringify(createPageCatalog(journal.id, journal.pages)),
            derivedKey,
          ),
        ),
        stageRawFile(
          transactionDir,
          fileIndex,
          getJournalsIndexFile(),
          await encryptForStorage(JSON.stringify(index)),
        ),
      );
      writeTransactionMarker(transactionDir, transaction);
      transaction.phase = 'committing';
      writeTransactionMarker(transactionDir, transaction);
      await applyStorageTransaction(transaction);
      transactionDir.delete();
    } catch (error) {
      if (transaction.phase === 'prepared' && transactionDir.exists) transactionDir.delete();
      throw error;
    }
  }

  const store: LocalStore = {
    async initialize(): Promise<void> {
      ensureDir(getBaseDir());
      // Transactions have an explicit commit point; replay only committed
      // staging before exposing pages to callers.
      await recoverTransactions();
      await recoverIncompleteJournalImports();
      // Crash recovery: complete any interrupted single-file write
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

      const metadata = safeJsonParse<Omit<JournalContent, 'pages'>>(raw, `journal:${id} metadata`);

      const pages = await readJournalPages(id, derivedKey);
      return { ...metadata, pages };
    },

    async getJournalOverview(
      id: string,
      derivedKey?: Uint8Array,
      options?: JournalOverviewReadOptions,
    ) {
      const metadataRaw = await readEncrypted(getMetadataFile(id), encryption, derivedKey);
      if (!metadataRaw) return null;
      const metadata = safeJsonParse<Omit<JournalContent, 'pages'>>(
        metadataRaw,
        `journal:${id} metadata`,
      );
      const catalog = await readPageCatalog(id, derivedKey);
      if (catalog) return catalogToOverview(metadata, catalog);

      // Existing journals receive a catalog lazily. Page files remain the
      // authority, so a missing/corrupt catalog is safe to rebuild once.
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
      ensureDir(getJournalDir(journal.id));
      ensureDir(getPagesDir(journal.id));
      ensureDir(getAttachmentsDir(journal.id));

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
      // A full journal import must not become visible through journals.json
      // until its metadata, every page, and rebuildable catalog are durable.
      await commitJournalAndIndex(journal, journalMetadata, index, derivedKey);
    },

    async saveJournalMetadata(metadata, derivedKey): Promise<void> {
      ensureDir(getJournalDir(metadata.id));
      await writeEncrypted(
        getMetadataFile(metadata.id),
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
      ensureDir(getImportsDir());
      const marker = getImportMarker(id);
      if (!marker.exists) marker.create({ intermediates: true });
      marker.write(JSON.stringify({ version: 2, journalId: id, phase: 'prepared' }));
    },

    async updateJournalImport(id, phase, recovery?: JournalImportRecoveryInfo): Promise<void> {
      const marker = getImportMarker(id);
      if (!marker.exists) throw new Error(`Journal import marker is missing: ${id}`);
      marker.write(
        JSON.stringify({
          version: 2,
          journalId: id,
          phase,
          ...(recovery ? { expectedPageCount: recovery.expectedPageCount } : {}),
        }),
      );
    },

    async completeJournalImport(id: string): Promise<void> {
      const marker = getImportMarker(id);
      if (marker.exists) marker.delete();
    },

    async abortJournalImport(id: string): Promise<void> {
      await this.deleteJournal(id);
      const marker = getImportMarker(id);
      if (marker.exists) marker.delete();
    },

    async hasCompletedDeviceKeyRotation(): Promise<boolean> {
      return getDeviceKeyRotationCompleteFile().exists;
    },

    async clearCompletedDeviceKeyRotation(): Promise<void> {
      const marker = getDeviceKeyRotationCompleteFile();
      if (marker.exists) marker.delete();
    },

    async deleteJournal(id: string): Promise<void> {
      // Delete directory first — if this fails, the journal stays in the index
      // (visible but recoverable). Reverse order would orphan data.
      const dir = getJournalDir(id);
      if (dir.exists) {
        dir.delete();
      }

      const index = await readIndex();
      index.journals = index.journals.filter((j) => j.id !== id);
      await writeIndex(index);
    },

    async getPage(
      journalId: string,
      pageId: string,
      derivedKey?: Uint8Array,
    ): Promise<Page | null> {
      const file = getPageFile(journalId, pageId);
      const raw = await readEncrypted(file, encryption, derivedKey);
      if (!raw) return null;
      return safeJsonParse<Page>(raw, `page:${pageId}`);
    },

    async savePage(
      journalId: string,
      page: Page,
      derivedKey?: Uint8Array,
      preserveModified?: boolean,
    ): Promise<void> {
      ensureDir(getPagesDir(journalId));
      const updated = preserveModified ? page : { ...page, modified: Date.now() };
      let catalog = await readPageCatalog(journalId, derivedKey);
      if (!catalog) {
        // Legacy/malformed catalogs rebuild once. Normal saves never open the
        // remaining page files.
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

      // Soft delete: mark as deleted, update modified timestamp
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

      // Clean up attachment files (non-blocking)
      const attachments = [...(page.images ?? []), ...(page.files ?? [])];
      if (attachments.length > 0) {
        Promise.resolve()
          .then(async () => {
            for (const att of attachments) {
              if (att.path) {
                try {
                  if (att.content?.format === 'canto-chunked-v1') {
                    const root = new Directory(att.path);
                    if (root.exists) root.delete();
                  } else {
                    const file = new File(att.path);
                    if (file.exists) file.delete();
                  }
                } catch {
                  // Best-effort cleanup
                }
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
      ensureDir(getAttachmentsDir(journalId));
      if (attachment.content?.format === 'canto-chunked-v1') {
        const root = getChunkRoot(journalId, pageId, attachment);
        if (root.exists) {
          throw new Error(`Attachment generation already exists: ${attachment.name}`);
        }
        root.create({ intermediates: true });
        try {
          for (const [index, chunk] of splitBase64Chunks(data, attachment.content).entries()) {
            const frame = encodeChunkFrame(journalId, pageId, attachment, index, chunk);
            const inner =
              attachment.encrypted && derivedKey ? await aesGcmEncrypt(frame, derivedKey) : frame;
            const file = getChunkFile(root, index);
            file.create({ intermediates: true });
            file.write(await encryption.encrypt(inner));
          }
          const manifest = getChunkManifest(root);
          manifest.create({ intermediates: true });
          manifest.write(
            await encryption.encrypt(JSON.stringify({ journalId, pageId, attachment })),
          );
          return root.uri;
        } catch (error) {
          if (root.exists) root.delete();
          throw error;
        }
      }
      const file = getAttachmentFile(journalId, pageId, attachment);
      const toDeviceEncrypt =
        attachment.encrypted && derivedKey ? await aesGcmEncrypt(data, derivedKey) : data;
      const ciphertext = await encryption.encrypt(toDeviceEncrypt);
      if (!file.exists) file.create({ intermediates: true });
      file.write(ciphertext);
      return file.uri;
    },

    async saveAttachmentStream(journalId, pageId, attachment, chunks, derivedKey): Promise<string> {
      if (attachment.content?.format !== 'canto-chunked-v1') {
        throw new Error(`Chunked content descriptor required for attachment: ${attachment.name}`);
      }
      const root = getChunkRoot(journalId, pageId, attachment);
      if (root.exists) {
        throw new Error(`Attachment generation already exists: ${attachment.name}`);
      }
      root.create({ intermediates: true });
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
          const file = getChunkFile(root, index++);
          file.create({ intermediates: true });
          file.write(await encryption.encrypt(inner));
        }
        if (index !== attachment.content.chunkCount || written !== attachment.content.byteLength) {
          throw new Error(`Attachment stream length mismatch: ${attachment.name}`);
        }
        const manifest = getChunkManifest(root);
        manifest.create({ intermediates: true });
        manifest.write(await encryption.encrypt(JSON.stringify({ journalId, pageId, attachment })));
        return root.uri;
      } catch (error) {
        if (root.exists) root.delete();
        throw error;
      }
    },

    async getAttachment(path: string, derivedKey?: Uint8Array): Promise<string | null> {
      const file = new File(path);
      if (file.exists) {
        const deviceDecrypted = await encryption.decrypt(await file.text());
        if (derivedKey) {
          try {
            return await aesGcmDecrypt(deviceDecrypted, derivedKey);
          } catch {
            return deviceDecrypted;
          }
        }
        return deviceDecrypted;
      }
      const root = new Directory(path);
      const manifestFile = getChunkManifest(root);
      if (!manifestFile.exists) return null;
      const manifest = safeJsonParse<{
        journalId: string;
        pageId: string;
        attachment: Attachment;
      }>(await encryption.decrypt(await manifestFile.text()), `attachment manifest:${path}`);
      const chunks: string[] = [];
      for (let index = 0; index < manifest.attachment.content!.chunkCount; index++) {
        const chunk = getChunkFile(root, index);
        if (!chunk.exists)
          throw new Error(`Attachment chunk missing: ${manifest.attachment.name} #${index}`);
        const frame = await decryptAttachmentFrame(
          await encryption.decrypt(await chunk.text()),
          manifest.attachment.encrypted,
          derivedKey,
        );
        chunks.push(
          decodeChunkFrame(frame, manifest.journalId, manifest.pageId, manifest.attachment, index),
        );
      }
      return joinBase64Chunks(chunks);
    },

    async deleteAttachment(path: string): Promise<void> {
      const file = new File(path);
      if (file.exists) file.delete();
      const root = new Directory(path);
      if (root.exists) root.delete();
    },

    async forEachAttachmentChunk(attachment, visitor, indexes): Promise<void> {
      if (!attachment.content || attachment.content.format !== 'canto-chunked-v1') {
        throw new Error(`Chunked content descriptor required for attachment: ${attachment.name}`);
      }
      const root = new Directory(attachment.path);
      for (let index = 0; index < attachment.content.chunkCount; index++) {
        // A resumed web sync supplies only missing remote indexes. Do not open
        // completed chunks merely to discover that they can be skipped.
        if (indexes && !indexes.has(index)) continue;
        const chunk = getChunkFile(root, index);
        if (!chunk.exists)
          throw new Error(`Attachment chunk missing: ${attachment.name} #${index}`);
        await visitor(index, await encryption.decrypt(await chunk.text()));
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

      const root = new Directory(attachment.path);
      const manifestFile = getChunkManifest(root);
      if (!manifestFile.exists) throw new Error(`Attachment manifest missing: ${attachment.name}`);
      const manifest = safeJsonParse<{
        journalId: string;
        pageId: string;
        attachment: Attachment;
      }>(
        await encryption.decrypt(await manifestFile.text()),
        `attachment manifest:${attachment.path}`,
      );
      if (
        manifest.attachment.id !== attachment.id ||
        manifest.attachment.content?.generation !== attachment.content.generation ||
        manifest.attachment.content?.chunkCount !== attachment.content.chunkCount
      ) {
        throw new Error(`Attachment manifest identity mismatch: ${attachment.name}`);
      }

      let written = 0;
      for (let index = 0; index < attachment.content.chunkCount; index++) {
        const chunk = getChunkFile(root, index);
        if (!chunk.exists)
          throw new Error(`Attachment chunk missing: ${attachment.name} #${index}`);
        const frame = await decryptAttachmentFrame(
          await encryption.decrypt(await chunk.text()),
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
      if (root.exists) {
        // Chunk generations are immutable. A complete existing root is already
        // the exact content addressed by the downloaded page, so retain it.
        if (getChunkManifest(root).exists) return root.uri;
        throw new Error(`Incomplete attachment generation already exists: ${attachment.name}`);
      }
      root.create({ intermediates: true });
      let count = 0;
      try {
        for await (const chunk of chunks) {
          if (count >= attachment.content.chunkCount)
            throw new Error(`Too many attachment chunks: ${attachment.name}`);
          const file = getChunkFile(root, count++);
          file.create({ intermediates: true });
          file.write(await encryption.encrypt(chunk));
        }
        if (count !== attachment.content.chunkCount)
          throw new Error(`Missing attachment chunks: ${attachment.name}`);
        const manifest = getChunkManifest(root);
        manifest.create({ intermediates: true });
        manifest.write(await encryption.encrypt(JSON.stringify({ journalId, pageId, attachment })));
        return root.uri;
      } catch (error) {
        if (root.exists) root.delete();
        throw error;
      }
    },

    async getAttachmentStorageSize(path: string) {
      const file = new File(path);
      // File.size is metadata supplied by the filesystem; it deliberately does
      // not decrypt or materialize the legacy payload before the sync guard.
      return file.exists
        ? { status: 'known' as const, bytes: file.size }
        : { status: 'missing' as const };
    },

    async reencryptJournal(
      journal: JournalContent,
      oldKey: Uint8Array | undefined,
      newKey: Uint8Array | undefined,
      onProgress?: (current: number, total: number) => void,
    ): Promise<ReencryptionResult> {
      // Chunk roots are addressed by content generation. Rotate into new roots
      // first, then publish pages which reference those roots. A failed copy
      // therefore leaves every published page pointing at untouched content.
      const replacementRoots: { oldRoot: Directory; newRoot: Directory }[] = [];
      const transactionDir = getTransactionDir(`password-${generateUUID()}`);
      const transaction: StorageTransaction = { phase: 'prepared', files: [] };
      const skippedAttachments: ReencryptionResult['skippedAttachments'] = [];
      const legacyAttachments = journal.pages
        .filter((page) => !page.deleted)
        .flatMap((page) => [...(page.images ?? []), ...(page.files ?? [])])
        .filter((attachment) => !attachment.content);
      // File.size is filesystem metadata. Never call text()/decrypt() until this
      // guard has proved that a monolithic legacy value is below one chunk.
      const unsafeLegacyPaths = new Set(
        legacyAttachments
          .filter((attachment) => {
            const file = new File(attachment.path);
            return !file.exists || file.size > LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES;
          })
          .map((attachment) => attachment.path),
      );
      const incompatible = legacyAttachments.find(
        (attachment) => attachment.encrypted && unsafeLegacyPaths.has(attachment.path),
      );
      if (incompatible) {
        throw new Error(`Cannot safely re-encrypt legacy attachment: ${incompatible.name}`);
      }
      const remapAttachments = (arr: Attachment[] | undefined): Attachment[] =>
        (arr ?? []).map((attachment) => {
          if (!attachment.content && unsafeLegacyPaths.has(attachment.path)) {
            skippedAttachments.push({ name: attachment.name, size: attachment.size });
            return { ...attachment, encrypted: false };
          }
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
        .filter((page) => !page.deleted)
        .map((page) => ({
          ...page,
          images: remapAttachments(page.images),
          files: remapAttachments(page.files),
        }));

      const oldChunkRoots = new Set(
        journal.pages
          .flatMap((page) => [...(page.images ?? []), ...(page.files ?? [])])
          .filter((attachment) => attachment.content?.format === 'canto-chunked-v1')
          .map((attachment) => attachment.path),
      );
      const attachFiles = listFilesRecursively(getAttachmentsDir(journal.id)).filter(
        (entry) =>
          entry.name !== 'manifest' &&
          !Array.from(oldChunkRoots).some((root) => entry.uri.startsWith(`${root}/`)) &&
          legacyAttachments.some(
            (attachment) =>
              attachment.path === entry.uri && !unsafeLegacyPaths.has(attachment.path),
          ),
      );
      const chunkFrames = pages
        .flatMap((page) => [...(page.images ?? []), ...(page.files ?? [])])
        .reduce(
          (count, attachment) =>
            count +
            (attachment.content?.format === 'canto-chunked-v1' ? attachment.content.chunkCount : 0),
          0,
        );
      const total = chunkFrames + pages.length + attachFiles.length + 1;
      let progress = 0;

      try {
        transactionDir.create({ intermediates: true });
        for (const page of pages) {
          const oldPage = journal.pages.find((candidate) => candidate.id === page.id)!;
          for (const kind of ['images', 'files'] as const) {
            for (
              let attachmentIndex = 0;
              attachmentIndex < oldPage[kind].length;
              attachmentIndex++
            ) {
              const oldAttachment = oldPage[kind][attachmentIndex];
              const newAttachment = page[kind][attachmentIndex];
              if (
                oldAttachment.content?.format !== 'canto-chunked-v1' ||
                newAttachment.content?.format !== 'canto-chunked-v1'
              )
                continue;
              const oldRoot = new Directory(oldAttachment.path);
              const newRoot = getChunkRoot(journal.id, page.id, newAttachment);
              if (newRoot.exists) newRoot.delete();
              newRoot.create({ intermediates: true });
              // The manifest is also used by explicit reads, so it must carry
              // the final root before it is encrypted and published.
              newAttachment.path = newRoot.uri;
              try {
                for (let index = 0; index < oldAttachment.content.chunkCount; index++) {
                  const oldChunk = getChunkFile(oldRoot, index);
                  if (!oldChunk.exists)
                    throw new Error(`Attachment chunk missing: ${oldAttachment.name} #${index}`);
                  const frame = await decryptAttachmentFrame(
                    await encryption.decrypt(await oldChunk.text()),
                    oldAttachment.encrypted,
                    oldKey,
                  );
                  const data = decodeChunkFrame(
                    frame,
                    journal.id,
                    oldPage.id,
                    oldAttachment,
                    index,
                  );
                  const nextFrame = encodeChunkFrame(
                    journal.id,
                    page.id,
                    newAttachment,
                    index,
                    data,
                  );
                  const inner =
                    newAttachment.encrypted && newKey
                      ? await aesGcmEncrypt(nextFrame, newKey)
                      : nextFrame;
                  const nextChunk = getChunkFile(newRoot, index);
                  nextChunk.create({ intermediates: true });
                  nextChunk.write(await encryption.encrypt(inner));
                  onProgress?.(++progress, total);
                }
                const manifest = getChunkManifest(newRoot);
                manifest.create({ intermediates: true });
                manifest.write(
                  await encryption.encrypt(
                    JSON.stringify({
                      journalId: journal.id,
                      pageId: page.id,
                      attachment: newAttachment,
                    }),
                  ),
                );
                replacementRoots.push({ oldRoot, newRoot });
              } catch (error) {
                if (newRoot.exists) newRoot.delete();
                throw error;
              }
            }
          }
        }

        // Legacy content retains its existing behavior. It is separate from
        // chunk roots so no published chunk is ever overwritten in place.
        for (const entry of attachFiles) {
          onProgress?.(++progress, total);
          let plaintext = await encryption.decrypt(await entry.text());
          if (oldKey) {
            try {
              plaintext = await aesGcmDecrypt(plaintext, oldKey);
            } catch {
              // This legacy payload did not have a journal-password layer.
            }
          }
          const next = newKey ? await aesGcmEncrypt(plaintext, newKey) : plaintext;
          transaction.files.push(
            stageRawFile(
              transactionDir,
              transaction.files.length,
              entry,
              await encryption.encrypt(next),
            ),
          );
        }

        for (const page of pages) {
          onProgress?.(++progress, total);
          const payload = JSON.stringify(page);
          const inner = newKey ? await aesGcmEncrypt(payload, newKey) : payload;
          transaction.files.push(
            stageRawFile(
              transactionDir,
              transaction.files.length,
              getPageFile(journal.id, page.id),
              await encryption.encrypt(inner),
            ),
          );
        }

        onProgress?.(++progress, total);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { pages: _pages, ...metadata } = journal;
        const metadataPayload = JSON.stringify(metadata);
        const metadataInner = newKey
          ? await aesGcmEncrypt(metadataPayload, newKey)
          : metadataPayload;
        transaction.files.push(
          stageRawFile(
            transactionDir,
            transaction.files.length,
            getMetadataFile(journal.id),
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
        if (existing >= 0) index.journals[existing] = entry;
        else index.journals.push(entry);
        transaction.files.push(
          stageRawFile(
            transactionDir,
            transaction.files.length,
            getJournalsIndexFile(),
            await encryption.encrypt(JSON.stringify(index)),
          ),
        );
        transaction.newRoots = replacementRoots.map(({ newRoot }) => newRoot.uri);
        transaction.oldRoots = replacementRoots.map(({ oldRoot }) => oldRoot.uri);
        writeTransactionMarker(transactionDir, transaction);
        transaction.phase = 'committing';
        writeTransactionMarker(transactionDir, transaction);
        await applyStorageTransaction(transaction);
        transactionDir.delete();

        // Pages and metadata now reference each new root. Cleanup is strictly
        // after publication and failure only leaks old files for later cleanup.
        return { skippedAttachments };
      } catch (error) {
        if (transaction.phase === 'prepared') {
          for (const { newRoot } of replacementRoots) {
            try {
              if (newRoot.exists) newRoot.delete();
            } catch {
              // Best-effort cleanup of an unreferenced replacement root.
            }
          }
          if (transactionDir.exists) transactionDir.delete();
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
      const indexFile = getJournalsIndexFile();
      let journals: Journal[] = [];
      if (indexFile.exists) {
        journals = safeJsonParse<JournalIndex>(
          await oldDeviceDecrypt(await indexFile.text()),
          'journals index',
        ).journals;
      }

      const transactionDir = getTransactionDir(`device-${generateUUID()}`);
      transactionDir.create({ intermediates: true });
      const transaction: StorageTransaction = { phase: 'prepared', files: [] };
      try {
        const files = listFilesRecursively(getBaseDir()).filter(
          (file) =>
            !file.uri.includes(`/${TRANSACTIONS_DIR_NAME}/`) &&
            file.name !== DEVICE_KEY_ROTATION_COMPLETE_NAME &&
            !file.name.endsWith('.tmp') &&
            !file.name.endsWith('.size'),
        );
        const unsafeLegacy = files.find(
          (file) =>
            file.uri.includes('/attachments/') &&
            !file.uri.includes('/chunk-v1-') &&
            file.size > LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES,
        );
        if (unsafeLegacy) {
          throw new Error(
            `Cannot safely rotate device key for legacy attachment: ${unsafeLegacy.name}`,
          );
        }
        let staged = 0;
        let processed = 0;
        for (const journal of journals) {
          const prefix = `${getJournalDir(journal.id).uri}/`;
          const journalFiles = files.filter((file) => file.uri.startsWith(prefix));
          for (const file of journalFiles) {
            transaction.files.push(
              stageRawFile(
                transactionDir,
                staged++,
                file,
                await newDeviceEncrypt(await oldDeviceDecrypt(await file.text())),
              ),
            );
          }
          onProgress?.(++processed, journals.length);
        }
        // The index is deliberately staged last, but it is not a journal file.
        if (indexFile.exists) {
          transaction.files.push(
            stageRawFile(
              transactionDir,
              staged,
              indexFile,
              await newDeviceEncrypt(await oldDeviceDecrypt(await indexFile.text())),
            ),
          );
        }
        // This raw marker is staged with every ciphertext. It becomes visible
        // only at the same durable commit point, and contains no key material.
        transaction.files.push(
          stageRawFile(transactionDir, staged + 1, getDeviceKeyRotationCompleteFile(), 'complete'),
        );
        writeTransactionMarker(transactionDir, transaction);
        transaction.phase = 'committing';
        writeTransactionMarker(transactionDir, transaction);
        await applyStorageTransaction(transaction);
        transactionDir.delete();
      } catch (error) {
        // Before the commit marker the original view is intact. A committed
        // marker is intentionally retained so initialize() can finish replay.
        if (transaction.phase === 'prepared' && transactionDir.exists) transactionDir.delete();
        throw error;
      }
    },
  };
  return serializeDeviceKeyWrites(store);
}
