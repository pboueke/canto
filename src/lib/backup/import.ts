import JSZip from 'jszip';
import { File } from 'expo-file-system';
import type { JournalContent, JournalSettings, Page, Attachment } from '@/data';
import { DEFAULT_JOURNAL_SETTINGS } from '@/data';
import { getLocalStore } from '@/hooks/useStorage';
import { aesGcmDecryptBytes, base64ToUint8, generateUUID } from '@/lib/encryption/utils';
import { deriveKey, LEGACY_KDF_ITERATIONS } from '@/lib/encryption/password';
import type { ExportManifest } from '@/data/format';
import { parseManifest } from '@/data/format';
import { SCHEMA_VERSION } from '@/data/version';

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
  /** Password is required (encrypted ZIP — can't read without it) */
  needsPassword: boolean;
  /** Password is optional (unencrypted ZIP but journal had a password — needed to re-encrypt attachments) */
  canProvidePassword: boolean;
}

/**
 * Read a .canto.zip file and extract the manifest to determine if a password is needed.
 */
export async function inspectBackup(zipUri: string): Promise<ImportInfo> {
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

export interface ImportProgress {
  current: number;
  total: number;
  phase: 'pages' | 'attachments';
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
): Promise<ImportResult> {
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
  const journalData = JSON.parse(
    await readEntry(journalFile, 'journal metadata'),
  ) as JournalContent;

  // --- Read settings ---
  let settings: JournalSettings = { ...DEFAULT_JOURNAL_SETTINGS };
  const settingsFile = zip.file('settings.json');
  if (settingsFile) {
    settings = JSON.parse(await readEntry(settingsFile, 'settings'));
  }

  // Track whether the key was explicitly provided vs auto-derived.
  // Auto-derived keys (empty password) should NOT mark the journal as secure.
  const hasUserProvidedKey = !!providedKey;

  // --- Generate new IDs ---
  const newJournalId = generateUUID();
  const pageIdMap = new Map<string, string>(); // oldId -> newId
  // Per-page attachment path map: "pageId:zipFilename" -> new disk path
  // This ensures shared attachments get their own copy under each page's directory.
  const pageAttachmentPaths = new Map<string, string>();
  const attachmentErrors: AttachmentError[] = [];
  const skippedAttachments: string[] = [];

  // --- Read pages ---
  const pageFiles = zip.file(/^pages\/.*\.json$/);
  const pages: Page[] = [];

  const totalItems = pageFiles.length + Object.keys(zip.file(/^attachments\//) ?? {}).length;
  let current = 0;

  for (const pf of pageFiles) {
    const pageData = JSON.parse(await readEntry(pf, `page ${pf.name}`)) as Page;
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
    const zipFilename = af.name.replace('attachments/', '');
    // Encrypted backups store attachments as raw encrypted bytes;
    // unencrypted backups store raw binary (read as base64 for the store).
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

    // Parse the zip filename to reconstruct attachment info
    // Format: {type}-{id}.{ext}
    const match = zipFilename.match(/^(image|file)-([^.]+)\.(.+)$/);
    if (!match) {
      skippedAttachments.push(zipFilename);
      continue;
    }

    const [, type, oldAttId, ext] = match;

    // Find ALL pages that reference this attachment (not just the first).
    // Shared attachments need a separate copy under each page's directory so
    // deleting one page doesn't orphan the other's attachment.
    const owners: { pageId: string; name: string; encrypted: boolean }[] = [];
    for (const page of pages) {
      const allAtts = [...page.images, ...page.files];
      const found = allAtts.find((a) => a.id === oldAttId);
      if (found) {
        owners.push({ pageId: page.id, name: found.name, encrypted: found.encrypted });
      }
    }

    if (owners.length === 0) continue;

    // Save a copy for each owning page
    for (const owner of owners) {
      const reEncrypt = owner.encrypted && !!derivedKey;
      const newAttId = generateUUID();

      const attachment: Attachment = {
        id: newAttId,
        path: '', // Will be set by saveAttachment
        name: owner.name ?? `imported-${newAttId}.${ext}`,
        type: type as 'image' | 'file',
        encrypted: reEncrypt,
        deleted: false,
      };

      try {
        const savedPath = await store.saveAttachment(
          newJournalId,
          owner.pageId,
          attachment,
          data,
          reEncrypt ? derivedKey : undefined,
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

  // --- Update attachment references in pages ---
  const finalPages = pages.map((page) => ({
    ...page,
    images: page.images.map((att) => {
      const newPath = pageAttachmentPaths.get(`${page.id}:${att.path}`);
      return {
        ...att,
        path: newPath ?? att.path,
        // Preserve password-encryption flag only when we have the key
        encrypted: att.encrypted && !!derivedKey,
      };
    }),
    files: page.files.map((att) => {
      const newPath = pageAttachmentPaths.get(`${page.id}:${att.path}`);
      return {
        ...att,
        path: newPath ?? att.path,
        encrypted: att.encrypted && !!derivedKey,
      };
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
    ...(preserveSalt && journalData.salt ? { salt: journalData.salt } : {}),
    ...(preserveSalt ? { kdfIterations: journalData.kdfIterations ?? LEGACY_KDF_ITERATIONS } : {}),
    pages: finalPages,
    settings,
    schemaVersion: SCHEMA_VERSION,
    version: 1,
  };

  // Save the journal (pages are saved as part of saveJournal)
  // Only pass derivedKey for password-protected journals (secure: true).
  // Non-secure journals with encrypted attachments use auto-derive on read,
  // but metadata/pages must be device-encrypted only to avoid a chicken-and-egg
  // problem (auto-derive needs the journal to be loaded first).
  const metadataKey = preservePassword ? derivedKey : undefined;
  await store.saveJournal(newJournal, metadataKey);

  // Also save each page individually to ensure they're on disk
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
