import JSZip from 'jszip';
import type { JournalContent } from 'canto-data';
import {
  buildExportManifest,
  collectAttachmentEntries,
  rewriteAttachmentPaths,
} from 'canto-data/format';
import { getLocalStore } from '@/hooks/useStorage';
import { aesGcmEncryptBytes } from '@/lib/encryption/utils';
import { assertUsableDerivedKey } from '@/lib/storage/integrity';
import { ExportError, classifyExportDataFailure, isExportError } from './export-errors';

export type { ExportManifest } from 'canto-data/format';
export type { ExportErrorKind } from './export-errors';
export { ExportError, isExportError } from './export-errors';

export interface ExportProgress {
  current: number;
  total: number;
  phase: 'pages' | 'attachments' | 'zipping';
}

/**
 * Export a journal as a .canto.zip file — web version.
 * Generates the ZIP in memory and triggers a browser download.
 *
 * Read-only with respect to journal data and fail-closed like the native
 * exporter: unreadable data is `integrity`; archive construction failures are
 * `archive`. There is no share-sheet phase on web.
 */
export async function exportJournal(
  journal: JournalContent,
  encrypted: boolean,
  derivedKey?: Uint8Array,
  onProgress?: (progress: ExportProgress) => void,
): Promise<void> {
  const store = await getLocalStore();
  const zip = new JSZip();

  // Encrypted export must never silently downgrade to plaintext. A revoked
  // (all-zero) key is rejected before any materialization begins.
  if (encrypted) {
    try {
      assertUsableDerivedKey(derivedKey);
      if (!derivedKey) {
        throw new ExportError(
          'integrity',
          'Encrypted export requires the journal key; the export was cancelled.',
        );
      }
    } catch (err) {
      throw classifyExportDataFailure(err);
    }
  }

  const activePages = journal.pages.filter((p) => !p.deleted);
  const attachmentEntries = collectAttachmentEntries(activePages);

  const total = activePages.length + attachmentEntries.length;
  let current = 0;

  // --- Phase 1: materialize every page and attachment in memory (read-only).
  try {
    // --- Manifest (always plaintext) ---
    const manifest = buildExportManifest({
      appVersion: '0.15.0',
      encrypted,
      journalTitle: journal.title,
      salt: journal.salt,
      kdfIterations: journal.kdfIterations,
    });
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

    // --- Attachments (strict: a missing record is an integrity failure) ---
    for (const entry of attachmentEntries) {
      const data = await store.getAttachment(
        entry.diskPath,
        entry.isPasswordEncrypted ? derivedKey : undefined,
      );
      if (!data) {
        throw new ExportError(
          'integrity',
          'A referenced attachment could not be read; a partial backup would be unsafe.',
        );
      }
      if (encrypted && derivedKey) {
        const encData = await aesGcmEncryptBytes(data, derivedKey);
        zip.file(`attachments/${entry.zipFilename}`, encData, encOpts);
      } else {
        zip.file(`attachments/${entry.zipFilename}`, data, { base64: true });
      }
      current++;
      onProgress?.({ current, total, phase: 'attachments' });
    }
  } catch (err) {
    throw classifyExportDataFailure(err);
  }

  // --- Phase 2: archive construction and browser download ---
  try {
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
  } catch (err) {
    if (isExportError(err)) throw err;
    throw new ExportError('archive', 'The backup archive could not be created.', err);
  }
}
