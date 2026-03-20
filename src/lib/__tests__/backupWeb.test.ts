/**
 * Tests for web backup export/import implementations.
 * These test the JSZip + fetch/blob logic in export.web.ts and import.web.ts.
 *
 * Uses fake-indexeddb for the web LocalStore and mocks document/URL for
 * browser download simulation.
 */
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { createLocalStore, _resetDB } from '../storage/local.web';
import { exportJournal } from '../backup/export.web';
import type { ExportManifest } from '../backup/export.web';
import { inspectBackup, importJournal } from '../backup/import.web';
import type { EncryptionService } from '../encryption';
import type { JournalContent, Page, Attachment } from '@/data';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock getLocalStore to return our test store
// Variable must be prefixed with `mock` to be accessible inside jest.mock()
let mockTestStore: ReturnType<typeof createLocalStore>;
jest.mock('@/hooks/useStorage', () => ({
  getLocalStore: () => Promise.resolve(mockTestStore),
}));

// Mock document.createElement + URL for browser download
const mockClick = jest.fn();
const mockCreateElement = jest.fn(() => ({ href: '', download: '', click: mockClick }));
const mockCreateObjectURL = jest.fn((_blob?: unknown) => 'blob:mock-url');
const mockRevokeObjectURL = jest.fn();

Object.defineProperty(globalThis, 'document', {
  value: { createElement: mockCreateElement },
  writable: true,
});
Object.defineProperty(globalThis, 'URL', {
  value: { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL },
  writable: true,
});

// Mock fetch for import (returns ArrayBuffer from blob URL)
let fetchResponse: ArrayBuffer | null = null;
// @ts-expect-error — overriding global fetch for tests
globalThis.fetch = jest.fn(async () => ({
  arrayBuffer: async () => fetchResponse,
}));

// Passthrough encryption
function createMockEncryption(): EncryptionService {
  return {
    encrypt: jest.fn((data: string) => Promise.resolve(`enc:${data}`)),
    decrypt: jest.fn((data: string) => Promise.resolve(data.replace(/^enc:/, ''))),
    encryptWithPassword: jest.fn(),
    decryptWithPassword: jest.fn(),
    generateSalt: jest.fn(() => new Uint8Array(16)),
    clearSession: jest.fn(),
  };
}

function makeJournal(id: string, pages: Page[] = []): JournalContent {
  return {
    id,
    title: `Journal ${id}`,
    icon: 'book',
    date: '2026-01-01T00:00:00Z',
    secure: false,
    pages,
    settings: {
      use24h: false,
      previewTags: true,
      previewThumbnail: true,
      previewIcons: true,
      filterBar: true,
      sort: 'descending',
      showMarkdownPlaceholder: true,
      autoLocation: false,
      remoteSync: false,
      autoSync: false,
    },
    version: 1,
  };
}

function makePage(id: string, text = `Page ${id}`): Page {
  return {
    id,
    text,
    date: '2026-03-12T10:00:00Z',
    tags: ['test'],
    files: [],
    images: [],
    comments: [],
    modified: Date.now(),
    deleted: false,
  };
}

beforeEach(async () => {
  _resetDB();
  indexedDB.deleteDatabase('canto');
  mockTestStore = createLocalStore(createMockEncryption());
  await mockTestStore.initialize();
  mockClick.mockClear();
  mockCreateElement.mockClear();
  mockCreateObjectURL.mockClear();
  mockRevokeObjectURL.mockClear();
  fetchResponse = null;
});

// ---------------------------------------------------------------------------
// Export tests
// ---------------------------------------------------------------------------

describe('exportJournal (web)', () => {
  it('generates a ZIP and triggers browser download', async () => {
    const journal = makeJournal('j1', [makePage('p1')]);
    await mockTestStore.saveJournal(journal);

    await exportJournal(journal, false);

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(mockCreateElement).toHaveBeenCalledWith('a');
    expect(mockClick).toHaveBeenCalledTimes(1);
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('download filename is sanitized from journal title', async () => {
    const journal = makeJournal('j1', [makePage('p1')]);
    journal.title = 'My Journal / with <special> chars!';
    await mockTestStore.saveJournal(journal);

    await exportJournal(journal, false);

    const anchor = mockCreateElement.mock.results[0].value;
    expect(anchor.download).toBe('My_Journal___with__special__chars_.canto.zip');
  });

  it('ZIP contains manifest, journal metadata, settings, and pages', async () => {
    const journal = makeJournal('j1', [makePage('p1'), makePage('p2')]);
    await mockTestStore.saveJournal(journal);

    // Capture the blob passed to createObjectURL
    let capturedBlob: unknown = null;
    mockCreateObjectURL.mockImplementation((blob: unknown) => {
      capturedBlob = blob;
      return 'blob:mock';
    });

    await exportJournal(journal, false);

    expect(capturedBlob).not.toBeNull();
    const arrayBuffer = await (capturedBlob as Blob).arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    expect(zip.file('manifest.json')).not.toBeNull();
    expect(zip.file('journal.json')).not.toBeNull();
    expect(zip.file('settings.json')).not.toBeNull();
    expect(zip.file('pages/p1.json')).not.toBeNull();
    expect(zip.file('pages/p2.json')).not.toBeNull();
  });

  it('manifest contains correct metadata', async () => {
    const journal = makeJournal('j1', [makePage('p1')]);
    await mockTestStore.saveJournal(journal);

    let capturedBlob: unknown = null;
    mockCreateObjectURL.mockImplementation((blob: unknown) => {
      capturedBlob = blob;
      return 'blob:mock';
    });

    await exportJournal(journal, false);

    const arrayBuffer = await (capturedBlob as Blob).arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as ExportManifest;

    expect(manifest.version).toBe(1);
    expect(manifest.encrypted).toBe(false);
    expect(manifest.journalTitle).toBe('Journal j1');
  });

  it('reports progress during export', async () => {
    const journal = makeJournal('j1', [makePage('p1'), makePage('p2')]);
    await mockTestStore.saveJournal(journal);

    const progress: Array<{ current: number; total: number; phase: string }> = [];
    await exportJournal(journal, false, undefined, (p) => progress.push(p));

    expect(progress.length).toBeGreaterThan(0);
    const last = progress[progress.length - 1];
    expect(last.phase).toBe('zipping');
  });

  it('excludes deleted pages from export', async () => {
    const deletedPage = makePage('p-deleted');
    deletedPage.deleted = true;
    const journal = makeJournal('j1', [makePage('p1'), deletedPage]);
    await mockTestStore.saveJournal(journal);

    let capturedBlob: unknown = null;
    mockCreateObjectURL.mockImplementation((blob: unknown) => {
      capturedBlob = blob;
      return 'blob:mock';
    });

    await exportJournal(journal, false);

    const arrayBuffer = await (capturedBlob as Blob).arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    expect(zip.file('pages/p1.json')).not.toBeNull();
    expect(zip.file('pages/p-deleted.json')).toBeNull();
  });

  it('includes attachments in export', async () => {
    const att: Attachment = {
      id: 'att1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const attPath = await mockTestStore.saveAttachment('j1', 'p1', att, btoa('fake-image-bytes'));

    const page = makePage('p1');
    page.images = [{ ...att, path: attPath }];
    const journal = makeJournal('j1', [page]);
    await mockTestStore.saveJournal(journal);

    let capturedBlob: unknown = null;
    mockCreateObjectURL.mockImplementation((blob: unknown) => {
      capturedBlob = blob;
      return 'blob:mock';
    });

    await exportJournal(journal, false);

    const arrayBuffer = await (capturedBlob as Blob).arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const attachmentFiles = zip.file(/^attachments\//);
    expect(attachmentFiles.length).toBe(1);
    expect(attachmentFiles[0].name).toContain('image-att1.jpg');
  });
});

// ---------------------------------------------------------------------------
// Import tests
// ---------------------------------------------------------------------------

describe('inspectBackup (web)', () => {
  it('reads manifest from ZIP blob URL', async () => {
    const zip = new JSZip();
    const manifest: ExportManifest = {
      version: 1,
      appVersion: '0.14.0',
      exportDate: '2026-01-01',
      encrypted: false,
      journalTitle: 'Test Journal',
    };
    zip.file('manifest.json', JSON.stringify(manifest));
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const info = await inspectBackup('blob:mock-zip');

    expect(info.manifest.journalTitle).toBe('Test Journal');
    expect(info.manifest.version).toBe(1);
    expect(info.needsPassword).toBe(false);
    expect(info.canProvidePassword).toBe(false);
  });

  it('detects encrypted backup', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: true,
        salt: 'dGVzdHNhbHQ=',
        journalTitle: 'Secure',
      }),
    );
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const info = await inspectBackup('blob:mock');
    expect(info.needsPassword).toBe(true);
  });

  it('detects canProvidePassword for unencrypted backup with salt', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        salt: 'dGVzdHNhbHQ=',
        journalTitle: 'Was Secure',
      }),
    );
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const info = await inspectBackup('blob:mock');
    expect(info.needsPassword).toBe(false);
    expect(info.canProvidePassword).toBe(true);
  });

  it('throws on missing manifest', async () => {
    const zip = new JSZip();
    zip.file('other.txt', 'data');
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(inspectBackup('blob:mock')).rejects.toThrow('missing manifest.json');
  });

  it('throws on unsupported version', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ version: 99 }));
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(inspectBackup('blob:mock')).rejects.toThrow('manifest.version');
  });
});

describe('importJournal (web)', () => {
  it('imports unencrypted journal with pages', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        journalTitle: 'Imported',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({
        id: 'old-id',
        title: 'Imported',
        icon: 'book',
        date: '2026-01-01',
        secure: false,
      }),
    );
    zip.file(
      'settings.json',
      JSON.stringify({
        use24h: false,
        previewTags: true,
        previewThumbnail: true,
        previewIcons: true,
        filterBar: true,
        sort: 'descending',
        showMarkdownPlaceholder: true,
        autoLocation: false,
        remoteSync: false,
        autoSync: false,
      }),
    );
    zip.file(
      'pages/p1.json',
      JSON.stringify({
        id: 'p1',
        text: 'Hello world',
        date: '2026-01-01',
        tags: [],
        files: [],
        images: [],
        comments: [],
        modified: 1000,
        deleted: false,
      }),
    );
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await importJournal('blob:mock', 'My Import');

    expect(result.title).toBe('My Import');
    expect(result.journalId).toBeTruthy();
    // New ID should differ from original
    expect(result.journalId).not.toBe('old-id');

    // Verify stored in IndexedDB
    const stored = await mockTestStore.getJournal(result.journalId);
    expect(stored).not.toBeNull();
    expect(stored!.title).toBe('My Import');
    expect(stored!.pages.length).toBe(1);
    expect(stored!.pages[0].text).toBe('Hello world');
    // Page ID should be regenerated
    expect(stored!.pages[0].id).not.toBe('p1');
  });

  it('imports journal with attachments', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        journalTitle: 'With Attachments',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({
        id: 'j1',
        title: 'With Attachments',
        icon: 'camera',
        date: '2026-01-01',
        secure: false,
      }),
    );
    zip.file(
      'settings.json',
      JSON.stringify({
        use24h: false,
        previewTags: true,
        previewThumbnail: true,
        previewIcons: true,
        filterBar: true,
        sort: 'descending',
        showMarkdownPlaceholder: true,
        autoLocation: false,
        remoteSync: false,
        autoSync: false,
      }),
    );
    zip.file(
      'pages/p1.json',
      JSON.stringify({
        id: 'p1',
        text: 'With image',
        date: '2026-01-01',
        tags: [],
        files: [],
        images: [
          {
            id: 'att1',
            path: 'image-att1.jpg',
            name: 'photo.jpg',
            type: 'image',
            encrypted: false,
            deleted: false,
          },
        ],
        comments: [],
        modified: 1000,
        deleted: false,
      }),
    );
    // Unencrypted attachment stored as raw binary (base64-decoded by JSZip)
    zip.file('attachments/image-att1.jpg', 'fakeimagebytes');
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await importJournal('blob:mock', 'Imported');

    const stored = await mockTestStore.getJournal(result.journalId);
    expect(stored).not.toBeNull();
    expect(stored!.pages[0].images.length).toBe(1);
    // Attachment path should be updated to new storage path
    expect(stored!.pages[0].images[0].path).toBeTruthy();
    expect(stored!.pages[0].images[0].path).not.toBe('image-att1.jpg');
  });

  it('reports progress during import', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        journalTitle: 'T',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({ id: 'j1', title: 'T', icon: 'book', date: '2026-01-01', secure: false }),
    );
    zip.file(
      'settings.json',
      JSON.stringify({
        use24h: false,
        previewTags: true,
        previewThumbnail: true,
        previewIcons: true,
        filterBar: true,
        sort: 'descending',
        showMarkdownPlaceholder: true,
        autoLocation: false,
        remoteSync: false,
        autoSync: false,
      }),
    );
    zip.file(
      'pages/p1.json',
      JSON.stringify({
        id: 'p1',
        text: 'A',
        date: '2026-01-01',
        tags: [],
        files: [],
        images: [],
        comments: [],
        modified: 1,
        deleted: false,
      }),
    );
    zip.file(
      'pages/p2.json',
      JSON.stringify({
        id: 'p2',
        text: 'B',
        date: '2026-01-01',
        tags: [],
        files: [],
        images: [],
        comments: [],
        modified: 1,
        deleted: false,
      }),
    );
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const progress: Array<{ current: number; total: number; phase: string }> = [];
    await importJournal('blob:mock', 'T', undefined, (p) => progress.push(p));

    expect(progress.length).toBeGreaterThan(0);
    expect(progress.some((p) => p.phase === 'pages')).toBe(true);
  });

  it('throws on missing manifest', async () => {
    const zip = new JSZip();
    zip.file('random.txt', 'data');
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(importJournal('blob:mock', 'T')).rejects.toThrow('missing manifest.json');
  });

  it('throws on missing journal.json', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        journalTitle: 'T',
      }),
    );
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(importJournal('blob:mock', 'T')).rejects.toThrow('missing journal.json');
  });
});

// ---------------------------------------------------------------------------
// Round-trip: export then import on web
// ---------------------------------------------------------------------------

describe('web export → import round-trip', () => {
  it('exported journal can be re-imported with data preserved', async () => {
    // Create and save a journal
    const page = makePage('p1', 'Round-trip content');
    page.tags = ['tag1', 'tag2'];
    const journal = makeJournal('j1', [page]);
    await mockTestStore.saveJournal(journal);

    // Export — capture the blob
    let capturedBlob: unknown = null;
    mockCreateObjectURL.mockImplementation((blob: unknown) => {
      capturedBlob = blob;
      return 'blob:exported';
    });

    await exportJournal(journal, false);
    expect(capturedBlob).not.toBeNull();

    // Prepare for import — set fetchResponse to the exported blob
    fetchResponse = await (capturedBlob as Blob).arrayBuffer();

    // Import
    const result = await importJournal('blob:exported', 'Re-imported');

    // Verify
    const imported = await mockTestStore.getJournal(result.journalId);
    expect(imported).not.toBeNull();
    expect(imported!.title).toBe('Re-imported');
    expect(imported!.icon).toBe('book');
    expect(imported!.pages.length).toBe(1);
    expect(imported!.pages[0].text).toBe('Round-trip content');
    expect(imported!.pages[0].tags).toEqual(['tag1', 'tag2']);
  });
});
