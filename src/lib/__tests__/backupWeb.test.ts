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
import type { JournalContent, Page, Attachment } from 'canto-data';
import { aesGcmEncryptBytes, aesGcmDecryptBytes } from '../encryption/utils';
import { ATTACHMENT_CHUNK_SIZE } from '../storage/attachment-content';
import { canGenerateThumbnailFromAttachment, pageToListPreview } from '../pagePreview';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock getLocalStore to return our test store
// Variable must be prefixed with `mock` to be accessible inside jest.mock()
let mockTestStore: ReturnType<typeof createLocalStore>;
const PNG_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1,
  0, 0, 0, 1,
]);
const mockGenerateThumbnail = jest.fn();
jest.mock('@/hooks/useStorage', () => ({
  getLocalStore: () => Promise.resolve(mockTestStore),
}));
jest.mock('@/lib/thumbnail', () => ({
  generateThumbnailFromChunks: (...args: unknown[]) => mockGenerateThumbnail(...args),
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
    salt: 'dGVzdHNhbHQ=',
    pages,
    settings: {
      use24h: false,
      previewTags: true,
      previewThumbnail: true,
      previewIcons: true,
      filterBar: true,
      sort: 'descending',
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

async function prepareTransactionalImportZip(secure = false): Promise<void> {
  const journal = makeJournal('source-journal');
  journal.secure = secure;
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({
      version: 1,
      appVersion: '0.19.1',
      exportDate: '2026-05-16T00:00:00Z',
      encrypted: false,
      journalTitle: journal.title,
    }),
  );
  zip.file('journal.json', JSON.stringify(journal));
  zip.file('settings.json', JSON.stringify(journal.settings));
  zip.file('pages/source-page.json', JSON.stringify(makePage('source-page')));
  fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });
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
  mockGenerateThumbnail.mockReset();
  mockGenerateThumbnail.mockResolvedValue('dGh1bWJuYWls');
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

  it('encrypts attachments when encrypted=true and derivedKey provided', async () => {
    const key = new Uint8Array(32);
    key.fill(0xab);

    const att: Attachment = {
      id: 'att1',
      path: '',
      name: 'secret.jpg',
      type: 'image',
      encrypted: true,
      deleted: false,
    };
    const attPath = await mockTestStore.saveAttachment(
      'j1',
      'p1',
      att,
      btoa('secret-image-bytes'),
      key,
    );

    const page = makePage('p1');
    page.images = [{ ...att, path: attPath }];
    const journal = makeJournal('j1', [page]);
    journal.secure = true;
    journal.salt = 'dGVzdA==';
    journal.kdfIterations = 50000;
    await mockTestStore.saveJournal(journal);

    let capturedBlob: unknown = null;
    mockCreateObjectURL.mockImplementation((blob: unknown) => {
      capturedBlob = blob;
      return 'blob:mock';
    });

    await exportJournal(journal, true, key);

    expect(capturedBlob).not.toBeNull();
    const arrayBuffer = await (capturedBlob as Blob).arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const attFiles = zip.file(/^attachments\//);
    expect(attFiles.length).toBe(1);

    // Attachment should be encrypted binary — verify by decrypting
    const encBytes = await attFiles[0].async('uint8array');
    const decrypted = await aesGcmDecryptBytes(encBytes, key);
    expect(decrypted).toBeTruthy();
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
    expect(stored!.pages[0].modified).toBe(1000);
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
    // A minimal parseable PNG header. The platform thumbnail decoder is mocked;
    // import itself must only preflight this header and stream the source.
    zip.file(
      'attachments/image-att1.jpg',
      new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0,
        0, 1, 0, 0, 0, 1,
      ]),
    );
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await importJournal('blob:mock', 'Imported');

    const stored = await mockTestStore.getJournal(result.journalId);
    expect(stored).not.toBeNull();
    expect(stored!.pages[0].images.length).toBe(1);
    // Attachment path should be updated to new storage path
    expect(stored!.pages[0].images[0].path).toBeTruthy();
    expect(stored!.pages[0].images[0].path).not.toBe('image-att1.jpg');

    // A flat-v1 image is re-imported as chunked content and receives a small
    // persisted preview; automatic list/page rendering never opens the source.
    const image = stored!.pages[0].images[0];
    expect(pageToListPreview(stored!.pages[0]).firstImageChunked).toBe(true);
    expect(canGenerateThumbnailFromAttachment(image)).toBe(false);
    expect(mockGenerateThumbnail).toHaveBeenCalledTimes(1);
    expect(stored!.pages[0].thumbnail).toBe('dGh1bWJuYWls');
  });

  it('assigns an import thumbnail only to the first visible image, regardless of ZIP entry order', async () => {
    const zip = new JSZip();
    const settings = {
      use24h: false,
      previewTags: true,
      previewThumbnail: true,
      previewIcons: true,
      filterBar: true,
      sort: 'descending',
      autoLocation: false,
      remoteSync: false,
      autoSync: false,
    };
    const page = {
      ...makePage('p1'),
      images: [
        {
          id: 'first',
          path: 'image-first.png',
          name: 'first.png',
          type: 'image',
          encrypted: false,
          deleted: false,
        },
        {
          id: 'later',
          path: 'image-later.png',
          name: 'later.png',
          type: 'image',
          encrypted: false,
          deleted: false,
        },
      ],
    };
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.19.1',
        exportDate: '2026-05-16T00:00:00Z',
        encrypted: false,
        journalTitle: 'Order',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({ id: 'j1', title: 'Order', icon: 'book', date: '2026-01-01', secure: false }),
    );
    zip.file('settings.json', JSON.stringify(settings));
    zip.file('pages/p1.json', JSON.stringify(page));
    // Deliberately add the later image first to reproduce archive ordering.
    zip.file('attachments/image-later.png', PNG_HEADER);
    zip.file('attachments/image-first.png', PNG_HEADER);
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    mockGenerateThumbnail.mockResolvedValue('Zmlyc3QtcHJldmlldw==');
    const result = await importJournal('blob:mock', 'Order');
    const stored = await mockTestStore.getJournal(result.journalId);

    expect(mockGenerateThumbnail).toHaveBeenCalledTimes(1);
    expect(stored?.pages[0].thumbnail).toBe('Zmlyc3QtcHJldmlldw==');
  });

  it('streams oversized flat-v1 attachments instead of calling JSZip async for attachment content', async () => {
    const source = new Uint8Array(1024 * 1024 + 29);
    source.forEach((_, index) => {
      source[index] = index % 251;
    });
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.19.1',
        exportDate: '2026-05-16T00:00:00Z',
        encrypted: false,
        journalTitle: 'Streamed',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({
        id: 'j1',
        title: 'Streamed',
        icon: 'book',
        date: '2026-01-01',
        secure: false,
      }),
    );
    zip.file(
      'pages/p1.json',
      JSON.stringify({
        id: 'p1',
        text: 'T',
        date: '2026-01-01',
        tags: [],
        files: [
          {
            id: 'att1',
            path: 'file-att1.bin',
            name: 'large.bin',
            type: 'file',
            encrypted: false,
            deleted: false,
          },
        ],
        images: [],
        comments: [],
        modified: 1,
        deleted: false,
      }),
    );
    zip.file('attachments/file-att1.bin', source);
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });
    const fixtureZip = new JSZip();
    fixtureZip.file('entry', 'value');
    const prototype = Object.getPrototypeOf(fixtureZip.file('entry')!) as {
      async: (...args: unknown[]) => Promise<unknown>;
    };
    const originalAsync = prototype.async;
    const asyncSpy = jest.spyOn(prototype, 'async').mockImplementation(function (
      this: JSZip.JSZipObject,
      ...args: unknown[]
    ) {
      if (this.name.startsWith('attachments/')) {
        throw new Error(`Unbounded ZIP entry read: ${String(args[0])}`);
      }
      return Reflect.apply(originalAsync, this, args);
    });

    const result = await importJournal('blob:mock', 'Streamed');

    expect(result.attachmentErrors).toBeUndefined();
    expect(asyncSpy.mock.calls.some(([type]) => type === 'base64')).toBe(false);
    const stored = await mockTestStore.getJournal(result.journalId);
    expect(stored!.pages[0].files[0].content).toMatchObject({ byteLength: source.length });
    asyncSpy.mockRestore();
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

  it('imports encrypted backup with correct key', async () => {
    const key = new Uint8Array(32);
    key.fill(0xab);

    const page = {
      id: 'p1',
      text: 'Secret content',
      date: '2026-01-01',
      tags: [],
      files: [],
      images: [],
      comments: [],
      modified: 1000,
      deleted: false,
    };
    const journal = {
      id: 'j1',
      title: 'Encrypted',
      icon: 'lock',
      date: '2026-01-01',
      secure: true,
      salt: 'dGVzdA==',
      kdfIterations: 50000,
    };

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: true,
        salt: 'dGVzdA==',
        kdfIterations: 50000,
        journalTitle: 'Encrypted',
      }),
    );
    zip.file('journal.json', await aesGcmEncryptBytes(JSON.stringify(journal), key));
    zip.file(
      'settings.json',
      await aesGcmEncryptBytes(
        JSON.stringify({
          use24h: false,
          previewTags: true,
          previewThumbnail: true,
          previewIcons: true,
          filterBar: true,
          sort: 'descending',
          autoLocation: false,
          remoteSync: false,
          autoSync: false,
        }),
        key,
      ),
    );
    zip.file('pages/p1.json', await aesGcmEncryptBytes(JSON.stringify(page), key));
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await importJournal('blob:mock', 'Encrypted', key);

    const stored = await mockTestStore.getJournal(result.journalId, key);
    expect(stored).not.toBeNull();
    expect(stored!.pages).toHaveLength(1);
    expect(stored!.pages[0].text).toBe('Secret content');
  });

  it('imports encrypted backup with encrypted attachments', async () => {
    const key = new Uint8Array(32);
    key.fill(0xab);

    const page = {
      id: 'p1',
      text: 'With enc att',
      date: '2026-01-01',
      tags: [],
      files: [],
      images: [
        {
          id: 'att1',
          path: 'image-att1.jpg',
          name: 'photo.jpg',
          type: 'image',
          encrypted: true,
          deleted: false,
        },
      ],
      comments: [],
      modified: 1000,
      deleted: false,
    };
    const journal = {
      id: 'j1',
      title: 'Enc Att',
      icon: 'lock',
      date: '2026-01-01',
      secure: true,
      salt: 'dGVzdA==',
      kdfIterations: 50000,
    };

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: true,
        salt: 'dGVzdA==',
        kdfIterations: 50000,
        journalTitle: 'Enc Att',
      }),
    );
    zip.file('journal.json', await aesGcmEncryptBytes(JSON.stringify(journal), key));
    zip.file(
      'settings.json',
      await aesGcmEncryptBytes(
        JSON.stringify({
          use24h: false,
          previewTags: true,
          previewThumbnail: true,
          previewIcons: true,
          filterBar: true,
          sort: 'descending',
          autoLocation: false,
          remoteSync: false,
          autoSync: false,
        }),
        key,
      ),
    );
    zip.file('pages/p1.json', await aesGcmEncryptBytes(JSON.stringify(page), key));
    // Regression: v1 encrypted entries are one AES-GCM value. They must remain
    // importable above the bounded chunk threshold, then become chunked locally.
    const attachmentData = btoa('x'.repeat(ATTACHMENT_CHUNK_SIZE + 1));
    zip.file('attachments/image-att1.jpg', await aesGcmEncryptBytes(attachmentData, key));
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await importJournal('blob:mock', 'Enc Att', key);

    const stored = await mockTestStore.getJournal(result.journalId, key);
    expect(stored).not.toBeNull();
    expect(stored!.pages[0].images).toHaveLength(1);
    expect(stored!.pages[0].images[0].path).toBeTruthy();
    expect(stored!.pages[0].images[0].content?.format).toBe('canto-chunked-v1');
  });

  it('generates a preview from the decrypted bytes of an encrypted flat-v1 image import', async () => {
    const key = new Uint8Array(32).fill(0xab);
    const page = {
      ...makePage('p1'),
      images: [
        {
          id: 'att1',
          path: 'image-att1.png',
          name: 'secret.png',
          type: 'image',
          encrypted: true,
          deleted: false,
        },
      ],
    };
    const journal = makeJournal('j1');
    journal.secure = true;
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.19.1',
        exportDate: '2026-05-16T00:00:00Z',
        encrypted: true,
        salt: journal.salt,
        kdfIterations: 50000,
        journalTitle: 'Encrypted image',
      }),
    );
    zip.file('journal.json', await aesGcmEncryptBytes(JSON.stringify(journal), key));
    zip.file('settings.json', await aesGcmEncryptBytes(JSON.stringify(journal.settings), key));
    zip.file('pages/p1.json', await aesGcmEncryptBytes(JSON.stringify(page), key));
    const attachmentBase64 = btoa(String.fromCharCode(...PNG_HEADER));
    zip.file('attachments/image-att1.png', await aesGcmEncryptBytes(attachmentBase64, key));
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    mockGenerateThumbnail.mockImplementation(async (chunks: AsyncIterable<Uint8Array>) => {
      const read: number[] = [];
      for await (const chunk of chunks) read.push(...chunk);
      expect(read).toEqual([...PNG_HEADER]);
      return 'c2VjdXJlLXByZXZpZXc=';
    });
    const result = await importJournal('blob:mock', 'Encrypted image', key);
    const stored = await mockTestStore.getJournal(result.journalId, key);

    expect(mockGenerateThumbnail).toHaveBeenCalledTimes(1);
    expect(stored?.pages[0].thumbnail).toBe('c2VjdXJlLXByZXZpZXc=');
  });

  it('auto-derives key for unencrypted backup with salt', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        salt: 'dGVzdHNhbHQ=',
        kdfIterations: 50000,
        journalTitle: 'Auto Derive',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({
        id: 'j1',
        title: 'Auto Derive',
        icon: 'book',
        date: '2026-01-01',
        secure: false,
        salt: 'dGVzdHNhbHQ=',
        kdfIterations: 50000,
      }),
    );
    zip.file(
      'pages/p1.json',
      JSON.stringify({
        id: 'p1',
        text: 'Auto derive test',
        date: '2026-01-01',
        tags: [],
        files: [],
        images: [
          {
            id: 'att1',
            path: 'image-att1.jpg',
            name: 'photo.jpg',
            type: 'image',
            encrypted: true,
            deleted: false,
          },
        ],
        comments: [],
        modified: 1000,
        deleted: false,
      }),
    );
    zip.file('attachments/image-att1.jpg', 'fakeimagebytes');
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await importJournal('blob:mock', 'Auto Derive');
    expect(result.journalId).toBeTruthy();
  });

  it('skips attachments with unrecognized filename format', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        journalTitle: 'Skip',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({ id: 'j1', title: 'Skip', icon: 'book', date: '2026-01-01', secure: false }),
    );
    zip.file(
      'pages/p1.json',
      JSON.stringify({
        id: 'p1',
        text: 'T',
        date: '2026-01-01',
        tags: [],
        files: [],
        images: [],
        comments: [],
        modified: 1,
        deleted: false,
      }),
    );
    zip.file('attachments/badly-named.jpg', 'data');
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await importJournal('blob:mock', 'Skip');
    expect(result.skippedAttachments).toContain('badly-named.jpg');
  });

  it('skips orphan attachments not referenced by any page', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        journalTitle: 'Orphan',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({
        id: 'j1',
        title: 'Orphan',
        icon: 'book',
        date: '2026-01-01',
        secure: false,
      }),
    );
    zip.file(
      'pages/p1.json',
      JSON.stringify({
        id: 'p1',
        text: 'T',
        date: '2026-01-01',
        tags: [],
        files: [],
        images: [],
        comments: [],
        modified: 1,
        deleted: false,
      }),
    );
    zip.file('attachments/image-orphan1.jpg', 'data');
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await importJournal('blob:mock', 'Orphan');
    expect(result.journalId).toBeTruthy();
    expect(result.attachmentErrors).toBeUndefined();
  });

  it('collects attachment save errors without failing import', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        journalTitle: 'Err',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({ id: 'j1', title: 'Err', icon: 'book', date: '2026-01-01', secure: false }),
    );
    zip.file(
      'pages/p1.json',
      JSON.stringify({
        id: 'p1',
        text: 'T',
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
        modified: 1,
        deleted: false,
      }),
    );
    zip.file('attachments/image-att1.jpg', 'fakeimagebytes');
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    jest.spyOn(mockTestStore, 'saveAttachmentStream').mockRejectedValueOnce(new Error('Disk full'));

    const result = await importJournal('blob:mock', 'Err');
    expect(result.attachmentErrors).toBeDefined();
    expect(result.attachmentErrors).toHaveLength(1);
    expect(result.attachmentErrors![0].error).toBe('Disk full');
    const stored = await mockTestStore.getJournal(result.journalId);
    expect(stored!.pages[0].images[0].path).toBe('');
  });

  it('rewrites file attachment paths during import', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        journalTitle: 'Files',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({ id: 'j1', title: 'Files', icon: 'book', date: '2026-01-01', secure: false }),
    );
    zip.file(
      'pages/p1.json',
      JSON.stringify({
        id: 'p1',
        text: 'T',
        date: '2026-01-01',
        tags: [],
        files: [
          {
            id: 'f1',
            path: 'file-f1.pdf',
            name: 'doc.pdf',
            type: 'file',
            encrypted: false,
            deleted: false,
          },
        ],
        images: [],
        comments: [],
        modified: 1,
        deleted: false,
      }),
    );
    zip.file('attachments/file-f1.pdf', 'fakepdfdata');
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await importJournal('blob:mock', 'Files');
    const stored = await mockTestStore.getJournal(result.journalId);
    expect(stored).not.toBeNull();
    expect(stored!.pages[0].files).toHaveLength(1);
    expect(stored!.pages[0].files[0].path).toBeTruthy();
    expect(stored!.pages[0].files[0].path).not.toBe('file-f1.pdf');
  });

  it('throws when encrypted journal decryption fails with wrong key', async () => {
    const correctKey = new Uint8Array(32);
    correctKey.fill(0xab);
    const wrongKey = new Uint8Array(32);
    wrongKey.fill(0xcd);

    const journal = {
      id: 'j1',
      title: 'Bad Key',
      icon: 'lock',
      date: '2026-01-01',
      secure: true,
    };

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: true,
        salt: 'dGVzdA==',
        kdfIterations: 50000,
        journalTitle: 'Bad Key',
      }),
    );
    zip.file('journal.json', await aesGcmEncryptBytes(JSON.stringify(journal), correctKey));
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    // Use wrong key — readEntry will fail to decrypt
    await expect(importJournal('blob:mock', 'Bad Key', wrongKey)).rejects.toThrow();
  });

  it('throws when encrypted attachment decryption fails', async () => {
    const key = new Uint8Array(32);
    key.fill(0xab);
    const wrongKey = new Uint8Array(32);
    wrongKey.fill(0xcd);

    const page = {
      id: 'p1',
      text: 'T',
      date: '2026-01-01',
      tags: [],
      files: [],
      images: [
        {
          id: 'att1',
          path: 'image-att1.jpg',
          name: 'photo.jpg',
          type: 'image',
          encrypted: true,
          deleted: false,
        },
      ],
      comments: [],
      modified: 1000,
      deleted: false,
    };
    const journal = {
      id: 'j1',
      title: 'Dec Fail',
      icon: 'lock',
      date: '2026-01-01',
      secure: true,
      salt: 'dGVzdA==',
      kdfIterations: 50000,
    };

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: true,
        salt: 'dGVzdA==',
        kdfIterations: 50000,
        journalTitle: 'Dec Fail',
      }),
    );
    zip.file('journal.json', await aesGcmEncryptBytes(JSON.stringify(journal), key));
    zip.file(
      'settings.json',
      await aesGcmEncryptBytes(
        JSON.stringify({
          use24h: false,
          previewTags: true,
          previewThumbnail: true,
          previewIcons: true,
          filterBar: true,
          sort: 'descending',
          autoLocation: false,
          remoteSync: false,
          autoSync: false,
        }),
        key,
      ),
    );
    zip.file('pages/p1.json', await aesGcmEncryptBytes(JSON.stringify(page), key));
    // Encrypt attachment with WRONG key so attachment decryption fails
    zip.file('attachments/image-att1.jpg', await aesGcmEncryptBytes('data', wrongKey));
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(importJournal('blob:mock', 'Dec Fail', key)).rejects.toThrow();
  });

  it('throws on missing manifest (import)', async () => {
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

  it('rolls back a journal when IndexedDB readback fails', async () => {
    const key = new Uint8Array(32).fill(0xab);
    await prepareTransactionalImportZip(true);

    jest.spyOn(mockTestStore, 'getJournal').mockRejectedValue(new Error('unreadable metadata'));
    const deleteSpy = jest.spyOn(mockTestStore, 'deleteJournal');

    await expect(importJournal('blob:mock', 'Imported journal', key)).rejects.toThrow(
      'Imported journal failed storage verification: unreadable metadata',
    );

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    const importedId = deleteSpy.mock.calls[0][0];
    expect(importedId).not.toBe('source-journal');
    expect(mockTestStore.getJournal).toHaveBeenCalledWith(importedId, key);
    expect(await mockTestStore.listJournals()).toEqual([]);
  });

  it('keeps the original write error when rollback cleanup fails', async () => {
    await prepareTransactionalImportZip();

    jest.spyOn(mockTestStore, 'saveJournal').mockRejectedValue(new Error('quota exceeded'));
    const deleteSpy = jest
      .spyOn(mockTestStore, 'deleteJournal')
      .mockRejectedValue(new Error('cleanup failed'));
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(importJournal('blob:mock', 'Imported journal')).rejects.toThrow(
      'Imported journal failed storage verification: quota exceeded',
    );

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy.mock.calls[0][0]).not.toBe('source-journal');
    consoleWarnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Import settings validation (web)
// ---------------------------------------------------------------------------

describe('importJournal settings validation (web)', () => {
  it('imports backup with valid settings unchanged', async () => {
    const validSettings = {
      use24h: true,
      previewTags: false,
      previewThumbnail: true,
      previewIcons: true,
      filterBar: false,
      sort: 'ascending',
      autoLocation: true,
      remoteSync: false,
      autoSync: false,
    };

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        journalTitle: 'Valid Settings',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({
        id: 'j1',
        title: 'Valid Settings',
        icon: 'book',
        date: '2026-01-01',
        secure: false,
      }),
    );
    zip.file('settings.json', JSON.stringify(validSettings));
    zip.file('pages/p1.json', JSON.stringify(makePage('p1', 'test')));
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await importJournal('blob:mock', 'Valid Settings');
    const loaded = await mockTestStore.getJournal(result.journalId);
    expect(loaded).not.toBeNull();
    expect(loaded!.settings.use24h).toBe(true);
    expect(loaded!.settings.sort).toBe('ascending');
    expect(loaded!.settings.filterBar).toBe(false);
  });

  it('rejects backup with invalid settings', async () => {
    const invalidSettings = {
      use24h: false,
      previewTags: true,
      previewThumbnail: true,
      previewIcons: true,
      filterBar: true,
      sort: 'invalid', // not a valid sort value
      autoLocation: false,
      remoteSync: false,
      autoSync: false,
    };

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        journalTitle: 'Bad Settings',
      }),
    );
    zip.file(
      'journal.json',
      JSON.stringify({
        id: 'j1',
        title: 'Bad Settings',
        icon: 'book',
        date: '2026-01-01',
        secure: false,
      }),
    );
    zip.file('settings.json', JSON.stringify(invalidSettings));
    zip.file('pages/p1.json', JSON.stringify(makePage('p1', 'test')));
    fetchResponse = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(importJournal('blob:mock', 'Bad Settings')).rejects.toThrow();
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
