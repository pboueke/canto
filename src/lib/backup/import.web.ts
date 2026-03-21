import JSZip from 'jszip';
import type { JournalContent, JournalSettings, Page, Attachment } from '@/data';
import { DEFAULT_JOURNAL_SETTINGS } from '@/data';
import { getLocalStore } from '@/hooks/useStorage';
import { aesGcmDecryptBytes, base64ToUint8, generateUUID } from '@/lib/encryption/utils';
import { deriveKey, LEGACY_KDF_ITERATIONS } from '@/lib/encryption/password';
import type { ExportManifest } from '@/data/format';
import { parseManifest } from '@/data/format';
import { validateJournal } from '@/data';
import { SCHEMA_VERSION } from '@/data/version';
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
  }

  const hasUserProvidedKey = !!providedKey;

  // --- Generate new IDs ---
  const newJournalId = generateUUID();
  const pageIdMap = new Map<string, string>();
  const pageAttachmentPaths = new Map<string, string>();
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
    let data: string;
    if (isEncrypted && derivedKey) {
      try {
        data = await aesGcmDecryptBytes(await af.async('uint8array'), derivedKey);
      } catch (err) {
        console.error(`[Canto] Failed to decrypt attachment ${zipFilename}:`, err);
        throw err;
      }
    } else {
      data = await af.async('base64');
    }

    const match = zipFilename.match(/^(image|file)-([^.]+)\.(.+)$/);
    if (!match) {
      skippedAttachments.push(zipFilename);
      continue;
    }

    const [, type, oldAttId, ext] = match;

    const owners: { pageId: string; name: string; encrypted: boolean }[] = [];
    for (const page of pages) {
      const allAtts = [...page.images, ...page.files];
      const found = allAtts.find((a) => a.id === oldAttId);
      if (found) {
        owners.push({ pageId: page.id, name: found.name, encrypted: found.encrypted });
      }
    }

    if (owners.length === 0) continue;

    for (const owner of owners) {
      const canReEncrypt = owner.encrypted && !!derivedKey;
      const newAttId = generateUUID();

      const attachment: Attachment = {
        id: newAttId,
        path: '',
        name: owner.name ?? `imported-${newAttId}.${ext}`,
        type: type as 'image' | 'file',
        encrypted: owner.encrypted,
        deleted: false,
      };

      try {
        const savedPath = await store.saveAttachment(
          newJournalId,
          owner.pageId,
          attachment,
          data,
          canReEncrypt ? derivedKey : undefined,
        );

        pageAttachmentPaths.set(`${owner.pageId}:${zipFilename}`, savedPath);
      } catch (err) {
        attachmentErrors.push({
          name: owner.name ?? zipFilename,
          pageId: owner.pageId,
          error: err instanceof Error ? err.message : String(err),
        });
        pageAttachmentPaths.set(`${owner.pageId}:${zipFilename}`, '');
      }
    }

    current++;
    onProgress?.({ current, total: totalItems, phase: 'attachments' });
  }

  // --- Update attachment references ---
  const finalPages = pages.map((page) => ({
    ...page,
    images: page.images.map((att) => {
      const newPath = pageAttachmentPaths.get(`${page.id}:${att.path}`);
      return { ...att, path: newPath ?? att.path };
    }),
    files: page.files.map((att) => {
      const newPath = pageAttachmentPaths.get(`${page.id}:${att.path}`);
      return { ...att, path: newPath ?? att.path };
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
    ...(preserveSalt && journalData.salt ? { salt: journalData.salt } : {}),
    ...(preserveSalt ? { kdfIterations: journalData.kdfIterations ?? LEGACY_KDF_ITERATIONS } : {}),
    pages: finalPages,
    settings,
    schemaVersion: SCHEMA_VERSION,
    version: 1,
  };

  const metadataKey = preservePassword ? derivedKey : undefined;
  await store.saveJournal(newJournal, metadataKey);

  for (const page of finalPages) {
    await store.savePage(newJournalId, page, metadataKey);
  }

  return {
    journalId: newJournalId,
    title,
    attachmentErrors: attachmentErrors.length > 0 ? attachmentErrors : undefined,
    skippedAttachments: skippedAttachments.length > 0 ? skippedAttachments : undefined,
  };
}

export { hasNameConflict, resolveNameConflict } from './conflicts';
