import { Paths, File, Directory } from 'expo-file-system';
import type { Journal, JournalContent, Page, Attachment } from 'canto-data';
import type { EncryptionService } from '@/lib/encryption';
import { aesGcmEncrypt, aesGcmDecrypt, generateUUID } from '@/lib/encryption/utils';
import { safeJsonParse } from '@/lib/utils/json';
import type { LocalStore, ReencryptionResult } from './types';
import { serializeDeviceKeyWrites } from './write-barrier';
import {
  chunkBytesToBase64,
  decodeChunkFrame,
  encodeChunkFrame,
  joinBase64Chunks,
  splitBase64Chunks,
  LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES,
} from './attachment-content';

const BASE_DIR_NAME = 'canto';
const JOURNALS_INDEX_NAME = 'journals.json';
const DEVICE_KEY_ROTATION_COMPLETE_NAME = '.device-key-rotation-complete';

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

/** Durable, keyless proof that a device-data transaction committed. */
function getDeviceKeyRotationCompleteFile(): File {
  return new File(getBaseDir(), DEVICE_KEY_ROTATION_COMPLETE_NAME);
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

  const store: LocalStore = {
    async initialize(): Promise<void> {
      ensureDir(getBaseDir());
      // Transactions have an explicit commit point; replay only committed
      // staging before exposing pages to callers.
      await recoverTransactions();
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

      const pagesDirectory = getPagesDir(id);
      const pages: Page[] = [];

      if (pagesDirectory.exists) {
        const entries = pagesDirectory.list();
        for (const entry of entries) {
          if (entry instanceof File && entry.uri.endsWith('.json')) {
            const pageRaw = await readEncrypted(entry, encryption, derivedKey);
            if (pageRaw) {
              pages.push(safeJsonParse<Page>(pageRaw, `page:${entry.name}`));
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
            chunkBytesToBase64(bytes),
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
      const manifest = JSON.parse(await encryption.decrypt(await manifestFile.text())) as {
        journalId: string;
        pageId: string;
        attachment: Attachment;
      };
      const chunks: string[] = [];
      for (let index = 0; index < manifest.attachment.content!.chunkCount; index++) {
        const chunk = getChunkFile(root, index);
        if (!chunk.exists)
          throw new Error(`Attachment chunk missing: ${manifest.attachment.name} #${index}`);
        let frame = await encryption.decrypt(await chunk.text());
        if (manifest.attachment.encrypted && derivedKey)
          frame = await aesGcmDecrypt(frame, derivedKey);
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

    async forEachAttachmentChunk(attachment, visitor): Promise<void> {
      if (!attachment.content || attachment.content.format !== 'canto-chunked-v1') {
        throw new Error(`Chunked content descriptor required for attachment: ${attachment.name}`);
      }
      const root = new Directory(attachment.path);
      for (let index = 0; index < attachment.content.chunkCount; index++) {
        const chunk = getChunkFile(root, index);
        if (!chunk.exists)
          throw new Error(`Attachment chunk missing: ${attachment.name} #${index}`);
        await visitor(index, await encryption.decrypt(await chunk.text()));
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
      const total = pages.length + attachFiles.length + 1;

      try {
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
                  let frame = await encryption.decrypt(await oldChunk.text());
                  if (oldAttachment.encrypted && oldKey) frame = await aesGcmDecrypt(frame, oldKey);
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

        let progress = 0;
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
        transactionDir.create({ intermediates: true });
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
