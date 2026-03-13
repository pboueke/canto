import JSZip from 'jszip';
import { File } from 'expo-file-system';
import type { JournalContent, JournalSettings, Page, Attachment } from '@/models';
import { DEFAULT_JOURNAL_SETTINGS } from '@/models';
import { getLocalStore } from '@/hooks/useStorage';
import { aesGcmDecrypt } from '@/lib/encryption/utils';
import { deriveKey, LEGACY_KDF_ITERATIONS } from '@/lib/encryption/password';
import type { ExportManifest } from './export';

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function generateUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface ImportResult {
  journalId: string;
  title: string;
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

  const manifest = JSON.parse(await manifestFile.async('string')) as ExportManifest;
  if (manifest.version !== 1) {
    throw new Error(`Unsupported backup version: ${manifest.version}`);
  }

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
  const manifest = JSON.parse(await manifestFile.async('string')) as ExportManifest;

  const isEncrypted = manifest.encrypted;

  // Auto-derive key with empty password when the journal has a salt but no key
  // was provided. This handles journals whose password was removed — they still
  // have encrypted attachments that need to be re-encrypted on import.
  if (!derivedKey && !isEncrypted && manifest.salt) {
    const saltBytes = base64ToUint8(manifest.salt);
    const iterations = manifest.kdfIterations ?? LEGACY_KDF_ITERATIONS;
    derivedKey = await deriveKey('', saltBytes, iterations);
  }

  function decryptContent(content: string): string {
    if (isEncrypted && derivedKey) {
      return aesGcmDecrypt(content, derivedKey);
    }
    return content;
  }

  // --- Read journal metadata ---
  const journalFile = zip.file('journal.json');
  if (!journalFile) throw new Error('Invalid backup: missing journal.json');
  const journalData = JSON.parse(
    decryptContent(await journalFile.async('string')),
  ) as JournalContent;

  // --- Read settings ---
  let settings: JournalSettings = { ...DEFAULT_JOURNAL_SETTINGS };
  const settingsFile = zip.file('settings.json');
  if (settingsFile) {
    settings = JSON.parse(decryptContent(await settingsFile.async('string')));
  }

  // --- Generate new IDs ---
  const newJournalId = generateUUID();
  const pageIdMap = new Map<string, string>(); // oldId -> newId
  const attachmentPathMap = new Map<string, string>(); // old zip filename -> new disk path

  // --- Read pages ---
  const pageFiles = zip.file(/^pages\/.*\.json$/);
  const pages: Page[] = [];

  const totalItems = pageFiles.length + Object.keys(zip.file(/^attachments\//) ?? {}).length;
  let current = 0;

  for (const pf of pageFiles) {
    const pageData = JSON.parse(decryptContent(await pf.async('string'))) as Page;
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
    // Encrypted backups store attachments as ciphertext strings;
    // unencrypted backups store raw binary (read as base64 for the store).
    let data: string;
    if (isEncrypted && derivedKey) {
      data = aesGcmDecrypt(await af.async('string'), derivedKey);
    } else {
      data = await af.async('base64');
    }

    // Parse the zip filename to reconstruct attachment info
    // Format: {type}-{id}.{ext}
    const match = zipFilename.match(/^(image|file)-([a-f0-9-]+)\.(.+)$/);
    if (!match) continue;

    const [, type, oldAttId, ext] = match;
    const newAttId = generateUUID();

    // Find which page references this attachment and get the new page ID
    let ownerNewPageId: string | undefined;
    let originalName: string | undefined;
    let wasEncrypted = false;
    for (const page of pages) {
      const allAtts = [...page.images, ...page.files];
      const found = allAtts.find((a) => a.id === oldAttId);
      if (found) {
        ownerNewPageId = page.id;
        originalName = found.name;
        wasEncrypted = found.encrypted;
        break;
      }
    }

    if (!ownerNewPageId) continue;

    // Preserve password encryption if the original was encrypted and we have the key
    const reEncrypt = wasEncrypted && !!derivedKey;

    // Save through the store (which handles device encryption)
    const attachment: Attachment = {
      id: newAttId,
      path: '', // Will be set by saveAttachment
      name: originalName ?? `imported-${newAttId}.${ext}`,
      type: type as 'image' | 'file',
      encrypted: reEncrypt,
      deleted: false,
    };

    const savedPath = await store.saveAttachment(
      newJournalId,
      ownerNewPageId,
      attachment,
      data,
      reEncrypt ? derivedKey : undefined,
    );

    attachmentPathMap.set(zipFilename, savedPath);

    current++;
    onProgress?.({ current, total: totalItems, phase: 'attachments' });
  }

  // --- Update attachment references in pages ---
  const finalPages = pages.map((page) => ({
    ...page,
    images: page.images.map((att) => {
      const newPath = attachmentPathMap.get(att.path);
      return {
        ...att,
        path: newPath ?? att.path,
        // Preserve password-encryption flag only when we have the key
        encrypted: att.encrypted && !!derivedKey,
      };
    }),
    files: page.files.map((att) => {
      const newPath = attachmentPathMap.get(att.path);
      return {
        ...att,
        path: newPath ?? att.path,
        encrypted: att.encrypted && !!derivedKey,
      };
    }),
  }));

  // --- Build and save the new journal ---
  // Preserve password protection when the user provided the key
  const preservePassword = !!derivedKey && (journalData.secure || isEncrypted);
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
  };
}

export { hasNameConflict, resolveNameConflict } from './conflicts';
