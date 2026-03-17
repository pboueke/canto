import JSZip from 'jszip';
import { Paths, File, Directory } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { JournalContent, Page } from '@/models';
import { getLocalStore } from '@/hooks/useStorage';
import { aesGcmEncryptBytes } from '@/lib/encryption/utils';

export interface ExportManifest {
  version: 1;
  appVersion: string;
  exportDate: string;
  encrypted: boolean;
  salt?: string;
  kdfIterations?: number;
  journalTitle: string;
}

interface AttachmentEntry {
  /** Index into the flat attachments/ folder inside the ZIP */
  zipFilename: string;
  /** Original on-disk filename (for reading) */
  diskPath: string;
  /** Whether the on-disk file is password-encrypted */
  isPasswordEncrypted: boolean;
}

function collectAttachments(pages: Page[]): AttachmentEntry[] {
  const seen = new Set<string>();
  const entries: AttachmentEntry[] = [];

  for (const page of pages) {
    const allAttachments = [...page.images, ...page.files].filter((a) => !a.deleted);
    for (const att of allAttachments) {
      if (!att.path || seen.has(att.path)) continue;
      seen.add(att.path);

      // Build a portable filename: {type}-{id}.{ext}
      const ext = att.name.split('.').pop() ?? 'bin';
      const zipFilename = `${att.type}-${att.id}.${ext}`;

      entries.push({
        zipFilename,
        diskPath: att.path,
        isPasswordEncrypted: att.encrypted,
      });
    }
  }
  return entries;
}

/**
 * Rewrite attachment paths in pages to use portable ZIP filenames.
 * Returns cloned pages with updated paths.
 */
function rewriteAttachmentPaths(pages: Page[], pathMap: Map<string, string>): Page[] {
  return pages.map((page) => ({
    ...page,
    images: page.images.map((a) => ({
      ...a,
      path: pathMap.get(a.path) ?? a.path,
    })),
    files: page.files.map((a) => ({
      ...a,
      path: pathMap.get(a.path) ?? a.path,
    })),
  }));
}

export interface ExportProgress {
  current: number;
  total: number;
  phase: 'pages' | 'attachments' | 'zipping';
}

/**
 * Export a journal as a .canto.zip file and open the share sheet.
 *
 * @param journal  Full journal content (already decrypted in memory)
 * @param encrypted Whether to encrypt the export with the journal's password key
 * @param derivedKey The password-derived key (required if encrypted=true)
 * @param onProgress Progress callback
 */
export async function exportJournal(
  journal: JournalContent,
  encrypted: boolean,
  derivedKey?: Uint8Array,
  onProgress?: (progress: ExportProgress) => void,
): Promise<void> {
  const store = await getLocalStore();
  const zip = new JSZip();

  const activePages = journal.pages.filter((p) => !p.deleted);
  const attachmentEntries = collectAttachments(activePages);

  const total = activePages.length + attachmentEntries.length;
  let current = 0;

  // --- Manifest (always plaintext) ---
  const manifest: ExportManifest = {
    version: 1,
    appVersion: '0.9.0',
    exportDate: new Date().toISOString(),
    encrypted,
    journalTitle: journal.title,
    ...(journal.salt ? { salt: journal.salt } : {}),
    ...(journal.kdfIterations ? { kdfIterations: journal.kdfIterations } : {}),
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // --- Journal metadata (without pages) ---
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pages: _pages, ...metadata } = journal;
  const metadataJson = JSON.stringify(metadata, null, 2);
  // Encrypted entries use compression: 'STORE' to avoid Hermes/JSZip deflate
  // corruption on high-entropy data. Encrypted bytes don't compress anyway.
  const encOpts: JSZip.JSZipFileOptions = { compression: 'STORE' };
  const journalContent =
    encrypted && derivedKey ? await aesGcmEncryptBytes(metadataJson, derivedKey) : metadataJson;
  zip.file('journal.json', journalContent, encrypted && derivedKey ? encOpts : undefined);

  // --- Settings ---
  const settingsJson = JSON.stringify(journal.settings, null, 2);
  const settingsContent =
    encrypted && derivedKey ? await aesGcmEncryptBytes(settingsJson, derivedKey) : settingsJson;
  zip.file('settings.json', settingsContent, encrypted && derivedKey ? encOpts : undefined);

  // --- Build path map for attachment rewriting ---
  const pathMap = new Map<string, string>();
  for (const entry of attachmentEntries) {
    pathMap.set(entry.diskPath, entry.zipFilename);
  }

  // --- Pages ---
  const rewrittenPages = rewriteAttachmentPaths(activePages, pathMap);
  for (let i = 0; i < rewrittenPages.length; i++) {
    const page = rewrittenPages[i];
    const pageJson = JSON.stringify(page, null, 2);
    const content =
      encrypted && derivedKey ? await aesGcmEncryptBytes(pageJson, derivedKey) : pageJson;
    zip.file(`pages/${page.id}.json`, content, encrypted && derivedKey ? encOpts : undefined);

    current++;
    onProgress?.({ current, total, phase: 'pages' });
  }

  // --- Attachments ---
  for (const entry of attachmentEntries) {
    const data = await store.getAttachment(
      entry.diskPath,
      entry.isPasswordEncrypted ? derivedKey : undefined,
    );
    if (data) {
      if (encrypted && derivedKey) {
        // Encrypted export: store as raw encrypted bytes (Uint8Array)
        // Use STORE to bypass deflate — encrypted data is incompressible
        const encData = await aesGcmEncryptBytes(data, derivedKey);
        zip.file(`attachments/${entry.zipFilename}`, encData, encOpts);
      } else {
        // Unencrypted export: decode base64 → raw binary so files are directly usable
        zip.file(`attachments/${entry.zipFilename}`, data, { base64: true });
      }
    }

    current++;
    onProgress?.({ current, total, phase: 'attachments' });
  }

  // --- Generate ZIP ---
  onProgress?.({ current: total, total, phase: 'zipping' });
  const zipData = await zip.generateAsync({ type: 'base64' });

  // Write to cache and share
  const cacheDir = new Directory(Paths.cache, 'exports');
  if (!cacheDir.exists) {
    cacheDir.create({ intermediates: true, idempotent: true });
  }

  const safeName = journal.title.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeName}.canto.zip`;
  const outFile = new File(cacheDir, fileName);
  if (outFile.exists) outFile.delete();
  outFile.create({ intermediates: true });
  outFile.write(zipData, { encoding: 'base64' });

  await Sharing.shareAsync(outFile.uri, {
    mimeType: 'application/zip',
    dialogTitle: fileName,
  });
}
