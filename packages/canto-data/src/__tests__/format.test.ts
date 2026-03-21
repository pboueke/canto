import {
  buildExportManifest,
  parseManifest,
  collectAttachmentEntries,
  rewriteAttachmentPaths,
  serializePages,
  deserializePages,
} from '../format';
import { ValidationError } from '../validation';
import { SCHEMA_VERSION } from '../version';
import type { Page } from '../types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makePage(overrides?: Partial<Page>): Page {
  return {
    id: 'p1',
    text: 'Hello',
    date: '2026-01-01T00:00:00.000Z',
    tags: [],
    files: [],
    images: [],
    comments: [],
    modified: Date.now(),
    deleted: false,
    ...overrides,
  };
}

function makeAttachment(id: string, type: 'image' | 'file', name: string) {
  return { id, path: `/store/${name}`, name, type, encrypted: false, deleted: false };
}

// ---------------------------------------------------------------------------
// buildExportManifest
// ---------------------------------------------------------------------------

describe('buildExportManifest', () => {
  test('produces correct structure with schemaVersion', () => {
    const manifest = buildExportManifest({
      appVersion: '0.15.0',
      encrypted: false,
      journalTitle: 'My Journal',
    });

    expect(manifest.version).toBe(1);
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(manifest.appVersion).toBe('0.15.0');
    expect(manifest.encrypted).toBe(false);
    expect(manifest.journalTitle).toBe('My Journal');
    expect(manifest.exportDate).toBeDefined();
    expect(manifest.salt).toBeUndefined();
    expect(manifest.kdfIterations).toBeUndefined();
  });

  test('includes salt and kdfIterations when provided', () => {
    const manifest = buildExportManifest({
      appVersion: '0.15.0',
      encrypted: true,
      journalTitle: 'Secure',
      salt: 'abc123',
      kdfIterations: 50000,
    });

    expect(manifest.salt).toBe('abc123');
    expect(manifest.kdfIterations).toBe(50000);
  });
});

// ---------------------------------------------------------------------------
// parseManifest
// ---------------------------------------------------------------------------

describe('parseManifest', () => {
  test('parses valid manifest with schemaVersion', () => {
    const json = JSON.stringify({
      version: 1,
      schemaVersion: '0.17.0',
      appVersion: '0.17.0',
      exportDate: '2026-01-01T00:00:00.000Z',
      encrypted: false,
      journalTitle: 'Test',
    });

    const manifest = parseManifest(json);
    expect(manifest.schemaVersion).toBe('0.17.0');
    expect(manifest.journalTitle).toBe('Test');
  });

  test('defaults schemaVersion to "0.16.0" for legacy manifests', () => {
    const json = JSON.stringify({
      version: 1,
      appVersion: '0.9.0',
      exportDate: '2026-01-01T00:00:00.000Z',
      encrypted: false,
      journalTitle: 'Legacy',
    });

    const manifest = parseManifest(json);
    expect(manifest.schemaVersion).toBe('0.16.0');
  });

  test('rejects invalid JSON', () => {
    expect(() => parseManifest('not json')).toThrow(ValidationError);
  });

  test('rejects wrong version', () => {
    const json = JSON.stringify({
      version: 2,
      appVersion: '1.0.0',
      exportDate: '2026-01-01',
      encrypted: false,
      journalTitle: 'Test',
    });
    expect(() => parseManifest(json)).toThrow(ValidationError);
  });

  test('rejects missing required fields', () => {
    const json = JSON.stringify({ version: 1 });
    expect(() => parseManifest(json)).toThrow(ValidationError);
  });

  test('rejects non-object (array)', () => {
    const json = JSON.stringify([1, 2, 3]);
    expect(() => parseManifest(json)).toThrow(ValidationError);
  });

  test('rejects missing exportDate', () => {
    const json = JSON.stringify({
      version: 1,
      appVersion: '0.15.0',
      encrypted: false,
      journalTitle: 'Test',
    });
    expect(() => parseManifest(json)).toThrow(ValidationError);
  });

  test('rejects missing encrypted', () => {
    const json = JSON.stringify({
      version: 1,
      appVersion: '0.15.0',
      exportDate: '2026-01-01',
      journalTitle: 'Test',
    });
    expect(() => parseManifest(json)).toThrow(ValidationError);
  });

  test('rejects missing journalTitle', () => {
    const json = JSON.stringify({
      version: 1,
      appVersion: '0.15.0',
      exportDate: '2026-01-01',
      encrypted: false,
    });
    expect(() => parseManifest(json)).toThrow(ValidationError);
  });

  test('preserves optional salt and kdfIterations', () => {
    const json = JSON.stringify({
      version: 1,
      appVersion: '0.15.0',
      exportDate: '2026-01-01',
      encrypted: true,
      journalTitle: 'Enc',
      salt: 'abc',
      kdfIterations: 50000,
    });

    const manifest = parseManifest(json);
    expect(manifest.salt).toBe('abc');
    expect(manifest.kdfIterations).toBe(50000);
  });
});

// ---------------------------------------------------------------------------
// collectAttachmentEntries
// ---------------------------------------------------------------------------

describe('collectAttachmentEntries', () => {
  test('collects unique attachments from pages', () => {
    const img = makeAttachment('a1', 'image', 'photo.jpg');
    const file = makeAttachment('a2', 'file', 'doc.pdf');
    const pages = [makePage({ images: [img], files: [file] })];

    const entries = collectAttachmentEntries(pages);
    expect(entries).toHaveLength(2);
    expect(entries[0].zipFilename).toBe('image-a1.jpg');
    expect(entries[1].zipFilename).toBe('file-a2.pdf');
  });

  test('deduplicates by path', () => {
    const img = makeAttachment('a1', 'image', 'photo.jpg');
    const pages = [makePage({ images: [img] }), makePage({ id: 'p2', images: [img] })];

    const entries = collectAttachmentEntries(pages);
    expect(entries).toHaveLength(1);
  });

  test('skips deleted attachments', () => {
    const img = { ...makeAttachment('a1', 'image', 'photo.jpg'), deleted: true };
    const pages = [makePage({ images: [img] })];

    const entries = collectAttachmentEntries(pages);
    expect(entries).toHaveLength(0);
  });

  test('skips attachments with empty path', () => {
    const img = { ...makeAttachment('a1', 'image', 'photo.jpg'), path: '' };
    const pages = [makePage({ images: [img] })];

    const entries = collectAttachmentEntries(pages);
    expect(entries).toHaveLength(0);
  });

  test('falls back to bin extension for attachment without extension', () => {
    const img = { ...makeAttachment('a1', 'image', 'noext'), path: '/store/noext' };
    const pages = [makePage({ images: [img] })];

    const entries = collectAttachmentEntries(pages);
    expect(entries[0].zipFilename).toBe('image-a1.bin');
  });

  test('handles empty pages array', () => {
    expect(collectAttachmentEntries([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// rewriteAttachmentPaths
// ---------------------------------------------------------------------------

describe('rewriteAttachmentPaths', () => {
  test('rewrites matching paths', () => {
    const img = makeAttachment('a1', 'image', 'photo.jpg');
    const pages = [makePage({ images: [img] })];
    const pathMap = new Map([['/store/photo.jpg', 'image-a1.jpg']]);

    const result = rewriteAttachmentPaths(pages, pathMap);
    expect(result[0].images[0].path).toBe('image-a1.jpg');
  });

  test('preserves paths not in map', () => {
    const img = makeAttachment('a1', 'image', 'photo.jpg');
    const pages = [makePage({ images: [img] })];
    const pathMap = new Map<string, string>();

    const result = rewriteAttachmentPaths(pages, pathMap);
    expect(result[0].images[0].path).toBe('/store/photo.jpg');
  });

  test('rewrites file attachment paths', () => {
    const file = makeAttachment('a1', 'file', 'doc.pdf');
    const pages = [makePage({ files: [file] })];
    const pathMap = new Map([['/store/doc.pdf', 'file-a1.pdf']]);

    const result = rewriteAttachmentPaths(pages, pathMap);
    expect(result[0].files[0].path).toBe('file-a1.pdf');
  });

  test('preserves file paths not in map', () => {
    const file = makeAttachment('a1', 'file', 'doc.pdf');
    const pages = [makePage({ files: [file] })];
    const pathMap = new Map<string, string>();

    const result = rewriteAttachmentPaths(pages, pathMap);
    expect(result[0].files[0].path).toBe('/store/doc.pdf');
  });

  test('does not mutate original pages', () => {
    const img = makeAttachment('a1', 'image', 'photo.jpg');
    const pages = [makePage({ images: [img] })];
    const pathMap = new Map([['/store/photo.jpg', 'image-a1.jpg']]);

    rewriteAttachmentPaths(pages, pathMap);
    expect(pages[0].images[0].path).toBe('/store/photo.jpg');
  });
});

// ---------------------------------------------------------------------------
// serializePages / deserializePages
// ---------------------------------------------------------------------------

describe('deserializePages validation', () => {
  test('throws ValidationError for page missing required id', () => {
    const entries = new Map([['bad.json', JSON.stringify({ text: 'no id' })]]);
    expect(() => deserializePages(entries)).toThrow(ValidationError);
  });

  test('throws ValidationError for page with wrong type for text', () => {
    const entries = new Map([
      [
        'bad.json',
        JSON.stringify({
          id: 'p1',
          text: 123,
          date: '2026-01-01T00:00:00.000Z',
          tags: [],
          files: [],
          images: [],
          comments: [],
          modified: Date.now(),
          deleted: false,
        }),
      ],
    ]);
    expect(() => deserializePages(entries)).toThrow(ValidationError);
  });

  test('accepts valid pages', () => {
    const page = makePage();
    const entries = new Map([['p1.json', JSON.stringify(page)]]);
    const result = deserializePages(entries);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });
});

describe('page serialization', () => {
  test('round-trips pages through serialize/deserialize', () => {
    const pages = [makePage({ id: 'p1' }), makePage({ id: 'p2', text: 'Second' })];

    const serialized = serializePages(pages);
    expect(serialized.size).toBe(2);
    expect(serialized.has('p1')).toBe(true);
    expect(serialized.has('p2')).toBe(true);

    const deserialized = deserializePages(serialized);
    expect(deserialized).toHaveLength(2);
    expect(deserialized.find((p) => p.id === 'p1')?.text).toBe('Hello');
    expect(deserialized.find((p) => p.id === 'p2')?.text).toBe('Second');
  });

  test('handles empty pages', () => {
    const serialized = serializePages([]);
    expect(serialized.size).toBe(0);
    expect(deserializePages(serialized)).toEqual([]);
  });
});
