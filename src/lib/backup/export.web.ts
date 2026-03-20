import JSZip from 'jszip';
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
  zipFilename: string;
  diskPath: string;
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
      const ext = att.name.split('.').pop() ?? 'bin';
      const zipFilename = `${att.type}-${att.id}.${ext}`;
      entries.push({ zipFilename, diskPath: att.path, isPasswordEncrypted: att.encrypted });
    }
  }
  return entries;
}

function rewriteAttachmentPaths(pages: Page[], pathMap: Map<string, string>): Page[] {
  return pages.map((page) => ({
    ...page,
    images: page.images.map((a) => ({ ...a, path: pathMap.get(a.path) ?? a.path })),
    files: page.files.map((a) => ({ ...a, path: pathMap.get(a.path) ?? a.path })),
  }));
}

export interface ExportProgress {
  current: number;
  total: number;
  phase: 'pages' | 'attachments' | 'zipping';
}

/**
 * Export a journal as a .canto.zip file — web version.
 * Generates the ZIP in memory and triggers a browser download.
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
    appVersion: '0.14.0',
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
  const encOpts: JSZip.JSZipFileOptions = { compression: 'STORE' };
  const journalContent =
    encrypted && derivedKey ? await aesGcmEncryptBytes(metadataJson, derivedKey) : metadataJson;
  zip.file('journal.json', journalContent, encrypted && derivedKey ? encOpts : undefined);

  // --- Settings ---
  const settingsJson = JSON.stringify(journal.settings, null, 2);
  const settingsContent =
    encrypted && derivedKey ? await aesGcmEncryptBytes(settingsJson, derivedKey) : settingsJson;
  zip.file('settings.json', settingsContent, encrypted && derivedKey ? encOpts : undefined);

  // --- Build path map ---
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
        const encData = await aesGcmEncryptBytes(data, derivedKey);
        zip.file(`attachments/${entry.zipFilename}`, encData, encOpts);
      } else {
        zip.file(`attachments/${entry.zipFilename}`, data, { base64: true });
      }
    }
    current++;
    onProgress?.({ current, total, phase: 'attachments' });
  }

  // --- Generate ZIP and trigger browser download ---
  onProgress?.({ current: total, total, phase: 'zipping' });
  const blob = await zip.generateAsync({ type: 'blob' });

  const safeName = journal.title.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeName}.canto.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
