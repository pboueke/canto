import JSZip from 'jszip';
import { File } from 'expo-file-system';
import { base64ByteLength, chunkedContentForByteLength } from '@/lib/storage/attachment-content';
import {
  assertEncryptedAttachmentCanBeRead,
  zipAttachmentByteLength,
  zipAttachmentChunks,
} from '@/lib/backup/zip-attachment-stream';
import { generateImportThumbnail } from '@/lib/backup/import-thumbnail';
import type { JournalContent, JournalSettings, Page, Attachment } from 'canto-data';
import { DEFAULT_JOURNAL_SETTINGS } from 'canto-data';
import { getLocalStore } from '@/hooks/useStorage';
import {
  aesGcmDecryptBytes,
  base64ToUint8,
  generateUUID,
  generateSalt,
  uint8ToBase64,
} from '@/lib/encryption/utils';
import { deriveKey, LEGACY_KDF_ITERATIONS } from '@/lib/encryption/password';
import { parseManifest } from 'canto-data/format';
import { validateJournal, validateJournalSettings } from 'canto-data';
import { SCHEMA_VERSION } from 'canto-data/version';
import { safeJsonParse } from '@/lib/utils/json';
import {
  closeNativeArchive,
  openNativeArchive,
  readNativeArchiveText,
  supportsNativeArchive,
} from './native-archive';
import { importNativeJournal } from './native-importer';
import { verifyImportedJournal } from './import-verification';
import type { AttachmentError, ImportInfo, ImportProgress, ImportResult } from './import-types';

export type { AttachmentError, ImportInfo, ImportProgress, ImportResult } from './import-types';

function throwIfImportAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Backup import cancelled');
}

/**
 * Read a .canto.zip file and extract the manifest to determine if a password is needed.
 */
export async function inspectBackup(zipUri: string): Promise<ImportInfo> {
  if (supportsNativeArchive()) {
    const archive = await openNativeArchive(zipUri);
    try {
      const manifest = parseManifest(await readNativeArchiveText(archive, 'manifest.json'));
      return {
        manifest,
        needsPassword: manifest.encrypted,
        canProvidePassword: !manifest.encrypted && !!manifest.salt,
        sourceFingerprint: archive.sourceFingerprint,
      };
    } finally {
      await closeNativeArchive(archive);
    }
  }
  const file = new File(zipUri);
  const raw = await file.bytes();
  const zip = await JSZip.loadAsync(raw);

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid backup: missing manifest.json');
  }

  const manifest = parseManifest(await manifestFile.async('string'));

  return {
    manifest,
    // Required: ZIP is encrypted — can't read without password
    needsPassword: manifest.encrypted,
    // Optional: unencrypted ZIP but journal had a password — can re-encrypt attachments
    canProvidePassword: !manifest.encrypted && !!manifest.salt,
  };
}

/**
 * Import a journal from a .canto.zip file.
 *
 * Always creates a new journal with new UUIDs (safe to re-import multiple times).
 *
 * @param zipUri File URI of the .canto.zip
 * @param title The journal title to use (may differ from original if renamed due to conflict)
 * @param derivedKey Password-derived key if the backup is encrypted
 * @param onProgress Progress callback
 */
export async function importJournal(
  zipUri: string,
  title: string,
  providedKey?: Uint8Array,
  onProgress?: (progress: ImportProgress) => void,
  signal?: AbortSignal,
  expectedSourceFingerprint?: string,
): Promise<ImportResult> {
  if (supportsNativeArchive()) {
    return importNativeJournal(
      zipUri,
      title,
      providedKey,
      onProgress,
      signal,
      expectedSourceFingerprint,
    );
  }
  throwIfImportAborted(signal);
  onProgress?.({ current: 0, total: 0, phase: 'preparing' });
  let derivedKey = providedKey;
  const store = await getLocalStore();

  const file = new File(zipUri);
  const raw = await file.bytes();
  const zip = await JSZip.loadAsync(raw);

  // --- Read manifest ---
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Invalid backup: missing manifest.json');
  const manifest = parseManifest(await manifestFile.async('string'));

  const isEncrypted = manifest.encrypted;

  // Auto-derive key with empty password when the journal has a salt but no key
  // was provided. This handles journals whose password was removed — they still
  // have encrypted attachments that need to be re-encrypted on import.
  if (!derivedKey && !isEncrypted && manifest.salt) {
    const saltBytes = base64ToUint8(manifest.salt);
    const iterations = manifest.kdfIterations ?? LEGACY_KDF_ITERATIONS;
    derivedKey = await deriveKey('', saltBytes, iterations);
  }

  // Read a ZIP entry, decrypting if this is an encrypted backup.
  // Encrypted entries are stored as raw binary (Uint8Array); plaintext as UTF-8 strings.
  async function readEntry(entry: JSZip.JSZipObject, label: string): Promise<string> {
    if (isEncrypted && derivedKey) {
      try {
        return await aesGcmDecryptBytes(await entry.async('uint8array'), derivedKey);
      } catch (err) {
        console.error(`[Canto] Failed to decrypt ${label} (${entry.name}):`, err);
        throw err;
      }
    }
    return entry.async('string');
  }

  // --- Read journal metadata ---
  const journalFile = zip.file('journal.json');
  if (!journalFile) throw new Error('Invalid backup: missing journal.json');
  const journalRaw = safeJsonParse<JournalContent>(
    await readEntry(journalFile, 'journal metadata'),
    'journal metadata',
  );
  validateJournal(journalRaw);
  const journalData = journalRaw;

  // --- Read settings ---
  let settings: JournalSettings = { ...DEFAULT_JOURNAL_SETTINGS };
  const settingsFile = zip.file('settings.json');
  if (settingsFile) {
    settings = safeJsonParse<JournalSettings>(
      await readEntry(settingsFile, 'settings'),
      'settings',
    );
    validateJournalSettings(settings);
  }

  // Track whether the key was explicitly provided vs auto-derived.
  // Auto-derived keys (empty password) should NOT mark the journal as secure.
  const hasUserProvidedKey = !!providedKey;

  // --- Generate new IDs ---
  const newJournalId = generateUUID();
  await store.beginJournalImport?.(newJournalId);
  await store.updateJournalImport?.(newJournalId, 'writing');
  try {
    const pageIdMap = new Map<string, string>(); // oldId -> newId
    // Per-page attachment path map: "pageId:zipFilename" -> new disk path
    // This ensures shared attachments get their own copy under each page's directory.
    const importedAttachments = new Map<string, Attachment>();
    const attachmentErrors: AttachmentError[] = [];
    const skippedAttachments: string[] = [];

    // --- Read pages ---
    const pageFiles = zip.file(/^pages\/.*\.json$/);
    const pages: Page[] = [];

    const totalItems = pageFiles.length + Object.keys(zip.file(/^attachments\//) ?? {}).length;
    let current = 0;

    for (const pf of pageFiles) {
      throwIfImportAborted(signal);
      const pageData = safeJsonParse<Page>(
        await readEntry(pf, `page ${pf.name}`),
        `page:${pf.name}`,
      );
      const newPageId = generateUUID();
      pageIdMap.set(pageData.id, newPageId);

      pages.push({
        ...pageData,
        id: newPageId,
      });

      current++;
      onProgress?.({ current, total: totalItems, phase: 'pages' });
    }

    // --- Import attachments and build path map ---
    const attachmentFiles = zip.file(/^attachments\//);
    for (const af of attachmentFiles) {
      throwIfImportAborted(signal);
      const zipFilename = af.name.replace('attachments/', '');
      // Parse the zip filename to reconstruct attachment info.
      const match = zipFilename.match(/^(image|file)-([^.]+)\.(.+)$/);
      if (!match) {
        skippedAttachments.push(zipFilename);
        continue;
      }
      const [, type, oldAttId, ext] = match;

      // Find ALL pages that reference this attachment (not just the first).
      const owners: { pageId: string; name: string; encrypted: boolean }[] = [];
      for (const page of pages) {
        const found = [...page.images, ...page.files].find((a) => a.id === oldAttId);
        if (found) owners.push({ pageId: page.id, name: found.name, encrypted: found.encrypted });
      }
      if (owners.length === 0) continue;

      // The v1 encrypted archive format is one AES-GCM value around the entire
      // base64 attachment. Its central-directory size lets us reject unsafe
      // values before JSZip's async() decrypt path materializes them.
      let encryptedData: string | undefined;
      let byteLength: number;
      if (isEncrypted) {
        if (!derivedKey) throw new Error('Encrypted backup requires a password');
        // Preserve the established encrypted-backup failure behavior: a wrong
        // password or corrupt attachment aborts the import rather than silently
        // creating a partially decrypted journal.
        assertEncryptedAttachmentCanBeRead(af);
        try {
          encryptedData = await aesGcmDecryptBytes(await af.async('uint8array'), derivedKey);
        } catch (err) {
          console.error(`[Canto] Failed to decrypt attachment ${zipFilename}:`, err);
          throw err;
        }
        byteLength = base64ByteLength(encryptedData);
      } else {
        byteLength = zipAttachmentByteLength(af);
      }

      // Save a separate immutable generation for each owner. A descriptor is
      // only attached to page metadata after the stream has fully committed.
      for (const owner of owners) {
        const newAttId = generateUUID();
        const attachment: Attachment = {
          id: newAttId,
          path: '',
          name: owner.name ?? `imported-${newAttId}.${ext}`,
          type: type as 'image' | 'file',
          encrypted: owner.encrypted,
          size: byteLength,
          content: chunkedContentForByteLength(byteLength),
          deleted: false,
        };
        try {
          const saveAttachmentStream = store.saveAttachmentStream;
          if (encryptedData === undefined && !saveAttachmentStream) {
            throw new Error('Chunked attachment import is unavailable on this device');
          }
          const savedPath =
            encryptedData !== undefined
              ? await store.saveAttachment(
                  newJournalId,
                  owner.pageId,
                  attachment,
                  encryptedData,
                  owner.encrypted && derivedKey ? derivedKey : undefined,
                )
              : await saveAttachmentStream!(
                  newJournalId,
                  owner.pageId,
                  attachment,
                  zipAttachmentChunks(af, byteLength),
                  owner.encrypted && derivedKey ? derivedKey : undefined,
                );
          importedAttachments.set(`${owner.pageId}:${zipFilename}`, {
            ...attachment,
            path: savedPath,
          });
        } catch (err) {
          attachmentErrors.push({
            name: owner.name ?? zipFilename,
            pageId: owner.pageId,
            error: err instanceof Error ? err.message : String(err),
          });
          importedAttachments.set(`${owner.pageId}:${zipFilename}`, { ...attachment, path: '' });
        }
      }

      // Persist a small inline preview while the source entry is available. This
      // is serial with attachment import and never reads/reassembles local chunks.
      // A preview belongs only to a page's first visible image. ZIP entry order
      // is unrelated to image order, so never let a later image claim its page's
      // thumbnail merely because it appeared first in the archive.
      const thumbnailOwnerIds = new Set(
        owners
          .filter((owner) => {
            const page = pages.find((candidate) => candidate.id === owner.pageId);
            return (
              !page?.thumbnail && page?.images.find((image) => !image.deleted)?.id === oldAttId
            );
          })
          .map((owner) => owner.pageId),
      );
      if (type === 'image' && thumbnailOwnerIds.size > 0) {
        const thumbnail = await generateImportThumbnail(af, byteLength, encryptedData);
        if (thumbnail) {
          for (const page of pages) {
            if (thumbnailOwnerIds.has(page.id) && !page.thumbnail) page.thumbnail = thumbnail;
          }
        }
      }

      current++;
      onProgress?.({ current, total: totalItems, phase: 'attachments' });
    }

    // --- Update attachment references in pages ---
    const finalPages = pages.map((page) => ({
      ...page,
      images: page.images.map((att) => {
        return importedAttachments.get(`${page.id}:${att.path}`) ?? att;
      }),
      files: page.files.map((att) => {
        return importedAttachments.get(`${page.id}:${att.path}`) ?? att;
      }),
    }));

    // --- Build and save the new journal ---
    // Preserve password protection only when the user explicitly provided a key.
    // Auto-derived keys (empty password) should NOT mark the journal as secure —
    // otherwise the user would be prompted for a password they never set.
    const preservePassword = hasUserProvidedKey && (journalData.secure || isEncrypted);
    // Preserve salt/kdfIterations when there are encrypted attachments (needed for auto-derive)
    const hasEncryptedAttachments = finalPages.some((p) =>
      [...p.images, ...p.files].some((a) => a.encrypted),
    );
    const preserveSalt = preservePassword || hasEncryptedAttachments;
    const newJournal: JournalContent = {
      id: newJournalId,
      title,
      icon: journalData.icon,
      date: new Date().toISOString(),
      secure: preservePassword,
      salt: preserveSalt && journalData.salt ? journalData.salt : uint8ToBase64(generateSalt(16)),
      ...(preserveSalt
        ? { kdfIterations: journalData.kdfIterations ?? LEGACY_KDF_ITERATIONS }
        : {}),
      pages: finalPages,
      settings,
      schemaVersion: SCHEMA_VERSION,
      version: 1,
    };

    // saveJournal persists pages, so writing them again would both duplicate I/O and
    // overwrite their imported modification timestamps. Verify the persisted record
    // before reporting success; any failed write or readback is rolled back below.
    // Only pass derivedKey for password-protected journals (secure: true).
    // Non-secure journals with encrypted attachments use auto-derive on read,
    // but metadata/pages must be device-encrypted only to avoid a chicken-and-egg
    // problem (auto-derive needs the journal to be loaded first).
    onProgress?.({ current: totalItems, total: totalItems, phase: 'finalizing' });
    const metadataKey = preservePassword ? derivedKey : undefined;
    try {
      await store.updateJournalImport?.(newJournalId, 'publishing', {
        expectedPageCount: finalPages.length,
      });
      await store.saveJournal(newJournal, metadataKey);

      await verifyImportedJournal(store, newJournal, metadataKey);
      await store.updateJournalImport?.(newJournalId, 'committed');
      await store.completeJournalImport?.(newJournalId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      error.message = `Imported journal failed storage verification: ${error.message}`;
      throw error;
    }

    return {
      journalId: newJournalId,
      title,
      attachmentErrors: attachmentErrors.length > 0 ? attachmentErrors : undefined,
      skippedAttachments: skippedAttachments.length > 0 ? skippedAttachments : undefined,
    };
  } catch (err) {
    try {
      await store.abortJournalImport?.(newJournalId);
    } catch {
      // Startup recovery owns any marker that could not be cleaned up now.
    }
    throw err;
  }
}

export { hasNameConflict, resolveNameConflict } from './conflicts';
