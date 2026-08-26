import { File, Paths } from 'expo-file-system';
import type { Attachment, JournalContent, JournalSettings, Page } from 'canto-data';
import { DEFAULT_JOURNAL_SETTINGS, validateJournal, validateJournalSettings } from 'canto-data';
import { parseManifest } from 'canto-data/format';
import { SCHEMA_VERSION } from 'canto-data/version';
import { getLocalStore } from '@/hooks/useStorage';
import {
  aesGcmDecryptBytes,
  base64ToUint8,
  generateUUID,
  generateSalt,
  uint8ToBase64,
} from '@/lib/encryption/utils';
import { deriveKey, LEGACY_KDF_ITERATIONS } from '@/lib/encryption/password';
import { safeJsonParse } from '@/lib/utils/json';
import {
  ATTACHMENT_CHUNK_SIZE,
  base64ByteLength,
  chunkedContentForByteLength,
} from '@/lib/storage/attachment-content';
import { nativeAttachmentChunks } from '@/lib/storage/attachment-ingestion';
import { base64AttachmentChunks, generateImportThumbnailFromChunks } from './import-thumbnail';
import { verifyImportedJournal } from './import-verification';
import { estimateNativeImportDiskUse } from './native-import-estimate';
import {
  closeNativeArchive,
  extractNativeArchiveEntry,
  nativeArchiveAvailableBytes,
  openNativeArchive,
  readNativeArchiveText,
  type NativeArchive,
} from './native-archive';
import type { AttachmentError, ImportProgress, ImportResult } from './import-types';

interface AttachmentOwner {
  pageId: string;
  name: string;
  encrypted: boolean;
}

/** Flat v1 AES-GCM entries cannot be authenticated incrementally. */
export const MAX_LEGACY_ENCRYPTED_ENTRY_BYTES = 32 * 1024 * 1024;

function attachmentNameParts(
  name: string,
): { type: 'image' | 'file'; oldId: string; ext: string } | null {
  const match = name.replace('attachments/', '').match(/^(image|file)-([^.]+)\.(.+)$/);
  if (!match) return null;
  return { type: match[1] as 'image' | 'file', oldId: match[2], ext: match[3] };
}

function pageAttachmentOwners(pages: Page[], attachmentId: string): AttachmentOwner[] {
  const owners: AttachmentOwner[] = [];
  for (const page of pages) {
    const found = [...page.images, ...page.files].find(
      (attachment) => attachment.id === attachmentId,
    );
    if (found) owners.push({ pageId: page.id, name: found.name, encrypted: found.encrypted });
  }
  return owners;
}

async function readJson<T>(archive: NativeArchive, name: string, label: string): Promise<T> {
  return safeJsonParse<T>(await readNativeArchiveText(archive, name), label);
}

async function readEncryptedNativeEntry(
  archive: NativeArchive,
  entryName: string,
  derivedKey: Uint8Array,
  signal?: AbortSignal,
): Promise<string> {
  const entry = archive.entries.find(
    (candidate) => candidate.name === entryName && !candidate.directory,
  );
  if (!entry) throw new Error(`Invalid backup: missing ${entryName}`);
  if (entry.size > MAX_LEGACY_ENCRYPTED_ENTRY_BYTES) {
    throw new Error(
      `Encrypted legacy backup contains an attachment or entry too large to import safely: ${entryName}`,
    );
  }
  const temp = new File(Paths.cache, `canto-encrypted-import-${generateUUID()}`);
  try {
    const extracted = await extractNativeArchiveEntry(archive, entryName, temp.uri, signal);
    if (signal?.aborted) throw new Error('Backup import cancelled');
    const source = new File(extracted.uri);
    const ciphertext = await source.bytes();
    if (signal?.aborted) throw new Error('Backup import cancelled');
    return aesGcmDecryptBytes(ciphertext, derivedKey);
  } finally {
    if (temp.exists) temp.delete();
  }
}

async function readNativeJson<T>(
  archive: NativeArchive,
  name: string,
  label: string,
  encrypted: boolean,
  derivedKey?: Uint8Array,
  signal?: AbortSignal,
): Promise<T> {
  if (!encrypted) return readJson<T>(archive, name, label);
  if (!derivedKey) throw new Error('Encrypted backup requires a password');
  return safeJsonParse<T>(await readEncryptedNativeEntry(archive, name, derivedKey, signal), label);
}

/**
 * Android large-backup importer. The native ZipFile bridge owns the archive;
 * JavaScript reads only metadata/page JSON and descriptor-sized temporary files.
 */
export async function importNativeJournal(
  zipUri: string,
  title: string,
  providedKey?: Uint8Array,
  onProgress?: (progress: ImportProgress) => void,
  signal?: AbortSignal,
  expectedSourceFingerprint?: string,
): Promise<ImportResult> {
  const archive = await openNativeArchive(zipUri, signal, expectedSourceFingerprint);
  let newJournalId: string | undefined;
  let importStarted = false;
  let store: Awaited<ReturnType<typeof getLocalStore>> | undefined;
  try {
    if (signal?.aborted) throw new Error('Backup import cancelled');
    onProgress?.({ current: 0, total: 0, phase: 'preparing' });
    const manifest = parseManifest(await readNativeArchiveText(archive, 'manifest.json'));
    let derivedKey = providedKey;
    const attachmentEntries = archive.entries.filter(
      (entry) => !entry.directory && entry.name.startsWith('attachments/'),
    );
    if (manifest.encrypted && !derivedKey) {
      throw new Error('Encrypted backup requires a password');
    }
    if (manifest.encrypted) {
      const unsafeEntry = attachmentEntries.find(
        (entry) => entry.size > MAX_LEGACY_ENCRYPTED_ENTRY_BYTES,
      );
      if (unsafeEntry) {
        throw new Error(
          `Encrypted legacy backup contains an attachment too large to import safely: ${unsafeEntry.name}`,
        );
      }
    }
    if (!manifest.encrypted && !derivedKey && manifest.salt) {
      derivedKey = await deriveKey(
        '',
        base64ToUint8(manifest.salt),
        manifest.kdfIterations ?? LEGACY_KDF_ITERATIONS,
      );
    }

    const journalData = await readNativeJson<JournalContent>(
      archive,
      'journal.json',
      'journal metadata',
      manifest.encrypted,
      derivedKey,
      signal,
    );
    validateJournal(journalData);
    let settings: JournalSettings = { ...DEFAULT_JOURNAL_SETTINGS };
    if (archive.entries.some((entry) => entry.name === 'settings.json' && !entry.directory)) {
      settings = await readNativeJson<JournalSettings>(
        archive,
        'settings.json',
        'settings',
        manifest.encrypted,
        derivedKey,
        signal,
      );
      validateJournalSettings(settings);
    }

    const pageEntries = archive.entries.filter(
      (entry) => !entry.directory && /^pages\/.*\.json$/.test(entry.name),
    );
    const pages: Page[] = [];
    const total = pageEntries.length + attachmentEntries.length;
    let current = 0;
    for (const entry of pageEntries) {
      if (signal?.aborted) throw new Error('Backup import cancelled');
      const page = await readNativeJson<Page>(
        archive,
        entry.name,
        `page:${entry.name}`,
        manifest.encrypted,
        derivedKey,
        signal,
      );
      pages.push({ ...page, id: generateUUID() });
      onProgress?.({ current: ++current, total, phase: 'pages' });
    }

    // Preflight after page parsing but before opening local storage: this lets
    // the estimate include every duplicate owner of a shared attachment.
    const attachmentCopies = new Map(
      attachmentEntries.map((entry) => [
        entry.name,
        attachmentNameParts(entry.name)
          ? pageAttachmentOwners(pages, attachmentNameParts(entry.name)!.oldId).length
          : 0,
      ]),
    );
    const estimate = estimateNativeImportDiskUse(
      archive.entries,
      attachmentCopies,
      ATTACHMENT_CHUNK_SIZE,
    );
    if (
      !Number.isSafeInteger(estimate.requiredBytes) ||
      (await nativeArchiveAvailableBytes()) < estimate.requiredBytes
    ) {
      throw new Error('Insufficient device storage to import this backup');
    }

    store = await getLocalStore();
    newJournalId = generateUUID();
    await store.beginJournalImport?.(newJournalId);
    await store.updateJournalImport?.(newJournalId, 'writing');
    importStarted = true;

    const importedAttachments = new Map<string, Attachment>();
    const attachmentErrors: AttachmentError[] = [];
    const skippedAttachments: string[] = [];
    for (const entry of attachmentEntries) {
      if (signal?.aborted) throw new Error('Backup import cancelled');
      const parts = attachmentNameParts(entry.name);
      if (!parts) {
        skippedAttachments.push(entry.name.replace('attachments/', ''));
        continue;
      }
      const owners = pageAttachmentOwners(pages, parts.oldId);
      if (owners.length === 0) continue;

      const temp = new File(Paths.cache, `canto-import-${generateUUID()}`);
      let decryptedAttachment: string | undefined;
      let byteLength = entry.size;
      try {
        let source: File | undefined;
        if (manifest.encrypted) {
          if (!derivedKey) throw new Error('Encrypted backup requires a password');
          decryptedAttachment = await readEncryptedNativeEntry(
            archive,
            entry.name,
            derivedKey,
            signal,
          );
          byteLength = base64ByteLength(decryptedAttachment);
        } else {
          const extracted = await extractNativeArchiveEntry(archive, entry.name, temp.uri, signal);
          source = new File(extracted.uri);
          if (source.size !== entry.size)
            throw new Error(`Attachment extraction length mismatch: ${entry.name}`);
        }

        const thumbnailOwnerIds = new Set(
          owners
            .filter((owner) => {
              const page = pages.find((candidate) => candidate.id === owner.pageId);
              return (
                !page?.thumbnail && page?.images.find((image) => !image.deleted)?.id === parts.oldId
              );
            })
            .map((owner) => owner.pageId),
        );
        if (parts.type === 'image' && thumbnailOwnerIds.size > 0) {
          const thumbnail = await generateImportThumbnailFromChunks(
            decryptedAttachment === undefined
              ? nativeAttachmentChunks(source!)
              : base64AttachmentChunks(decryptedAttachment),
            byteLength,
            entry.name,
          );
          if (thumbnail) {
            for (const page of pages) {
              if (thumbnailOwnerIds.has(page.id) && !page.thumbnail) page.thumbnail = thumbnail;
            }
          }
        }
        for (const owner of owners) {
          const attachmentId = generateUUID();
          const attachment: Attachment = {
            id: attachmentId,
            path: '',
            name: owner.name || `imported-${attachmentId}.${parts.ext}`,
            type: parts.type,
            encrypted: owner.encrypted,
            size: byteLength,
            content: chunkedContentForByteLength(byteLength),
            deleted: false,
          };
          try {
            if (decryptedAttachment === undefined && !store.saveAttachmentStream) {
              throw new Error('Chunked attachment import is unavailable on this device');
            }
            const path =
              decryptedAttachment === undefined
                ? await store.saveAttachmentStream!(
                    newJournalId,
                    owner.pageId,
                    attachment,
                    nativeAttachmentChunks(source!),
                    owner.encrypted ? derivedKey : undefined,
                  )
                : await store.saveAttachment(
                    newJournalId,
                    owner.pageId,
                    attachment,
                    decryptedAttachment,
                    owner.encrypted ? derivedKey : undefined,
                  );
            importedAttachments.set(`${owner.pageId}:${entry.name.replace('attachments/', '')}`, {
              ...attachment,
              path,
            });
          } catch (error) {
            attachmentErrors.push({
              name: owner.name || entry.name,
              pageId: owner.pageId,
              error: error instanceof Error ? error.message : String(error),
            });
            importedAttachments.set(`${owner.pageId}:${entry.name.replace('attachments/', '')}`, {
              ...attachment,
              path: '',
            });
          }
        }
      } finally {
        if (temp.exists) temp.delete();
      }
      onProgress?.({ current: ++current, total, phase: 'attachments' });
    }

    const finalPages = pages.map((page) => ({
      ...page,
      images: page.images.map(
        (attachment) => importedAttachments.get(`${page.id}:${attachment.path}`) ?? attachment,
      ),
      files: page.files.map(
        (attachment) => importedAttachments.get(`${page.id}:${attachment.path}`) ?? attachment,
      ),
    }));
    const newJournal: JournalContent = {
      id: newJournalId,
      title,
      icon: journalData.icon,
      date: new Date().toISOString(),
      secure: Boolean(providedKey && journalData.secure),
      salt:
        (providedKey ||
          finalPages.some((page) => [...page.images, ...page.files].some((a) => a.encrypted))) &&
        journalData.salt
          ? journalData.salt
          : uint8ToBase64(generateSalt(16)),
      kdfIterations: journalData.kdfIterations ?? LEGACY_KDF_ITERATIONS,
      pages: finalPages,
      settings,
      schemaVersion: SCHEMA_VERSION,
      version: 1,
    };

    onProgress?.({ current: total, total, phase: 'finalizing' });
    const metadataKey = newJournal.secure ? derivedKey : undefined;
    await store.updateJournalImport?.(newJournalId, 'publishing', {
      expectedPageCount: finalPages.length,
    });
    await store.saveJournal(newJournal, metadataKey);
    await verifyImportedJournal(store, newJournal, metadataKey);
    await store.updateJournalImport?.(newJournalId, 'committed');
    await store.completeJournalImport?.(newJournalId);
    importStarted = false;

    return {
      journalId: newJournalId,
      title,
      attachmentErrors: attachmentErrors.length ? attachmentErrors : undefined,
      skippedAttachments: skippedAttachments.length ? skippedAttachments : undefined,
    };
  } catch (error) {
    if (newJournalId && importStarted) {
      try {
        await store?.abortJournalImport?.(newJournalId);
      } catch {
        // The durable marker remains for initialize() to recover on the next launch.
      }
    }
    throw error;
  } finally {
    await closeNativeArchive(archive);
  }
}
