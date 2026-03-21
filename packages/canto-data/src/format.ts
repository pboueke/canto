import type { Page, Attachment } from './types';
import { SCHEMA_VERSION } from './version';
import { ValidationError } from './validation';
import { validatePage } from './validation';

// ---------------------------------------------------------------------------
// Export manifest
// ---------------------------------------------------------------------------

export interface ExportManifest {
  /** Manifest format version (always 1). */
  version: 1;
  /** Canto journal schema version (semver). Absent in legacy exports (treated as "0.16.0"). */
  schemaVersion?: string;
  appVersion: string;
  exportDate: string;
  encrypted: boolean;
  salt?: string;
  kdfIterations?: number;
  journalTitle: string;
}

export interface BuildManifestOptions {
  appVersion: string;
  encrypted: boolean;
  journalTitle: string;
  salt?: string;
  kdfIterations?: number;
}

/** Create an ExportManifest with the current SCHEMA_VERSION. */
export function buildExportManifest(opts: BuildManifestOptions): ExportManifest {
  return {
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    appVersion: opts.appVersion,
    exportDate: new Date().toISOString(),
    encrypted: opts.encrypted,
    journalTitle: opts.journalTitle,
    ...(opts.salt ? { salt: opts.salt } : {}),
    ...(opts.kdfIterations ? { kdfIterations: opts.kdfIterations } : {}),
  };
}

/**
 * Parse and validate a manifest JSON string.
 * Legacy manifests (without schemaVersion) are treated as "0.16.0".
 */
export function parseManifest(json: string): ExportManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ValidationError('manifest', 'valid JSON', 'parse error');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('manifest', 'object', typeof raw);
  }

  const o = raw as Record<string, unknown>;

  if (o.version !== 1) {
    throw new ValidationError('manifest.version', '1', String(o.version));
  }

  if (typeof o.appVersion !== 'string') {
    throw new ValidationError('manifest.appVersion', 'string', typeof o.appVersion);
  }

  if (typeof o.exportDate !== 'string') {
    throw new ValidationError('manifest.exportDate', 'string', typeof o.exportDate);
  }

  if (typeof o.encrypted !== 'boolean') {
    throw new ValidationError('manifest.encrypted', 'boolean', typeof o.encrypted);
  }

  if (typeof o.journalTitle !== 'string') {
    throw new ValidationError('manifest.journalTitle', 'string', typeof o.journalTitle);
  }

  // Legacy manifests don't have schemaVersion — default to "0.16.0"
  const schemaVersion = typeof o.schemaVersion === 'string' ? o.schemaVersion : '0.16.0';

  return {
    version: 1,
    schemaVersion,
    appVersion: o.appVersion as string,
    exportDate: o.exportDate as string,
    encrypted: o.encrypted as boolean,
    journalTitle: o.journalTitle as string,
    ...(typeof o.salt === 'string' ? { salt: o.salt } : {}),
    ...(typeof o.kdfIterations === 'number' ? { kdfIterations: o.kdfIterations } : {}),
  };
}

// ---------------------------------------------------------------------------
// Attachment collection & path rewriting (pure, no I/O)
// ---------------------------------------------------------------------------

export interface AttachmentEntry {
  /** Index into the flat attachments/ folder inside the ZIP */
  zipFilename: string;
  /** Original on-disk filename (for reading) */
  diskPath: string;
  /** Whether the on-disk file is password-encrypted */
  isPasswordEncrypted: boolean;
}

/** Collect unique attachments from pages for export, building portable ZIP filenames. */
export function collectAttachmentEntries(pages: Page[]): AttachmentEntry[] {
  const seen = new Set<string>();
  const entries: AttachmentEntry[] = [];

  for (const page of pages) {
    const allAttachments = [...page.images, ...page.files].filter((a) => !a.deleted);
    for (const att of allAttachments) {
      if (!att.path || seen.has(att.path)) continue;
      seen.add(att.path);

      const parts = att.name.split('.');
      const ext = parts.length > 1 ? parts.pop()! : 'bin';
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
export function rewriteAttachmentPaths(pages: Page[], pathMap: Map<string, string>): Page[] {
  return pages.map((page) => ({
    ...page,
    images: page.images.map((a: Attachment) => ({
      ...a,
      path: pathMap.get(a.path) ?? a.path,
    })),
    files: page.files.map((a: Attachment) => ({
      ...a,
      path: pathMap.get(a.path) ?? a.path,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Page serialization (pure, no I/O)
// ---------------------------------------------------------------------------

/** Serialize pages to a map of pageId → JSON string. */
export function serializePages(pages: Page[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const page of pages) {
    result.set(page.id, JSON.stringify(page, null, 2));
  }
  return result;
}

/** Deserialize pages from a map of filename → JSON string. */
export function deserializePages(entries: Map<string, string>): Page[] {
  const pages: Page[] = [];
  for (const [, json] of entries) {
    const parsed = JSON.parse(json);
    pages.push(validatePage(parsed));
  }
  return pages;
}
