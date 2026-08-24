import JSZip from 'jszip';
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
import type { ExportManifest } from 'canto-data/format';
import { parseManifest } from 'canto-data/format';
import { validateJournal, validateJournalSettings } from 'canto-data';
import { SCHEMA_VERSION } from 'canto-data/version';
import { safeJsonParse } from '@/lib/utils/json';

export interface AttachmentError {
  name: string;
  pageId: string;
  error: string;
}

export interface ImportResult {
  journalId: string;
  title: string;
  attachmentErrors?: AttachmentError[];
  skippedAttachments?: string[];
}

export interface ImportInfo {
  manifest: ExportManifest;
  needsPassword: boolean;
  canProvidePassword: boolean;
}

/**
 * Read a .canto.zip file and extract the manifest — web version.
 * On web, zipUri is a blob/object URL from DocumentPicker.
 */
export async function inspectBackup(zipUri: string): Promise<ImportInfo> {
  const response = await fetch(zipUri);
  const arrayBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid backup: missing manifest.json');
  }

  const manifest = parseManifest(await manifestFile.async('string'));

  return {
    manifest,
    needsPassword: manifest.encrypted,
    canProvidePassword: !manifest.encrypted && !!manifest.salt,
  };
}

export interface ImportProgress {
  current: number;
  total: number;
  phase: 'pages' | 'attachments';
}

/**
 * Import a journal from a .canto.zip file — web version.
 * On web, zipUri is a blob/object URL from DocumentPicker.
 */
export async function importJournal(
  zipUri: string,
  title: string,
  providedKey?: Uint8Array,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  let derivedKey = providedKey;
  const store = await getLocalStore();

  const response = await fetch(zipUri);
  const arrayBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // --- Read manifest ---
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Invalid backup: missing manifest.json');
  const manifest = parseManifest(await manifestFile.async('string'));

  const isEncrypted = manifest.encrypted;

  if (!derivedKey && !isEncrypted && manifest.salt) {
    const saltBytes = base64ToUint8(manifest.salt);
    const iterations = manifest.kdfIterations ?? LEGACY_KDF_ITERATIONS;
    derivedKey = await deriveKey('', saltBytes, iterations);
  }

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

  const hasUserProvidedKey = !!providedKey;

  // --- Generate new IDs ---
  const newJournalId = generateUUID();
  const pageIdMap = new Map<string, string>();
  const importedAttachments = new Map<string, Attachment>();
  const attachmentErrors: AttachmentError[] = [];
  const skippedAttachments: string[] = [];

  // --- Read pages ---
  const pageFiles = zip.file(/^pages\/.*\.json$/);
  const pages: Page[] = [];

  const totalItems = pageFiles.length + Object.keys(zip.file(/^attachments\//) ?? {}).length;
  let current = 0;

  for (const pf of pageFiles) {
    const pageData = safeJsonParse<Page>(await readEntry(pf, `page ${pf.name}`), `page:${pf.name}`);
    const newPageId = generateUUID();
    pageIdMap.set(pageData.id, newPageId);
    pages.push({ ...pageData, id: newPageId });
    current++;
    onProgress?.({ current, total: totalItems, phase: 'pages' });
  }

  // --- Import attachments ---
  const attachmentFiles = zip.file(/^attachments\//);
  for (const af of attachmentFiles) {
    const zipFilename = af.name.replace('attachments/', '');
    const match = zipFilename.match(/^(image|file)-([^.]+)\.(.+)$/);
    if (!match) {
      skippedAttachments.push(zipFilename);
      continue;
    }
    const [, type, oldAttId, ext] = match;

    const owners: { pageId: string; name: string; encrypted: boolean }[] = [];
    for (const page of pages) {
      const found = [...page.images, ...page.files].find((a) => a.id === oldAttId);
      if (found) owners.push({ pageId: page.id, name: found.name, encrypted: found.encrypted });
    }
    if (owners.length === 0) continue;

    let encryptedData: string | undefined;
    let byteLength: number;
    if (isEncrypted) {
      if (!derivedKey) throw new Error('Encrypted backup requires a password');
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

    // The ZIP stream is reopened for each owner, so shared attachments never
    // require an in-memory fan-out. Page metadata is updated only after the
    // destination generation has its manifest.
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
          return !page?.thumbnail && page?.images.find((image) => !image.deleted)?.id === oldAttId;
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

  // --- Update attachment references ---
  const finalPages = pages.map((page) => ({
    ...page,
    images: page.images.map((att) => {
      return importedAttachments.get(`${page.id}:${att.path}`) ?? att;
    }),
    files: page.files.map((att) => {
      return importedAttachments.get(`${page.id}:${att.path}`) ?? att;
    }),
  }));

  // --- Save journal ---
  const preservePassword = hasUserProvidedKey && (journalData.secure || isEncrypted);
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
    ...(preserveSalt ? { kdfIterations: journalData.kdfIterations ?? LEGACY_KDF_ITERATIONS } : {}),
    pages: finalPages,
    settings,
    schemaVersion: SCHEMA_VERSION,
    version: 1,
  };

  // saveJournal persists pages, so writing them again would both duplicate I/O and
  // overwrite their imported modification timestamps. Verify the persisted record
  // before reporting success; any failed write or readback is rolled back below.
  const metadataKey = preservePassword ? derivedKey : undefined;
  try {
    await store.saveJournal(newJournal, metadataKey);

    const persistedJournal = await store.getJournal(newJournalId, metadataKey);
    const isValid =
      persistedJournal !== null &&
      persistedJournal.id === newJournal.id &&
      persistedJournal.title === newJournal.title &&
      JSON.stringify(persistedJournal.settings) === JSON.stringify(newJournal.settings) &&
      persistedJournal.pages.length === newJournal.pages.length;
    if (!isValid) {
      throw new Error('saved journal did not match the imported journal');
    }
  } catch (err) {
    try {
      await store.deleteJournal(newJournalId);
    } catch (cleanupErr) {
      console.warn(`[Canto] Failed to clean up imported journal ${newJournalId}:`, cleanupErr);
    }

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
}

export { hasNameConflict, resolveNameConflict } from './conflicts';
