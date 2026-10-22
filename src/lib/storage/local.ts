import { Paths, File, Directory } from 'expo-file-system';
import { validatePage } from 'canto-data';
import type { Journal, JournalContent, Page, Attachment } from 'canto-data';
import type { EncryptionService } from '@/lib/encryption';
import { aesGcmEncrypt, aesGcmDecrypt, generateUUID, uint8ToBase64 } from '@/lib/encryption/utils';
import { safeJsonParse } from '@/lib/utils/json';
import {
  catalogToOverview,
  createPageCatalog,
  isPageCatalogV1,
  withCatalogPage,
  type JournalOverview,
  type PageCatalogV1,
} from '@/lib/journal-overview';
import type {
  JournalImportRecoveryInfo,
  JournalOverviewReadOptions,
  JournalPageScan,
  JournalSyncSnapshot,
  LocalStore,
  ReencryptionResult,
} from './types';
import { DeviceKeyWriteBarrier, serializeDeviceKeyWrites } from './write-barrier';
import { isSafeRecordId, safeRecordId } from './record-id';
import { recordStorageIo } from './io-counters';
import {
  assertUsableDerivedKey,
  DraftsPendingError,
  JournalLockedError,
  requireUsableDerivedKey,
  StorageIntegrityError,
  type IndexedRead,
  type IntegrityCode,
  type StorageIntegrityCause,
} from './integrity';
import {
  classifyPasswordLayer,
  countRecordLayer,
  decryptLegacyZeroKey,
  emptyLayerCounts,
  verifyKeyAgainstRecords,
  type JournalKeyVerdict,
  type KeyEvidence,
  type StorageDiagnostics,
} from './key-integrity';
import {
  createRotationVerifySampler,
  RotationBlockedError,
  runDeviceKeyRotation,
  type DeviceKeyRotationIO,
} from './device-key-rotation';
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
const FIRST_INSTALL_MARKER_NAME = '.first-install';
const IMPORTS_DIR_NAME = '.imports';
/** Headroom kept free beyond the staged rotation copy. */
const ROTATION_FREE_SPACE_MARGIN_BYTES = 20 * 1024 * 1024;

/** Free bytes on the app's storage volume, or null when the platform cannot tell. */
function readAvailableDiskSpace(): number | null {
  try {
    const bytes = (Paths as { availableDiskSpace?: unknown }).availableDiskSpace;
    return typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
  } catch {
    return null;
  }
}

function getBaseDir(): Directory {
  return new Directory(Paths.document, BASE_DIR_NAME);
}

function getJournalDir(journalId: string): Directory {
  return new Directory(getBaseDir(), safeRecordId(journalId));
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
  return new File(getPagesDir(journalId), `${safeRecordId(pageId)}.json`);
}

/**
 * Encrypted unsaved editor drafts. App-local only: never part of the page
 * catalog, recovery scans, export, sync, or import verification.
 */
function getDraftsDir(journalId: string): Directory {
  return new Directory(getJournalDir(journalId), 'drafts');
}

function getDraftFile(journalId: string, pageId: string): File {
  return new File(getDraftsDir(journalId), `${safeRecordId(pageId)}.json`);
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

/**
 * Prefix that every path inside `dir` starts with. expo-file-system on
 * Android reports directory uris with a trailing '/', so appending another
 * one would match nothing (this once made device-key rotation skip every
 * journal record and then delete the only key that could read them).
 */
function childPrefix(dir: Directory | string): string {
  const uri = typeof dir === 'string' ? dir : dir.uri;
  return uri.endsWith('/') ? uri : `${uri}/`;
}

function ensureDir(dir: Directory): void {
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
}

type DetailedRead =
  | { status: 'absent' }
  | { status: 'value'; value: string }
  | { status: 'unreadable'; cause: StorageIntegrityCause };

/**
 * Distinguish an absent file from a file that exists but cannot be read safely.
 * A password-decryption failure falls back to device-decrypted content exactly
 * as before (legacy mixed-layer journals); a device-layer failure is reported
 * as unreadable so callers can fail closed instead of omitting records.
 */
async function readEncryptedDetailed(
  file: File,
  encryption: EncryptionService,
  derivedKey?: Uint8Array,
): Promise<DetailedRead> {
  if (!file.exists) return { status: 'absent' };
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
        return { status: 'value', value: await aesGcmDecrypt(deviceDecrypted, derivedKey) };
      } catch {
        // Data is not password-encrypted — return device-decrypted content.
        // This happens for metadata/pages in journals with encrypted attachments
        // but no active password (auto-derive provides a key, but only
        // attachments are password-encrypted, not metadata).
        return { status: 'value', value: deviceDecrypted };
      }
    }
    return { status: 'value', value: deviceDecrypted };
  } catch {
    // Production diagnostics never carry the app-private URI or the error
    // stack; an opaque record id plus the failure layer is enough to locate
    // the failure without leaking journal names or paths.
    console.warn(`[Canto] ${opaqueRecordId(file.uri)} unreadable (DEVICE_DECRYPT_FAILED)`);
    return { status: 'unreadable', cause: 'DEVICE_DECRYPT_FAILED' };
  }
}

/** Stable opaque label for one storage record, safe for production logs. */
function opaqueRecordId(path: string): string {
  return `record:${hashCode(path).toString(16)}`;
}

/**
 * Durable journal evidence below the root, excluding the index itself, the
 * keyless markers, and (optionally) the journal directories being recovered
 * from import markers. Only a genuinely empty root may be treated as an
 * empty library; a missing index over existing data is an integrity
 * condition and must never be replaced by a reduced projection.
 */
function directoryName(entry: File | Directory): string {
  const name = (entry as { name?: string }).name;
  return name || entry.uri.split('/').pop() || '';
}

async function hasDurableJournalData(
  excludedJournalIds: ReadonlySet<string> = new Set(),
): Promise<boolean> {
  const baseDir = getBaseDir();
  if (!baseDir.exists) return false;
  for (const entry of baseDir.list()) {
    if (entry instanceof Directory) {
      const name = directoryName(entry);
      if (name === TRANSACTIONS_DIR_NAME || name === IMPORTS_DIR_NAME) continue;
      if (!excludedJournalIds.has(name)) return true;
    } else if (
      entry.name !== FIRST_INSTALL_MARKER_NAME &&
      entry.name !== DEVICE_KEY_ROTATION_COMPLETE_NAME &&
      entry.name !== JOURNALS_INDEX_NAME
    ) {
      return true;
    }
  }
  return false;
}

/** Convenience for legacy helpers that only need a plain value or absence. */
async function readEncrypted(
  file: File,
  encryption: EncryptionService,
  derivedKey?: Uint8Array,
): Promise<string | null> {
  const read = await readEncryptedDetailed(file, encryption, derivedKey);
  return read.status === 'value' ? read.value : null;
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
/**
 * `retired`: applied and finished, but its directory could not be removed.
 * Startup only deletes it: replaying it would overwrite newer saves, and
 * rolling it back would delete attachment roots that published pages use.
 */
type TransactionPhase = 'prepared' | 'committing' | 'retired';
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
  // Superseded attachment roots are garbage once every target is written;
  // failing to remove one only leaks space and must not fail the commit.
  for (const root of transaction.oldRoots ?? []) {
    try {
      const directory = new Directory(root);
      if (directory.exists) directory.delete();
    } catch (error) {
      console.warn('[Canto] Superseded attachment cleanup deferred:', error);
    }
  }
}

/**
 * Remove a finished transaction. The marker goes first: a crash part-way
 * through deleting staged files must leave no marker that would make startup
 * replay an incomplete staging copy (and fail on every launch).
 */
function retireTransaction(dir: Directory): void {
  // The data is already applied. A cleanup failure must not surface as a
  // failed save (the caller would tell the user nothing changed); a leftover
  // directory is retried at startup.
  const marker = getTransactionMarker(dir);
  try {
    if (marker.exists) marker.delete();
  } catch (error) {
    // A committing marker left behind would be replayed over later saves.
    try {
      marker.write(JSON.stringify({ phase: 'retired', files: [] }));
    } catch {
      // Both failed: nothing more can be done in this process.
    }
    console.warn('[Canto] Storage transaction cleanup deferred:', error);
  }
  try {
    if (dir.exists) dir.delete();
  } catch (error) {
    console.warn('[Canto] Storage transaction cleanup deferred:', error);
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
    // A retired transaction already finished: only its directory remains.
    if (transaction?.phase !== 'committing' && transaction?.phase !== 'retired') {
      for (const rootPath of transaction?.newRoots ?? []) {
        const directory = new Directory(rootPath);
        if (directory.exists) directory.delete();
      }
    }
    retireTransaction(entry);
  }
}

/** Every discovered raw page record, classified by how it could be read. */
interface PageRecordScan {
  /** Readable with the supplied key (or device-only data). */
  pages: Page[];
  /** Readable only with the legacy zero key. */
  legacyPages: Page[];
  /** Opaque ids of the legacy records, for diagnostics. */
  legacyRecords: string[];
  /** Opaque ids of records that cannot be trusted at all. */
  unusable: string[];
}

function parseValidPage(value: string, recordId: string): Page | undefined {
  try {
    return validatePage(safeJsonParse<unknown>(value, `page:${recordId}`));
  } catch {
    return undefined;
  }
}

/** Publication requires every record; legacy records need explicit recovery first. */
function assertCompletePageScan(
  journalId: string,
  scan: PageRecordScan,
  errorCode: IntegrityCode,
): void {
  if (scan.unusable.length > 0) {
    throw new StorageIntegrityError(
      errorCode,
      `Cannot trust local records: ${scan.unusable.length} page(s) could not be read safely.`,
      { journalId, details: scan.unusable },
    );
  }
  if (scan.legacyPages.length > 0) {
    throw new StorageIntegrityError(
      'LEGACY_ZERO_KEY',
      `${scan.legacyPages.length} page(s) were saved under an auto-locked key and need recovery.`,
      { journalId, details: scan.legacyRecords },
    );
  }
}

interface TransactionBuilder {
  transactionDir: Directory;
  transaction: StorageTransaction;
  stage(target: File, ciphertext: string): void;
  commit(): Promise<void>;
  discard(): void;
}

export function createLocalStore(encryption: EncryptionService): LocalStore {
  const barrier = new DeviceKeyWriteBarrier();
  /**
   * True only when the journal's device-only index entry declares the
   * password layer enabled. Unlike the metadata file — which is password-layer
   * encrypted for secure journals and therefore unreadable without the derived
   * key — the journals.json projection is guarded by device encryption alone,
   * so this never requires the password and stays safe for callers that hold
   * no key.
   */
  async function isJournalSecure(journalId: string): Promise<boolean> {
    const index = await readIndex();
    const entry = index.journals.find((candidate) => candidate.id === journalId);
    return entry?.secure === true;
  }

  async function readIndexTyped(): Promise<IndexedRead<JournalIndex>> {
    const file = getJournalsIndexFile();
    const raw = await readEncryptedDetailed(file, encryption);
    if (raw.status === 'absent') return { state: 'absent' };
    if (raw.status === 'unreadable') return { state: 'unreadable', cause: raw.cause };
    try {
      return { state: 'valid', value: safeJsonParse<JournalIndex>(raw.value, 'journals index') };
    } catch {
      return { state: 'unreadable', cause: 'JSON_PARSE_FAILED' };
    }
  }

  /**
   * Fail-closed index read for every mutation path. An unreadable index must
   * block all publication instead of collapsing to an empty library; an
   * absent index over existing durable journal data is the same integrity
   * condition, never a signal to publish a reduced index.
   */
  async function readIndex(): Promise<JournalIndex> {
    const read = await readIndexTyped();
    if (read.state === 'unreadable') {
      throw new StorageIntegrityError(
        'INDEX_UNREADABLE',
        'The journal index could not be read safely; refusing to publish a reduced library.',
        { cause: read.cause },
      );
    }
    // Durable records are allowed only when they belong to a live,
    // marker-verified import that is still staging before the final index
    // publication. Anything else over a missing index fails closed.
    if (read.state === 'absent' && (await hasDurableJournalData(await activeImportJournalIds()))) {
      throw new StorageIntegrityError(
        'INDEX_UNREADABLE',
        'The journal index is missing while journal data exists; refusing to publish a reduced library.',
        { cause: 'INDEX_ABSENT' },
      );
    }
    return read.state === 'valid' ? read.value : { journals: [] };
  }

  async function commitIndexOnly(index: JournalIndex): Promise<void> {
    await commitStagedWrites('index', [
      {
        target: getJournalsIndexFile(),
        ciphertext: await encryptForStorage(JSON.stringify(index)),
      },
    ]);
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
    const indexRead = await readIndexTyped();
    // An unreadable index cannot prove what is committed. Deleting any journal
    // directory or rewriting the index from a reduced view would risk real
    // data loss; recovery defers to a later startup that can read the index.
    if (indexRead.state === 'unreadable') return; // An absent index over durable journal data that is not part of these
    // markers is the same integrity condition: publishing a marker-only index
    // would hide that data. Preserve everything and defer the replay.
    if (indexRead.state === 'absent') {
      const markerEntries = markers.list().filter((entry): entry is File => entry instanceof File);
      const markerJournalIds = new Set<string>();
      for (const entry of markerEntries) {
        const marker = await entry
          .text()
          .then((value) => parseJournalImportMarker(value, entry.name));
        markerJournalIds.add(marker?.journalId ?? entry.name);
      }
      if (await hasDurableJournalData(markerJournalIds)) return;
    }
    const index = indexRead.state === 'valid' ? indexRead.value : { journals: [] };
    const committedIds = new Set(index.journals.map((journal) => journal.id));
    for (const entry of markers.list()) {
      if (!(entry instanceof File)) continue;
      const marker = await entry
        .text()
        .then((value) => parseJournalImportMarker(value, entry.name));
      const journalId = marker?.journalId ?? entry.name;
      if (!isSafeRecordId(journalId)) {
        // Never brick startup over a marker that cannot name a journal; it is
        // left in place and the index stays untouched.
        console.warn('[Canto] Skipping an import marker with an unusable id');
        continue;
      }
      if (!committedIds.has(journalId) && marker) {
        const recovered = await recoveredImportIndexEntry(marker);
        if (recovered) {
          index.journals.push(recovered);
          await commitIndexOnly(index);
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

  /**
   * Journal directories owned by a live, marker-verified import. A valid
   * import marker is the only authority that lets staged-but-not-yet-indexed
   * records avoid tripping the fail-closed missing-index guard; orphan
   * directories without a marker still fail closed.
   */
  async function activeImportJournalIds(): Promise<ReadonlySet<string>> {
    const ids = new Set<string>();
    const markers = getImportsDir();
    if (!markers.exists) return ids;
    for (const entry of markers.list()) {
      if (!(entry instanceof File)) continue;
      try {
        const marker = parseJournalImportMarker(await entry.text(), entry.name);
        if (marker) ids.add(marker.journalId);
      } catch {
        // An unreadable marker grants no exclusion.
      }
    }
    return ids;
  }

  /**
   * A complete scan of every discovered page file can rebuild a projection.
   * Every record must be structurally valid, its id must match the filename-
   * derived page id, and no two records may claim the same id. Any unreadable
   * or ambiguous page blocks publication and is reported as a typed,
   * recoverable CATALOG_UNREADABLE outcome with opaque record identifiers.
   */
  async function scanPageRecords(
    journalId: string,
    derivedKey?: Uint8Array,
    options?: JournalOverviewReadOptions,
  ): Promise<PageRecordScan> {
    if (options?.signal?.aborted) throw new Error('Journal catalog rebuild cancelled');
    const scan: PageRecordScan = { pages: [], legacyPages: [], legacyRecords: [], unusable: [] };
    const pagesDirectory = getPagesDir(journalId);
    if (!pagesDirectory.exists) {
      options?.onRebuildProgress?.({ current: 0, total: 0 });
      return scan;
    }
    const pageFiles = pagesDirectory
      .list()
      .filter((entry): entry is File => entry instanceof File && entry.uri.endsWith('.json'));
    const seenIds = new Set<string>();
    options?.onRebuildProgress?.({ current: 0, total: pageFiles.length });
    for (const [index, entry] of pageFiles.entries()) {
      if (options?.signal?.aborted) throw new Error('Journal catalog rebuild cancelled');
      // Details never carry the raw path, page id, body, or error text.
      const recordId = opaqueRecordId(entry.uri);
      const filenameId = entry.name.replace(/\.json$/, '');
      const pageRaw = await readEncryptedDetailed(entry, encryption, derivedKey);
      if (pageRaw.status === 'value') {
        // Runtime-validate the decoded record instead of trusting the cast;
        // a valid JSON body with the wrong shape must fail closed.
        let page = parseValidPage(pageRaw.value, recordId);
        let legacy = false;
        if (!page && derivedKey) {
          // A password layer under the zeroed auto-lock key (<= 0.20.0) is
          // intact data, not corruption. It is reported separately so only
          // the explicit recovery flow can re-encrypt it.
          const legacyValue = await decryptLegacyZeroKey(pageRaw.value);
          page = legacyValue === null ? undefined : parseValidPage(legacyValue, recordId);
          legacy = !!page;
        }
        if (!page) {
          scan.unusable.push(recordId);
        } else if (page.id !== filenameId) {
          // The record id and its filename-derived catalog key disagree, so the
          // projection would be ambiguous. Fail closed.
          scan.unusable.push(recordId);
        } else if (seenIds.has(page.id)) {
          // Two discovered records claim the same id; neither can be published
          // as the single authoritative row.
          scan.unusable.push(recordId);
        } else {
          seenIds.add(page.id);
          if (legacy) {
            scan.legacyPages.push(page);
            scan.legacyRecords.push(recordId);
          } else {
            scan.pages.push(page);
          }
        }
      } else if (pageRaw.status === 'unreadable') {
        scan.unusable.push(recordId);
      }
      options?.onRebuildProgress?.({ current: index + 1, total: pageFiles.length });
    }
    return scan;
  }

  /**
   * A complete scan of every discovered page file can rebuild a projection.
   * Every record must be structurally valid, its id must match the filename-
   * derived page id, and no two records may claim the same id. Any unreadable
   * or ambiguous page blocks publication and is reported as a typed,
   * recoverable CATALOG_UNREADABLE outcome with opaque record identifiers.
   * Legacy zero-key pages block it too, as LEGACY_ZERO_KEY, until recovered.
   */
  async function readJournalPages(
    journalId: string,
    derivedKey: Uint8Array | undefined,
    options: JournalOverviewReadOptions | undefined,
    errorCode: IntegrityCode,
  ): Promise<Page[]> {
    const scan = await scanPageRecords(journalId, derivedKey, options);
    assertCompletePageScan(journalId, scan, errorCode);
    return scan.pages;
  }

  /**
   * Metadata whose password layer did not open: a legacy zero-key wrap is
   * recoverable; anything else means this key cannot read the journal.
   */
  async function parseJournalMetadata(
    id: string,
    value: string,
  ): Promise<Omit<JournalContent, 'pages'>> {
    try {
      return safeJsonParse<Omit<JournalContent, 'pages'>>(value, `journal:${id} metadata`);
    } catch {
      if ((await decryptLegacyZeroKey(value)) !== null) {
        throw new StorageIntegrityError(
          'LEGACY_ZERO_KEY',
          `Journal ${id} metadata was saved under an auto-locked key and needs recovery.`,
          { journalId: id, details: [opaqueRecordId(getMetadataFile(id).uri)] },
        );
      }
      throw new StorageIntegrityError(
        'JOURNAL_UNREADABLE',
        `Journal ${id} metadata could not be decrypted with this key.`,
        { journalId: id, cause: 'PASSWORD_DECRYPT_FAILED' },
      );
    }
  }

  async function deviceDecryptFile(file: File): Promise<string | null> {
    if (!file.exists) return null;
    try {
      return await encryption.decrypt(await file.text());
    } catch {
      return null;
    }
  }

  async function verifyJournalKeyImpl(
    journalId: string,
    derivedKey: Uint8Array,
  ): Promise<JournalKeyVerdict> {
    const metadataFile = getMetadataFile(journalId);
    const metadata = await deviceDecryptFile(metadataFile);
    if (metadata === null) {
      throw new StorageIntegrityError(
        'JOURNAL_UNREADABLE',
        `Journal ${journalId} metadata could not be read safely.`,
        {
          journalId,
          cause: metadataFile.exists ? 'DEVICE_DECRYPT_FAILED' : 'MISSING_PAGE_FILE',
        },
      );
    }
    const pagesDirectory = getPagesDir(journalId);
    const evidence: KeyEvidence[] = [() => deviceDecryptFile(getPageCatalogFile(journalId))];
    if (pagesDirectory.exists) {
      for (const entry of pagesDirectory.list()) {
        if (entry instanceof File && entry.uri.endsWith('.json')) {
          evidence.push(() => deviceDecryptFile(entry));
        }
      }
    }
    return verifyKeyAgainstRecords(metadata, journalId, derivedKey, evidence);
  }

  /**
   * Stage replacements for legacy zero-key attachment payloads of recovered
   * pages. Payloads that already open with the real key, or that are too large
   * to hold in memory, are left untouched.
   */
  async function stageLegacyAttachmentRewraps(
    transaction: TransactionBuilder,
    pages: readonly Page[],
    derivedKey: Uint8Array,
  ): Promise<void> {
    const rewrap = async (file: File) => {
      const device = await deviceDecryptFile(file);
      if (device === null) return;
      const read = await classifyPasswordLayer(device, derivedKey);
      if (read.layer !== 'legacy-zero') return;
      transaction.stage(
        file,
        await encryption.encrypt(await aesGcmEncrypt(read.value!, derivedKey)),
      );
    };
    // Recovered pages passed validatePage, so both attachment arrays exist.
    for (const page of pages) {
      for (const attachment of [...page.images, ...page.files]) {
        if (!attachment.encrypted || !attachment.path) continue;
        if (attachment.content?.format === 'canto-chunked-v1') {
          const root = new Directory(attachment.path);
          for (let index = 0; index < attachment.content.chunkCount; index++) {
            const chunk = getChunkFile(root, index);
            if (chunk.exists) await rewrap(chunk);
          }
        } else {
          const file = new File(attachment.path);
          if (file.exists && file.size <= LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES) await rewrap(file);
        }
      }
    }
  }

  /**
   * Stage files one at a time so a large recovery never holds every
   * ciphertext in memory, then commit through the same marker protocol as
   * every other multi-file write.
   */
  function beginTransaction(idPrefix: string): TransactionBuilder {
    const transactionDir = getTransactionDir(`${idPrefix}-${generateUUID()}`);
    transactionDir.create({ intermediates: true });
    const transaction: StorageTransaction = { phase: 'prepared', files: [] };
    return {
      transactionDir,
      transaction,
      stage(target, ciphertext) {
        transaction.files.push(
          stageRawFile(transactionDir, transaction.files.length, target, ciphertext),
        );
      },
      async commit() {
        try {
          writeTransactionMarker(transactionDir, transaction);
          transaction.phase = 'committing';
          writeTransactionMarker(transactionDir, transaction);
          await applyStorageTransaction(transaction);
          retireTransaction(transactionDir);
        } catch (error) {
          if (transaction.phase === 'prepared' && transactionDir.exists) transactionDir.delete();
          throw error;
        }
      },
      discard() {
        if (transaction.phase === 'prepared' && transactionDir.exists) transactionDir.delete();
      },
    };
  }

  async function readPageCatalogDetailed(
    journalId: string,
    derivedKey?: Uint8Array,
  ): Promise<IndexedRead<PageCatalogV1>> {
    const raw = await readEncryptedDetailed(getPageCatalogFile(journalId), encryption, derivedKey);
    if (raw.status === 'absent') return { state: 'absent' };
    if (raw.status === 'unreadable') return { state: 'unreadable', cause: raw.cause };
    try {
      const parsed = safeJsonParse<unknown>(raw.value, `journal:${journalId} page catalog`);
      if (isPageCatalogV1(parsed, journalId)) {
        return { state: 'valid', value: parsed };
      }
      return { state: 'unreadable', cause: 'VALIDATION_FAILED' };
    } catch {
      return { state: 'unreadable', cause: 'JSON_PARSE_FAILED' };
    }
  }

  /** Legacy tolerant helper for import-recovery verification only. */
  async function readPageCatalog(
    journalId: string,
    derivedKey?: Uint8Array,
  ): Promise<PageCatalogV1 | null> {
    const read = await readPageCatalogDetailed(journalId, derivedKey);
    return read.state === 'valid' ? read.value : null;
  }

  async function commitStagedWrites(
    idPrefix: string,
    entries: { target: File; ciphertext: string }[],
  ): Promise<void> {
    if (entries.length === 0) return;
    const transactionDir = getTransactionDir(`${idPrefix}-${generateUUID()}`);
    transactionDir.create({ intermediates: true });
    const transaction: StorageTransaction = { phase: 'prepared', files: [] };
    try {
      entries.forEach((entry, index) => {
        transaction.files.push(stageRawFile(transactionDir, index, entry.target, entry.ciphertext));
      });
      writeTransactionMarker(transactionDir, transaction);
      transaction.phase = 'committing';
      writeTransactionMarker(transactionDir, transaction);
      await applyStorageTransaction(transaction);
      retireTransaction(transactionDir);
    } catch (error) {
      if (transaction.phase === 'prepared' && transactionDir.exists) transactionDir.delete();
      throw error;
    }
  }

  async function writePageCatalog(
    journalId: string,
    pages: readonly Page[],
    derivedKey?: Uint8Array,
  ): Promise<void> {
    await commitStagedWrites('catalog', [
      {
        target: getPageCatalogFile(journalId),
        ciphertext: await encryptForStorage(
          JSON.stringify(createPageCatalog(journalId, pages)),
          derivedKey,
        ),
      },
    ]);
  }

  async function encryptForStorage(data: string, derivedKey?: Uint8Array): Promise<string> {
    assertUsableDerivedKey(derivedKey);
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
      retireTransaction(transactionDir);
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
      retireTransaction(transactionDir);
    } catch (error) {
      if (transaction.phase === 'prepared' && transactionDir.exists) transactionDir.delete();
      throw error;
    }
  }

  async function loadOverviewInternal(
    id: string,
    derivedKey?: Uint8Array,
    options?: JournalOverviewReadOptions,
  ): Promise<JournalOverview | null> {
    const metadataRead = await readEncryptedDetailed(getMetadataFile(id), encryption, derivedKey);
    if (metadataRead.status === 'absent') return null;
    if (metadataRead.status === 'unreadable') {
      throw new StorageIntegrityError(
        'JOURNAL_UNREADABLE',
        `Journal ${id} exists but its metadata could not be read safely.`,
        { journalId: id, cause: metadataRead.cause },
      );
    }
    const metadata = await parseJournalMetadata(id, metadataRead.value);
    const catalogRead = await readPageCatalogDetailed(id, derivedKey);
    if (catalogRead.state === 'valid') return catalogToOverview(metadata, catalogRead.value);

    // Existing journals receive a catalog lazily. A replacement may be
    // published only after a complete strict scan of every discovered page
    // file validates successfully; any unreadable page fails closed instead
    // of publishing a reduced view.
    recordStorageIo('catalogRebuilds');
    const pages = await readJournalPages(id, derivedKey, options, 'CATALOG_UNREADABLE');
    if (options?.signal?.aborted) throw new Error('Journal catalog rebuild cancelled');
    await writePageCatalog(id, pages, derivedKey);
    return catalogToOverview(metadata, createPageCatalog(id, pages));
  }

  async function deleteJournalRaw(id: string): Promise<void> {
    // Verify the index is readable before deleting anything: an unreadable
    // baseline must block destructive publication, never orphan a directory.
    const index = await readIndex();
    // Delete directory first — if this fails, the journal stays in the index
    // (visible but recoverable). Reverse order would orphan data.
    const dir = getJournalDir(id);
    if (dir.exists) {
      dir.delete();
    }
    index.journals = index.journals.filter((j) => j.id !== id);
    await commitIndexOnly(index);
  }

  async function hasExistingDataImpl(): Promise<boolean> {
    const baseDir = getBaseDir();
    if (!baseDir.exists) return false;
    for (const entry of baseDir.list()) {
      if (entry instanceof Directory) {
        if (entry.name !== TRANSACTIONS_DIR_NAME && entry.name !== IMPORTS_DIR_NAME) return true;
      } else if (
        entry.name !== FIRST_INSTALL_MARKER_NAME &&
        entry.name !== DEVICE_KEY_ROTATION_COMPLETE_NAME
      ) {
        return true;
      }
    }
    return false;
  }

  async function recordFirstInstallImpl(): Promise<void> {
    ensureDir(getBaseDir());
    const marker = new File(getBaseDir(), FIRST_INSTALL_MARKER_NAME);
    if (!marker.exists) marker.create({ intermediates: true });
    marker.write('first-install');
  }

  /** Every device-encrypted record below the root, excluding staging and markers. */
  function deviceEncryptedFiles(): File[] {
    return listFilesRecursively(getBaseDir()).filter(
      (file) =>
        !file.uri.includes(`/${TRANSACTIONS_DIR_NAME}/`) &&
        !file.uri.includes(`/${IMPORTS_DIR_NAME}/`) &&
        file.name !== DEVICE_KEY_ROTATION_COMPLETE_NAME &&
        file.name !== FIRST_INSTALL_MARKER_NAME &&
        !file.name.endsWith('.tmp') &&
        !file.name.endsWith('.size'),
    );
  }

  function isOversizedLegacyAttachment(file: File): boolean {
    return (
      file.uri.includes('/attachments/') &&
      !file.uri.includes('/chunk-v1-') &&
      file.size > LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES
    );
  }

  /** Every file a device-key rotation re-encrypts, in staging order. */
  function rotatableFiles(journals: readonly Journal[]): File[] {
    const files = deviceEncryptedFiles();
    return journals.flatMap((journal) => {
      const prefix = childPrefix(getJournalDir(journal.id));
      return files.filter((file) => file.uri.startsWith(prefix));
    });
  }

  async function stageDeviceKeyRotation(
    transaction: TransactionBuilder,
    journals: readonly Journal[],
    oldDeviceDecrypt: (ciphertext: string) => Promise<string>,
    newDeviceEncrypt: (plaintext: string) => Promise<string>,
    onProgress?: (current: number, total: number) => void,
  ): Promise<void> {
    const files = rotatableFiles(journals);
    const unsafeLegacy = deviceEncryptedFiles().find(isOversizedLegacyAttachment);
    if (unsafeLegacy) {
      throw new Error(
        `Cannot safely rotate device key for legacy attachment: ${unsafeLegacy.name}`,
      );
    }
    let processed = 0;
    for (const journal of journals) {
      const prefix = childPrefix(getJournalDir(journal.id));
      for (const file of files.filter((candidate) => candidate.uri.startsWith(prefix))) {
        transaction.stage(file, await newDeviceEncrypt(await oldDeviceDecrypt(await file.text())));
      }
      onProgress?.(++processed, journals.length);
    }
    // Never rotate a partial set: if any journal's metadata exists but was
    // not staged, the enumeration is wrong and committing would leave that
    // journal on a key that is about to be deleted.
    const staged = new Set(transaction.transaction.files.map((file) => file.target));
    for (const journal of journals) {
      const metadata = getMetadataFile(journal.id);
      if (metadata.exists && !staged.has(metadata.uri)) {
        throw new Error('Device-key rotation did not cover every journal record');
      }
    }
    // The index is deliberately staged last, but it is not a journal file.
    const indexFile = getJournalsIndexFile();
    if (indexFile.exists) {
      transaction.stage(
        indexFile,
        await newDeviceEncrypt(await oldDeviceDecrypt(await indexFile.text())),
      );
    }
    // This raw marker is staged with every ciphertext. It becomes visible
    // only at the same durable commit point, and contains no key material.
    transaction.stage(getDeviceKeyRotationCompleteFile(), 'complete');
  }

  /** Native storage steps for runDeviceKeyRotation. */
  function createRotationIO(): DeviceKeyRotationIO {
    let builder: TransactionBuilder | null = null;
    let journals: Journal[] = [];

    return {
      async preflight() {
        // runDeviceKeyRotation checked that no fallback key is pending, so a
        // completion marker here is a leftover from a finished rotation. It
        // must not survive into this rotation, where it would let startup
        // discard the only key a crash left the data under.
        const completion = getDeviceKeyRotationCompleteFile();
        if (completion.exists) {
          try {
            completion.delete();
          } catch {
            throw new RotationBlockedError(
              'ROTATION_PENDING',
              'A previous rotation marker could not be cleared; rotation refused.',
            );
          }
        }
        try {
          journals = (await readIndex()).journals;
        } catch {
          throw new RotationBlockedError(
            'UNREADABLE_DATA',
            'The journal index could not be read safely; rotation refused.',
          );
        }
        const indexed = new Set(journals.map((journal) => journal.id));
        // initialize() created the root before any rotation can run.
        for (const entry of getBaseDir().list()) {
          if (!(entry instanceof Directory)) continue;
          const name = directoryName(entry);
          if (name === TRANSACTIONS_DIR_NAME) {
            if (entry.list().length > 0) {
              throw new RotationBlockedError(
                'ROTATION_PENDING',
                'A storage transaction is still pending; rotation refused.',
              );
            }
          } else if (name === IMPORTS_DIR_NAME) {
            if (entry.list().length > 0) {
              throw new RotationBlockedError(
                'UNRECOVERED_DATA',
                'A journal import is still pending; rotation refused.',
              );
            }
          } else if (!indexed.has(name)) {
            // Unindexed journal data would stay on the retired key forever.
            throw new RotationBlockedError(
              'UNRECOVERED_DATA',
              'Journal data exists outside the index; rotation refused.',
            );
          }
        }
        const files = rotatableFiles(journals);
        if (files.some(isOversizedLegacyAttachment)) {
          throw new RotationBlockedError(
            'UNSUPPORTED_DATA',
            'A legacy attachment is too large to rotate safely.',
          );
        }
        // Staging holds a second copy of every rotated record until cleanup.
        const indexFile = getJournalsIndexFile();
        const required =
          files.reduce((total, file) => total + file.size, indexFile.exists ? indexFile.size : 0) *
            1.1 +
          ROTATION_FREE_SPACE_MARGIN_BYTES;
        const available = readAvailableDiskSpace();
        if (available !== null && available < required) {
          throw new RotationBlockedError(
            'INSUFFICIENT_SPACE',
            'Not enough free storage to rotate the device key safely.',
          );
        }
      },

      async stage(oldDecrypt, newEncrypt, onProgress) {
        builder = beginTransaction('device');
        try {
          await stageDeviceKeyRotation(builder, journals, oldDecrypt, newEncrypt, onProgress);
        } catch {
          // Preflight already refused unsupported data, so any failure here is
          // a record the current key cannot decrypt.
          throw new RotationBlockedError(
            'UNREADABLE_DATA',
            'A journal record could not be decrypted with the current device key.',
          );
        }
      },

      async discard() {
        builder?.discard();
      },

      async markCommitting() {
        const { transactionDir, transaction } = builder!;
        writeTransactionMarker(transactionDir, transaction);
        // Flip the in-memory phase only after the durable write returned, so a
        // failed commit write can still discard its uncommitted staging copy.
        writeTransactionMarker(transactionDir, { ...transaction, phase: 'committing' });
        transaction.phase = 'committing';
      },

      async isCommitting() {
        return (await readTransactionMarker(builder!.transactionDir))?.phase === 'committing';
      },

      async apply() {
        await applyStorageTransaction(builder!.transaction);
      },

      async verify(newKey) {
        const sample = createRotationVerifySampler();
        for (const { target, staged } of builder!.transaction.files) {
          const written = await new File(target).text();
          if (written !== (await new File(staged).text())) {
            throw new Error('Rotated record does not match its staged copy');
          }
          // The fallback key is discarded next: prove the new key itself
          // opens the index, every journal's metadata and catalog, and a
          // sample of pages.
          if (sample(target)) await aesGcmDecrypt(written, newKey);
        }
      },

      async cleanup() {
        const { transactionDir } = builder!;
        retireTransaction(transactionDir);
      },

      async clearCompletionMarker() {
        const marker = getDeviceKeyRotationCompleteFile();
        if (marker.exists) marker.delete();
      },

      seal() {
        barrier.seal();
      },
    };
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
      const index = await readIndexTyped();
      if (index.state === 'unreadable') {
        throw new StorageIntegrityError(
          'INDEX_UNREADABLE',
          'The journal index could not be read safely; the library cannot be listed.',
          { cause: index.cause },
        );
      }
      // A missing index on a non-empty root is an integrity/recovery
      // condition, never an empty library — except for durable records owned
      // by a live, marker-verified import that is still staging its final
      // index publication.
      if (
        index.state === 'absent' &&
        (await hasDurableJournalData(await activeImportJournalIds()))
      ) {
        throw new StorageIntegrityError(
          'INDEX_UNREADABLE',
          'The journal index is missing while journal data exists; the library cannot be listed.',
          { cause: 'INDEX_ABSENT' },
        );
      }
      return index.state === 'valid' ? index.value.journals : [];
    },

    async getJournal(id: string, derivedKey?: Uint8Array): Promise<JournalContent | null> {
      const metaRead = await readEncryptedDetailed(getMetadataFile(id), encryption, derivedKey);
      if (metaRead.status === 'absent') return null;
      if (metaRead.status === 'unreadable') {
        throw new StorageIntegrityError(
          'JOURNAL_UNREADABLE',
          `Journal ${id} exists but its metadata could not be read safely.`,
          { journalId: id, cause: metaRead.cause },
        );
      }
      const metadata = await parseJournalMetadata(id, metaRead.value);

      const pages = await readJournalPages(id, derivedKey, undefined, 'JOURNAL_UNREADABLE');
      return { ...metadata, pages };
    },

    async getJournalOverview(
      id: string,
      derivedKey?: Uint8Array,
      options?: JournalOverviewReadOptions,
    ) {
      return loadOverviewInternal(id, derivedKey, options);
    },

    async getJournalSyncSnapshot(
      id: string,
      derivedKey?: Uint8Array,
    ): Promise<JournalSyncSnapshot | null> {
      const overview = await loadOverviewInternal(id, derivedKey);
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

    async scanJournalPages(
      journalId: string,
      derivedKey?: Uint8Array,
      options?: JournalOverviewReadOptions,
    ): Promise<JournalPageScan> {
      // Raw page files are authoritative: the catalog is deliberately ignored
      // and every discovered page must validate before recovery is offered.
      // A revoked/absent key is rejected up front so a locked secure journal is
      // never silently scanned through the device-only password-layer fallback.
      assertUsableDerivedKey(derivedKey);
      if (await isJournalSecure(journalId)) requireUsableDerivedKey(derivedKey);
      const scan = await scanPageRecords(journalId, derivedKey, options);
      // Legacy zero-key pages are recoverable and count toward the preview;
      // anything else unreadable still fails closed.
      assertCompletePageScan(journalId, { ...scan, legacyPages: [] }, 'CATALOG_UNREADABLE');
      const pages = [...scan.pages, ...scan.legacyPages];
      return {
        journalId,
        pageCount: pages.length,
        pages,
        legacyPageCount: scan.legacyPages.length,
      };
    },

    async restoreJournalCatalog(
      journalId: string,
      derivedKey?: Uint8Array,
    ): Promise<JournalPageScan> {
      // Catalog-only publication through the same serialized, crash-recoverable
      // transaction path as every other projection write. The confirmed write
      // must not trust a preview captured earlier: it re-scans every raw page
      // record here, inside the mutation slot, and publishes only that fresh,
      // fully validated set. Raw page records are rewritten only when they
      // were saved under the legacy zero key, and then only with a verified
      // key; the same key guard as savePage prevents a secure journal's
      // catalog from being downgraded to device-only data.
      assertUsableDerivedKey(derivedKey);
      if (await isJournalSecure(journalId)) requireUsableDerivedKey(derivedKey);
      const scan = await scanPageRecords(journalId, derivedKey);
      assertCompletePageScan(journalId, { ...scan, legacyPages: [] }, 'CATALOG_UNREADABLE');
      const pages = [...scan.pages, ...scan.legacyPages];
      const metadataFile = getMetadataFile(journalId);
      const metadataDevice = await deviceDecryptFile(metadataFile);
      const legacyMetadata =
        metadataDevice === null
          ? null
          : await classifyPasswordLayer(metadataDevice, derivedKey).then((read) =>
              read.layer === 'legacy-zero' ? read.value! : null,
            );
      const transaction = beginTransaction('recovery');
      try {
        if (scan.legacyPages.length > 0 || legacyMetadata !== null) {
          // Re-encrypting under an unproven key would lock the user out for
          // good, so the key must open at least one existing record first.
          const key = requireUsableDerivedKey(derivedKey);
          const verdict = await verifyJournalKeyImpl(journalId, key);
          if (verdict === 'unverifiable') {
            throw new StorageIntegrityError(
              'KEY_UNVERIFIABLE',
              'No stored record can confirm this password; recovery refused.',
              { journalId },
            );
          }
          if (verdict !== 'valid') {
            throw new JournalLockedError(
              'The journal key could not be verified; recovery refused.',
            );
          }
          if (legacyMetadata !== null) {
            transaction.stage(metadataFile, await encryptForStorage(legacyMetadata, key));
          }
          for (const page of scan.legacyPages) {
            transaction.stage(
              getPageFile(journalId, page.id),
              await encryptForStorage(JSON.stringify(page), key),
            );
          }
          await stageLegacyAttachmentRewraps(transaction, scan.legacyPages, key);
        }
        transaction.stage(
          getPageCatalogFile(journalId),
          await encryptForStorage(JSON.stringify(createPageCatalog(journalId, pages)), derivedKey),
        );
      } catch (error) {
        transaction.discard();
        throw error;
      }
      await transaction.commit();
      return {
        journalId,
        pageCount: pages.length,
        pages,
        legacyPageCount: scan.legacyPages.length,
      };
    },

    async saveJournal(journal: JournalContent, derivedKey?: Uint8Array): Promise<void> {
      // A secure journal's metadata/pages/catalog are password-layer protected.
      // Without a usable key the write would silently replace password
      // ciphertext with device-only data — fail closed instead.
      if (journal.secure) requireUsableDerivedKey(derivedKey);
      // An empty directory is visible on a real filesystem. Check the index
      // before creating one, or a first journal looks like orphan durable data.
      const index = await readIndex();
      ensureDir(getJournalDir(journal.id));
      ensureDir(getPagesDir(journal.id));
      ensureDir(getAttachmentsDir(journal.id));

      const metadata = { ...journal } as Partial<JournalContent>;
      delete metadata.pages;
      const journalMetadata = metadata as Omit<JournalContent, 'pages'>;
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
      if (metadata.secure) requireUsableDerivedKey(derivedKey);
      const index = await readIndex();
      ensureDir(getJournalDir(metadata.id));
      const entry = journalIndexEntry(metadata);
      const existing = index.journals.findIndex((journal) => journal.id === metadata.id);
      if (existing >= 0) index.journals[existing] = entry;
      else index.journals.push(entry);
      // Metadata and the index projection commit as one crash-recoverable
      // transaction so a background kill cannot publish a partial record.
      await commitStagedWrites('metadata', [
        {
          target: getMetadataFile(metadata.id),
          ciphertext: await encryptForStorage(JSON.stringify(metadata), derivedKey),
        },
        {
          target: getJournalsIndexFile(),
          ciphertext: await encryptForStorage(JSON.stringify(index)),
        },
      ]);
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
      // Call the internal implementation directly: abortJournalImport is itself
      // a serialized mutation, so re-entering the write barrier through the
      // wrapped deleteJournal would deadlock on the mutation queue.
      await deleteJournalRaw(id);
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

    /** Keyless proof that the root was set up as a fresh install. */
    async recordFirstInstall(): Promise<void> {
      await recordFirstInstallImpl();
    },

    /** Keyless check: does durable Canto content exist below the root? */
    async hasExistingData(): Promise<boolean> {
      return hasExistingDataImpl();
    },

    async deleteJournal(id: string): Promise<void> {
      await deleteJournalRaw(id);
    },

    async getPage(
      journalId: string,
      pageId: string,
      derivedKey?: Uint8Array,
    ): Promise<Page | null> {
      const file = getPageFile(journalId, pageId);
      const raw = await readEncryptedDetailed(file, encryption, derivedKey);
      if (raw.status === 'absent') return null;
      if (raw.status === 'unreadable') {
        throw new StorageIntegrityError(
          'JOURNAL_UNREADABLE',
          `Page ${pageId} exists but could not be read safely.`,
          { journalId, cause: raw.cause, details: [pageId] },
        );
      }
      return safeJsonParse<Page>(raw.value, `page:${pageId}`);
    },

    async savePage(
      journalId: string,
      page: Page,
      derivedKey?: Uint8Array,
      preserveModified?: boolean,
    ): Promise<void> {
      assertUsableDerivedKey(derivedKey);
      // Same password-layer preservation contract as the attachment writers:
      // a secure journal must never publish device-only page data. The guard
      // runs before any filesystem touch so a keyless/revoked mutation cannot
      // create directories either.
      if (await isJournalSecure(journalId)) requireUsableDerivedKey(derivedKey);
      ensureDir(getPagesDir(journalId));
      const updated = preserveModified ? page : { ...page, modified: Date.now() };
      const catalogRead = await readPageCatalogDetailed(journalId, derivedKey);
      if (catalogRead.state === 'valid') {
        // Provably consistent warm view: update one projection without opening
        // unrelated page files.
        await commitPageAndCatalog(
          journalId,
          updated,
          withCatalogPage(catalogRead.value, updated),
          derivedKey,
        );
        return;
      }
      // Missing or unreadable catalog: a rebuild may publish only after a
      // complete scan of every discovered page file validates successfully.
      const pages = await readJournalPages(journalId, derivedKey, undefined, 'CATALOG_UNREADABLE');
      await commitPageAndCatalog(
        journalId,
        updated,
        withCatalogPage(createPageCatalog(journalId, pages), updated),
        derivedKey,
      );
    },

    async deletePage(journalId: string, pageId: string, derivedKey?: Uint8Array): Promise<void> {
      assertUsableDerivedKey(derivedKey);
      if (await isJournalSecure(journalId)) requireUsableDerivedKey(derivedKey);
      const page = await this.getPage(journalId, pageId, derivedKey);
      if (!page) return;

      // Soft delete: mark as deleted, update modified timestamp
      const deleted = { ...page, deleted: true, modified: Date.now() };
      const catalogRead = await readPageCatalogDetailed(journalId, derivedKey);
      if (catalogRead.state === 'valid') {
        await commitPageAndCatalog(
          journalId,
          deleted,
          withCatalogPage(catalogRead.value, deleted),
          derivedKey,
        );
      } else {
        const pages = await readJournalPages(
          journalId,
          derivedKey,
          undefined,
          'CATALOG_UNREADABLE',
        );
        await commitPageAndCatalog(
          journalId,
          deleted,
          withCatalogPage(createPageCatalog(journalId, pages), deleted),
          derivedKey,
        );
      }

      // The page's draft is deliberately kept: sync also deletes pages (for a
      // deletion made on another device), and that must never destroy unsaved
      // local typing. The editor discards the draft on a user delete.

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
      // Encrypted attachments must never be downgraded to device-only storage
      // when the password key is unavailable; require it and encrypt
      // unconditionally.
      const passwordKey = attachment.encrypted ? requireUsableDerivedKey(derivedKey) : undefined;
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
            const inner = passwordKey ? await aesGcmEncrypt(frame, passwordKey) : frame;
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
      const toDeviceEncrypt = passwordKey ? await aesGcmEncrypt(data, passwordKey) : data;
      const ciphertext = await encryption.encrypt(toDeviceEncrypt);
      if (!file.exists) file.create({ intermediates: true });
      file.write(ciphertext);
      return file.uri;
    },

    async saveAttachmentStream(journalId, pageId, attachment, chunks, derivedKey): Promise<string> {
      const passwordKey = attachment.encrypted ? requireUsableDerivedKey(derivedKey) : undefined;
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
          const inner = passwordKey ? await aesGcmEncrypt(frame, passwordKey) : frame;
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
      const drafts = getDraftsDir(journal.id);
      if (drafts.exists && drafts.list().length > 0) throw new DraftsPendingError();
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
          !Array.from(oldChunkRoots).some((root) => entry.uri.startsWith(childPrefix(root))) &&
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
        retireTransaction(transactionDir);

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

      const transaction = beginTransaction('device');
      try {
        await stageDeviceKeyRotation(
          transaction,
          journals,
          oldDeviceDecrypt,
          newDeviceEncrypt,
          onProgress,
        );
      } catch (error) {
        transaction.discard();
        throw error;
      }
      // Before the commit marker the original view is intact. A committed
      // marker is intentionally retained so initialize() can finish replay.
      await transaction.commit();
    },

    async rotateDeviceKey(custody, onProgress): Promise<void> {
      await runDeviceKeyRotation(createRotationIO(), custody, encryption, onProgress);
    },

    async verifyJournalKey(journalId: string, derivedKey: Uint8Array) {
      return verifyJournalKeyImpl(journalId, derivedKey);
    },

    async collectDiagnostics(journalId?: string, derivedKey?: Uint8Array) {
      const indexRead = await readIndexTyped();
      const indexed = new Set(
        indexRead.state === 'valid' ? indexRead.value.journals.map((journal) => journal.id) : [],
      );
      let unindexed = 0;
      let pendingTransactions = 0;
      let pendingImports = 0;
      // The store is initialized, so the root exists.
      for (const entry of getBaseDir().list()) {
        if (!(entry instanceof Directory)) continue;
        const name = directoryName(entry);
        if (name === TRANSACTIONS_DIR_NAME) pendingTransactions = entry.list().length;
        else if (name === IMPORTS_DIR_NAME) pendingImports = entry.list().length;
        else if (!indexed.has(name)) unindexed++;
      }
      const diagnostics: StorageDiagnostics = {
        format: 'canto-diagnostics-v1',
        platform: 'native',
        index: indexRead.state,
        indexedJournals: indexed.size,
        unindexedJournalDirectories: unindexed,
        pendingTransactions,
        pendingImports,
        rotationCompletionMarker: getDeviceKeyRotationCompleteFile().exists,
      };
      if (journalId) {
        const key = derivedKey && !derivedKey.every((byte) => byte === 0) ? derivedKey : undefined;
        const metadata = emptyLayerCounts();
        const catalog = emptyLayerCounts();
        const pages = emptyLayerCounts();
        const metadataFile = getMetadataFile(journalId);
        if (metadataFile.exists) {
          await countRecordLayer(metadata, await deviceDecryptFile(metadataFile), key);
        }
        const catalogFile = getPageCatalogFile(journalId);
        if (catalogFile.exists) {
          await countRecordLayer(catalog, await deviceDecryptFile(catalogFile), key);
        }
        const pagesDirectory = getPagesDir(journalId);
        if (pagesDirectory.exists) {
          for (const entry of pagesDirectory.list()) {
            if (entry instanceof File && entry.uri.endsWith('.json')) {
              await countRecordLayer(pages, await deviceDecryptFile(entry), key);
            }
          }
        }
        const draftsDirectory = getDraftsDir(journalId);
        diagnostics.journal = {
          keySupplied: !!key,
          metadata,
          catalog,
          pages,
          drafts: draftsDirectory.exists ? draftsDirectory.list().length : 0,
        };
      }
      return diagnostics;
    },

    async saveDraft(journalId: string, draft: Page, derivedKey?: Uint8Array): Promise<void> {
      assertUsableDerivedKey(derivedKey);
      if (await isJournalSecure(journalId)) requireUsableDerivedKey(derivedKey);
      // A draft never creates a journal directory: an orphan directory would
      // trip the fail-closed missing-index guard.
      if (!getJournalDir(journalId).exists) throw new Error(`Journal not found: ${journalId}`);
      ensureDir(getDraftsDir(journalId));
      await commitStagedWrites('draft', [
        {
          target: getDraftFile(journalId, draft.id),
          ciphertext: await encryptForStorage(JSON.stringify(draft), derivedKey),
        },
      ]);
    },

    async getDraft(journalId: string, pageId: string, derivedKey?: Uint8Array) {
      const raw = await readEncryptedDetailed(
        getDraftFile(journalId, pageId),
        encryption,
        derivedKey,
      );
      if (raw.status !== 'value') return null;
      // A draft is a convenience copy. One that does not open with this key
      // is kept on disk but never shown.
      const draft = parseValidPage(raw.value, opaqueRecordId(getDraftFile(journalId, pageId).uri));
      return draft && draft.id === pageId ? draft : null;
    },

    async listDrafts(journalId: string): Promise<string[]> {
      const draftsDirectory = getDraftsDir(journalId);
      if (!draftsDirectory.exists) return [];
      return draftsDirectory
        .list()
        .filter((entry): entry is File => entry instanceof File && entry.uri.endsWith('.json'))
        .map((entry) => entry.name.replace(/\.json$/, ''));
    },

    async deleteDraft(journalId: string, pageId: string): Promise<void> {
      const file = getDraftFile(journalId, pageId);
      if (file.exists) file.delete();
    },
  };
  return serializeDeviceKeyWrites(store, barrier);
}
