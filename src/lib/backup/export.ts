import JSZip from 'jszip';
import { Paths, File, Directory } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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
 * Export a journal as a .canto.zip file and open the share sheet.
 *
 * Read-only with respect to journal data, and fail-closed:
 * - `integrity` — unreadable journal data (unreadable pages/attachments or an
 *   invalid key for a requested encrypted export). Never downgraded to
 *   plaintext; nothing is written.
 * - `archive` — the archive itself could not be constructed or written
 *   (space/IO failure). Journal files are untouched.
 * - `share` — the archive was created but Android/OS sharing rejected it.
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
  // A complete export is impossible if any referenced record cannot be read,
  // so this phase fails closed with the integrity classification.
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
        // Encrypted export: store as raw encrypted bytes (Uint8Array)
        // Use STORE to bypass deflate — encrypted data is incompressible
        const encData = await aesGcmEncryptBytes(data, derivedKey);
        zip.file(`attachments/${entry.zipFilename}`, encData, encOpts);
      } else {
        // Unencrypted export: decode base64 → raw binary so files are directly usable
        zip.file(`attachments/${entry.zipFilename}`, data, { base64: true });
      }

      current++;
      onProgress?.({ current, total, phase: 'attachments' });
    }
  } catch (err) {
    throw classifyExportDataFailure(err);
  }

  // --- Phase 2: archive construction and cache write (space/IO failures) ---
  try {
    onProgress?.({ current: total, total, phase: 'zipping' });
    const zipData = await zip.generateAsync({ type: 'base64' });

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

    // --- Phase 3: native share sheet (share failures only) ---
    try {
      await Sharing.shareAsync(outFile.uri, {
        mimeType: 'application/zip',
        dialogTitle: fileName,
      });
    } catch (err) {
      throw new ExportError('share', 'The backup could not be shared.', err);
    }
  } catch (err) {
    if (isExportError(err)) throw err;
    throw new ExportError('archive', 'The backup archive could not be created.', err);
  }
}
