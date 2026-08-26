import type { JournalContent, Page } from 'canto-data';
import { DEFAULT_JOURNAL_SETTINGS } from 'canto-data';
import { SCHEMA_VERSION } from 'canto-data/version';

const mockOpenNativeArchive = jest.fn();
const mockReadNativeArchiveText = jest.fn();
const mockCloseNativeArchive = jest.fn();
const mockAvailableBytes = jest.fn();
const mockExtractNativeArchiveEntry = jest.fn();
const mockNativeAttachmentChunks = jest.fn();
const mockGenerateImportThumbnail = jest.fn();
const mockExtractedBytes = new Map<string, Uint8Array>();
let mockStore: Record<string, jest.Mock>;

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists() {
      return mockExtractedBytes.has(this.uri);
    }
    get size() {
      return mockExtractedBytes.get(this.uri)?.length ?? 0;
    }
    create() {}
    delete() {
      mockExtractedBytes.delete(this.uri);
    }
    async bytes() {
      return mockExtractedBytes.get(this.uri) ?? new Uint8Array();
    }
  }
  return { File: MockFile, Paths: { cache: { uri: 'file:///cache' } } };
});

jest.mock('../backup/native-archive', () => ({
  openNativeArchive: (...args: unknown[]) => mockOpenNativeArchive(...args),
  readNativeArchiveText: (...args: unknown[]) => mockReadNativeArchiveText(...args),
  closeNativeArchive: (...args: unknown[]) => mockCloseNativeArchive(...args),
  nativeArchiveAvailableBytes: (...args: unknown[]) => mockAvailableBytes(...args),
  extractNativeArchiveEntry: (...args: unknown[]) => mockExtractNativeArchiveEntry(...args),
}));

jest.mock('@/hooks/useStorage', () => ({
  getLocalStore: () => Promise.resolve(mockStore),
}));

jest.mock('@/lib/storage/attachment-ingestion', () => ({
  nativeAttachmentChunks: (...args: unknown[]) => mockNativeAttachmentChunks(...args),
}));

jest.mock('../backup/import-thumbnail', () => ({
  base64AttachmentChunks: jest.fn(),
  generateImportThumbnailFromChunks: (...args: unknown[]) => mockGenerateImportThumbnail(...args),
}));

import { importNativeJournal } from '../backup/native-importer';
import { MAX_LEGACY_ENCRYPTED_ENTRY_BYTES } from '../backup/native-importer';
import { aesGcmEncryptBytes } from '@/lib/encryption/utils';

const manifest = {
  version: 1,
  appVersion: '0.19.2',
  exportDate: '2026-08-25T00:00:00Z',
  encrypted: false,
  journalTitle: 'Source',
};

function makePage(): Page {
  return {
    id: 'source-page',
    text: 'hello',
    date: '2026-08-25T00:00:00Z',
    tags: [],
    files: [],
    images: [],
    comments: [],
    modified: 1,
    deleted: false,
  };
}

function makeJournal(): JournalContent {
  return {
    id: 'source-journal',
    title: 'Source',
    icon: 'book',
    date: '2026-08-25T00:00:00Z',
    secure: false,
    salt: 'dGVzdA==',
    pages: [],
    settings: { ...DEFAULT_JOURNAL_SETTINGS },
    schemaVersion: SCHEMA_VERSION,
    version: 1,
  };
}

beforeEach(() => {
  const archive = {
    id: 'archive-1',
    entries: [
      { name: 'manifest.json', size: 100, directory: false },
      { name: 'journal.json', size: 100, directory: false },
      { name: 'pages/source-page.json', size: 100, directory: false },
    ],
  };
  let persisted: JournalContent | null = null;
  mockStore = {
    beginJournalImport: jest.fn().mockResolvedValue(undefined),
    updateJournalImport: jest.fn().mockResolvedValue(undefined),
    completeJournalImport: jest.fn().mockResolvedValue(undefined),
    abortJournalImport: jest.fn().mockResolvedValue(undefined),
    saveJournal: jest.fn(async (journal: JournalContent) => {
      persisted = journal;
    }),
    getJournal: jest.fn(async () => persisted),
    getJournalOverview: jest.fn(async () => {
      if (!persisted) return null;
      const { pages, ...metadata } = persisted;
      return {
        metadata,
        pages: pages.map((page) => ({ id: page.id })),
        tags: [],
        latestModified: 0,
      };
    }),
    saveAttachmentStream: jest.fn(),
    saveAttachment: jest.fn(),
  };
  mockOpenNativeArchive.mockReset().mockResolvedValue(archive);
  mockReadNativeArchiveText.mockReset().mockImplementation(async (_archive, name: string) => {
    if (name === 'manifest.json') return JSON.stringify(manifest);
    if (name === 'journal.json') return JSON.stringify(makeJournal());
    if (name === 'pages/source-page.json') return JSON.stringify(makePage());
    throw new Error(`unexpected entry ${name}`);
  });
  mockCloseNativeArchive.mockReset().mockResolvedValue(undefined);
  mockAvailableBytes.mockReset().mockResolvedValue(1024 * 1024 * 1024);
  mockExtractNativeArchiveEntry.mockReset();
  mockNativeAttachmentChunks.mockReset().mockImplementation(async function* () {
    yield 'AQI=';
    yield 'Aw==';
  });
  mockGenerateImportThumbnail.mockReset().mockResolvedValue(null);
  mockExtractedBytes.clear();
});

describe('importNativeJournal', () => {
  it('preflights, stages an invisible import, and publishes only after readback', async () => {
    const progress: string[] = [];

    const result = await importNativeJournal('content://backup', 'Imported', undefined, (event) => {
      progress.push(event.phase);
    });

    expect(mockStore.beginJournalImport).toHaveBeenCalledWith(result.journalId);
    expect(mockStore.updateJournalImport).toHaveBeenNthCalledWith(1, result.journalId, 'writing');
    expect(mockStore.saveJournal).toHaveBeenCalledTimes(1);
    expect(mockStore.getJournalOverview).toHaveBeenCalledWith(result.journalId, undefined);
    expect(mockStore.getJournal).not.toHaveBeenCalled();
    expect(mockStore.completeJournalImport).toHaveBeenCalledWith(result.journalId);
    expect(mockStore.updateJournalImport).toHaveBeenNthCalledWith(
      2,
      result.journalId,
      'publishing',
      { expectedPageCount: 1 },
    );
    expect(mockStore.updateJournalImport).toHaveBeenNthCalledWith(3, result.journalId, 'committed');
    expect(mockStore.abortJournalImport).not.toHaveBeenCalled();
    expect(progress).toEqual(['preparing', 'pages', 'finalizing']);
  });

  it('fails the space preflight before allocating a journal import', async () => {
    mockAvailableBytes.mockResolvedValueOnce(1);

    await expect(importNativeJournal('content://backup', 'Imported')).rejects.toThrow(
      'Insufficient device storage',
    );

    expect(mockStore.beginJournalImport).not.toHaveBeenCalled();
    expect(mockStore.saveJournal).not.toHaveBeenCalled();
    expect(mockCloseNativeArchive).toHaveBeenCalledTimes(1);
  });

  it('honors cancellation before allocating a journal import', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      importNativeJournal('content://backup', 'Imported', undefined, undefined, controller.signal),
    ).rejects.toThrow('Backup import cancelled');

    expect(mockStore.beginJournalImport).not.toHaveBeenCalled();
    expect(mockStore.saveJournal).not.toHaveBeenCalled();
  });

  it('rejects an oversized encrypted legacy attachment before allocating local storage', async () => {
    mockOpenNativeArchive.mockResolvedValue({
      id: 'encrypted-archive',
      entries: [
        { name: 'manifest.json', size: 100, directory: false },
        { name: 'journal.json', size: 100, directory: false },
        {
          name: 'attachments/image-a.jpg',
          size: MAX_LEGACY_ENCRYPTED_ENTRY_BYTES + 1,
          directory: false,
        },
      ],
    });
    mockReadNativeArchiveText.mockImplementationOnce(async () =>
      JSON.stringify({ ...manifest, encrypted: true }),
    );

    await expect(
      importNativeJournal('content://backup', 'Imported', new Uint8Array(32)),
    ).rejects.toThrow('attachment too large to import safely');

    expect(mockStore.beginJournalImport).not.toHaveBeenCalled();
    expect(mockStore.saveJournal).not.toHaveBeenCalled();
  });

  it('imports bounded encrypted metadata through a one-entry compatibility read', async () => {
    const key = new Uint8Array(32).fill(7);
    const encryptedJournal = await aesGcmEncryptBytes(
      JSON.stringify({ ...makeJournal(), secure: true }),
      key,
    );
    const uri = 'file:///cache/encrypted-journal';
    mockExtractedBytes.set(uri, encryptedJournal);
    mockOpenNativeArchive.mockResolvedValueOnce({
      id: 'encrypted-archive',
      entries: [
        { name: 'manifest.json', size: 100, directory: false },
        { name: 'journal.json', size: encryptedJournal.length, directory: false },
      ],
    });
    mockReadNativeArchiveText.mockImplementationOnce(async () =>
      JSON.stringify({ ...manifest, encrypted: true }),
    );
    mockExtractNativeArchiveEntry.mockResolvedValueOnce({ uri, size: encryptedJournal.length });

    const result = await importNativeJournal('content://backup', 'Imported', key);

    expect(mockStore.saveJournal).toHaveBeenCalledWith(
      expect.objectContaining({ id: result.journalId, title: 'Imported' }),
      key,
    );
    expect(mockExtractNativeArchiveEntry).toHaveBeenCalledWith(
      expect.anything(),
      'journal.json',
      expect.any(String),
      undefined,
    );
  });

  it('rolls back the marker when final publication fails', async () => {
    mockStore.saveJournal.mockRejectedValueOnce(new Error('disk full'));

    await expect(importNativeJournal('content://backup', 'Imported')).rejects.toThrow('disk full');

    expect(mockStore.beginJournalImport).toHaveBeenCalledTimes(1);
    expect(mockStore.completeJournalImport).not.toHaveBeenCalled();
    expect(mockStore.abortJournalImport).toHaveBeenCalledWith(
      mockStore.beginJournalImport.mock.calls[0][0],
    );
  });

  it('streams owned attachments, persists descriptors, and retains attachment failures as warnings', async () => {
    const sourcePage = {
      ...makePage(),
      images: [
        {
          id: 'image-1',
          path: 'image-image-1.jpg',
          name: 'photo.jpg',
          type: 'image' as const,
          encrypted: false,
          deleted: false,
        },
      ],
    };
    mockOpenNativeArchive.mockResolvedValue({
      id: 'archive-with-image',
      entries: [
        { name: 'manifest.json', size: 100, directory: false },
        { name: 'journal.json', size: 100, directory: false },
        { name: 'pages/source-page.json', size: 100, directory: false },
        { name: 'attachments/image-image-1.jpg', size: 3, directory: false },
        { name: 'attachments/unrecognized.bin', size: 1, directory: false },
      ],
    });
    mockReadNativeArchiveText.mockImplementation(async (_archive, name: string) => {
      if (name === 'manifest.json') return JSON.stringify(manifest);
      if (name === 'journal.json') return JSON.stringify(makeJournal());
      if (name === 'pages/source-page.json') return JSON.stringify(sourcePage);
      throw new Error(`unexpected entry ${name}`);
    });
    mockExtractedBytes.set('file:///attachment-image', new Uint8Array([1, 2, 3]));
    mockExtractNativeArchiveEntry.mockResolvedValue({ uri: 'file:///attachment-image', size: 3 });
    mockGenerateImportThumbnail.mockResolvedValueOnce('thumbnail-data');
    mockStore.saveAttachmentStream.mockResolvedValueOnce('canto/imported/image-1');

    const result = await importNativeJournal('content://backup', 'Imported');
    const saved = mockStore.saveJournal.mock.calls[0][0] as JournalContent;

    expect(mockStore.saveAttachmentStream).toHaveBeenCalledWith(
      result.journalId,
      saved.pages[0].id,
      expect.objectContaining({ type: 'image', size: 3, content: expect.any(Object) }),
      expect.anything(),
      undefined,
    );
    expect(saved.pages[0].thumbnail).toBe('thumbnail-data');
    expect(saved.pages[0].images[0]).toMatchObject({
      path: 'canto/imported/image-1',
      size: 3,
      type: 'image',
    });
    expect(result.skippedAttachments).toEqual(['unrecognized.bin']);

    mockStore.saveAttachmentStream.mockRejectedValueOnce(new Error('disk full'));
    const failed = await importNativeJournal('content://backup', 'Imported');
    expect(failed.attachmentErrors).toEqual([
      expect.objectContaining({ name: 'photo.jpg', error: 'disk full' }),
    ]);
  });

  it('imports bounded encrypted attachments through the compatibility reader', async () => {
    const key = new Uint8Array(32).fill(7);
    const sourcePage = {
      ...makePage(),
      files: [
        {
          id: 'file-1',
          path: 'file-file-1.bin',
          name: 'secret.bin',
          type: 'file' as const,
          encrypted: true,
          deleted: false,
        },
      ],
    };
    const encryptedJournal = await aesGcmEncryptBytes(
      JSON.stringify({ ...makeJournal(), secure: true }),
      key,
    );
    const encryptedPage = await aesGcmEncryptBytes(JSON.stringify(sourcePage), key);
    const encryptedAttachment = await aesGcmEncryptBytes('AQI=', key);
    const locations = new Map([
      ['journal.json', 'file:///encrypted-journal'],
      ['pages/source-page.json', 'file:///encrypted-page'],
      ['attachments/file-file-1.bin', 'file:///encrypted-attachment'],
    ]);
    mockExtractedBytes.set('file:///encrypted-journal', encryptedJournal);
    mockExtractedBytes.set('file:///encrypted-page', encryptedPage);
    mockExtractedBytes.set('file:///encrypted-attachment', encryptedAttachment);
    mockOpenNativeArchive.mockResolvedValue({
      id: 'encrypted-archive',
      entries: [
        { name: 'manifest.json', size: 100, directory: false },
        { name: 'journal.json', size: encryptedJournal.length, directory: false },
        { name: 'pages/source-page.json', size: encryptedPage.length, directory: false },
        { name: 'attachments/file-file-1.bin', size: encryptedAttachment.length, directory: false },
      ],
    });
    mockReadNativeArchiveText.mockImplementation(async (_archive, name: string) => {
      if (name === 'manifest.json') return JSON.stringify({ ...manifest, encrypted: true });
      throw new Error(`unexpected plaintext read: ${name}`);
    });
    mockExtractNativeArchiveEntry.mockImplementation(async (_archive, name: string) => ({
      uri: locations.get(name)!,
      size: mockExtractedBytes.get(locations.get(name)!)!.length,
    }));
    mockStore.saveAttachment.mockResolvedValueOnce('canto/imported/file-1');

    const result = await importNativeJournal('content://backup', 'Imported', key);
    const saved = mockStore.saveJournal.mock.calls[0][0] as JournalContent;
    expect(mockStore.saveAttachment).toHaveBeenCalledWith(
      result.journalId,
      saved.pages[0].id,
      expect.objectContaining({ type: 'file', encrypted: true }),
      'AQI=',
      key,
    );
    expect(saved.pages[0].files[0].path).toBe('canto/imported/file-1');
  });

  it('rejects encrypted archives without a password before beginning a local import', async () => {
    mockReadNativeArchiveText.mockImplementationOnce(async () =>
      JSON.stringify({ ...manifest, encrypted: true }),
    );

    await expect(importNativeJournal('content://backup', 'Imported')).rejects.toThrow(
      'Encrypted backup requires a password',
    );
    expect(mockStore.beginJournalImport).not.toHaveBeenCalled();
  });

  it('derives a legacy empty-password key and imports optional settings', async () => {
    const settings = { ...DEFAULT_JOURNAL_SETTINGS, use24h: true };
    mockOpenNativeArchive.mockResolvedValue({
      id: 'legacy-salt-archive',
      entries: [
        { name: 'manifest.json', size: 100, directory: false },
        { name: 'journal.json', size: 100, directory: false },
        { name: 'settings.json', size: 100, directory: false },
      ],
    });
    mockReadNativeArchiveText.mockImplementation(async (_archive, name: string) => {
      if (name === 'manifest.json') {
        return JSON.stringify({ ...manifest, salt: 'dGVzdA==', kdfIterations: 1 });
      }
      if (name === 'journal.json') return JSON.stringify(makeJournal());
      if (name === 'settings.json') return JSON.stringify(settings);
      throw new Error(`unexpected entry ${name}`);
    });

    await importNativeJournal('content://backup', 'Imported');
    expect((mockStore.saveJournal.mock.calls[0][0] as JournalContent).settings.use24h).toBe(true);
  });

  it('rolls back on an extraction-size mismatch and turns unavailable streaming into an attachment warning', async () => {
    const imagePage = {
      ...makePage(),
      images: [
        {
          id: 'image-1',
          path: 'image-image-1.jpg',
          name: 'photo.jpg',
          type: 'image' as const,
          encrypted: false,
          deleted: false,
        },
      ],
    };
    const archive = {
      id: 'attachment-archive',
      entries: [
        { name: 'manifest.json', size: 100, directory: false },
        { name: 'journal.json', size: 100, directory: false },
        { name: 'pages/source-page.json', size: 100, directory: false },
        { name: 'attachments/image-image-1.jpg', size: 3, directory: false },
      ],
    };
    mockOpenNativeArchive.mockResolvedValue(archive);
    mockReadNativeArchiveText.mockImplementation(async (_archive, name: string) => {
      if (name === 'manifest.json') return JSON.stringify(manifest);
      if (name === 'journal.json') return JSON.stringify(makeJournal());
      if (name === 'pages/source-page.json') return JSON.stringify(imagePage);
      throw new Error(`unexpected entry ${name}`);
    });
    mockExtractNativeArchiveEntry.mockResolvedValueOnce({ uri: 'file:///short', size: 2 });
    mockExtractedBytes.set('file:///short', new Uint8Array([1, 2]));

    await expect(importNativeJournal('content://backup', 'Imported')).rejects.toThrow(
      'Attachment extraction length mismatch',
    );
    expect(mockStore.abortJournalImport).toHaveBeenCalled();

    mockExtractNativeArchiveEntry.mockResolvedValue({ uri: 'file:///exact', size: 3 });
    mockExtractedBytes.set('file:///exact', new Uint8Array([1, 2, 3]));
    delete mockStore.saveAttachmentStream;
    const result = await importNativeJournal('content://backup', 'Imported');
    expect(result.attachmentErrors).toEqual([
      expect.objectContaining({ error: 'Chunked attachment import is unavailable on this device' }),
    ]);
  });
});
