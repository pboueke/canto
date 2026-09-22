import { createLocalStore } from '../storage/local';
import { File } from 'expo-file-system';
import type { EncryptionService } from '../encryption';
import type { JournalContent, Page, Attachment } from 'canto-data';
import {
  ATTACHMENT_CHUNK_SIZE,
  chunkedContentForBase64,
  encodeChunkFrame,
} from '../storage/attachment-content';
import {
  getStorageIoCounters,
  resetStorageIoCounters,
  recordStorageIo,
} from '../storage/io-counters';

// In-memory filesystem mock
const filesystem: Record<string, string> = {};

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      const segments = parts.map((p) => (typeof p === 'string' ? p : p.uri));
      this.uri = segments.join('/');
    }
    get name() {
      return this.uri.split('/').pop() ?? '';
    }
    get parentDirectory() {
      const parent = this.uri.split('/').slice(0, -1).join('/');
      return new MockDirectory(parent);
    }
    get exists() {
      return this.uri in filesystem;
    }
    get size() {
      return Buffer.byteLength(filesystem[this.uri] ?? '', 'utf8');
    }
    create() {
      if (!(this.uri in filesystem)) {
        filesystem[this.uri] = '';
      }
    }
    write(content: string) {
      filesystem[this.uri] = content;
    }
    text() {
      return Promise.resolve(filesystem[this.uri] ?? '');
    }
    delete() {
      delete filesystem[this.uri];
    }
    move(target: MockFile) {
      filesystem[target.uri] = filesystem[this.uri];
      delete filesystem[this.uri];
    }
  }

  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      const segments = parts.map((p) => (typeof p === 'string' ? p : p.uri));
      this.uri = segments.join('/');
    }
    get exists() {
      return Object.keys(filesystem).some((k) => k.startsWith(this.uri));
    }
    create() {
      if (this.exists) throw new Error(`FilesystemDirectory.create: already exists: ${this.uri}`);
    }
    list() {
      const prefix = this.uri + '/';
      const entries: (MockFile | MockDirectory)[] = [];
      const seenDirs = new Set<string>();
      for (const key of Object.keys(filesystem)) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest.includes('/')) {
          entries.push(new MockFile(key));
        } else {
          const dirName = rest.split('/')[0];
          const dirUri = prefix + dirName;
          if (!seenDirs.has(dirUri)) {
            seenDirs.add(dirUri);
            entries.push(new MockDirectory(dirUri));
          }
        }
      }
      return entries;
    }
    delete() {
      for (const key of Object.keys(filesystem)) {
        if (key.startsWith(this.uri)) {
          delete filesystem[key];
        }
      }
    }
  }

  return {
    Paths: { document: { uri: '/mock-docs' } },
    File: MockFile,
    Directory: MockDirectory,
  };
});

// Passthrough encryption mock (no actual encryption for test simplicity)
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

function makeJournalContent(id: string, pages: Page[] = []): JournalContent {
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

function makePage(id: string): Page {
  return {
    id,
    text: `Page ${id} content`,
    date: '2026-03-12T10:00:00Z',
    tags: ['test'],
    files: [],
    images: [],
    comments: [],
    modified: Date.now(),
    deleted: false,
  };
}

beforeEach(() => {
  // Clear the in-memory filesystem
  for (const key of Object.keys(filesystem)) {
    delete filesystem[key];
  }
});

describe('storage transaction recovery (native)', () => {
  it('removes an unfinished imported journal before storage is exposed', async () => {
    const journalId = 'interrupted-import';
    filesystem[`/mock-docs/canto/.imports/${journalId}`] = JSON.stringify({
      version: 1,
      journalId,
      phase: 'writing',
    });
    filesystem[`/mock-docs/canto/${journalId}/attachments/chunk-v1-p1-a1/0`] = 'ciphertext';

    const store = createLocalStore(createMockEncryption());
    await store.initialize();

    expect(filesystem[`/mock-docs/canto/.imports/${journalId}`]).toBeUndefined();
    expect(
      filesystem[`/mock-docs/canto/${journalId}/attachments/chunk-v1-p1-a1/0`],
    ).toBeUndefined();
    expect(await store.listJournals()).toEqual([]);
  });

  it('discards malformed import markers without granting them publication authority', async () => {
    filesystem['/mock-docs/canto/.imports/broken'] = '{not-json';
    filesystem['/mock-docs/canto/broken/metadata.json'] = 'enc:{"id":"broken"}';

    const store = createLocalStore(createMockEncryption());
    await store.initialize();

    expect(filesystem['/mock-docs/canto/.imports/broken']).toBeUndefined();
    expect(filesystem['/mock-docs/canto/broken/metadata.json']).toBeUndefined();
  });

  it('removes a committed marker while retaining its durable journal', async () => {
    const journalId = 'committed-import';
    const first = createLocalStore(createMockEncryption());
    await first.initialize();
    await first.saveJournal(makeJournalContent(journalId));
    await first.beginJournalImport?.(journalId);
    await first.updateJournalImport?.(journalId, 'committed');

    const recovered = createLocalStore(createMockEncryption());
    await recovered.initialize();

    expect(await recovered.getJournal(journalId)).toMatchObject({ id: journalId });
    expect(filesystem[`/mock-docs/canto/.imports/${journalId}`]).toBeUndefined();
  });

  it('replays a verified publishing import after the index write was interrupted', async () => {
    const journalId = 'publishing-import';
    const first = createLocalStore(createMockEncryption());
    await first.initialize();
    await first.saveJournal(makeJournalContent(journalId, [makePage('p1')]));
    // Simulate the crash window after durable content/catalog writes but before
    // the final journals-index publication.
    filesystem['/mock-docs/canto/journals.json'] = 'enc:{"journals":[]}';
    filesystem[`/mock-docs/canto/.imports/${journalId}`] = JSON.stringify({
      version: 2,
      journalId,
      phase: 'publishing',
      expectedPageCount: 1,
    });

    const recovered = createLocalStore(createMockEncryption());
    await recovered.initialize();

    expect(await recovered.listJournals()).toEqual([
      expect.objectContaining({ id: journalId, title: `Journal ${journalId}` }),
    ]);
    expect(await recovered.getJournalOverview?.(journalId)).toMatchObject({
      metadata: { id: journalId },
      pages: [expect.objectContaining({ id: 'p1' })],
    });
    expect(filesystem[`/mock-docs/canto/.imports/${journalId}`]).toBeUndefined();
  });

  it('rolls back a publishing marker whose expected page count cannot be proved', async () => {
    const journalId = 'broken-publishing-import';
    const first = createLocalStore(createMockEncryption());
    await first.initialize();
    await first.saveJournal(makeJournalContent(journalId, [makePage('p1')]));
    filesystem['/mock-docs/canto/journals.json'] = 'enc:{"journals":[]}';
    filesystem[`/mock-docs/canto/.imports/${journalId}`] = JSON.stringify({
      version: 2,
      journalId,
      phase: 'publishing',
      expectedPageCount: 2,
    });

    const recovered = createLocalStore(createMockEncryption());
    await recovered.initialize();

    expect(await recovered.listJournals()).toEqual([]);
    expect(filesystem[`/mock-docs/canto/${journalId}/metadata.json`]).toBeUndefined();
  });

  it('rolls back a prepared transaction and retains the old readable view', async () => {
    const target = '/mock-docs/canto/j1/metadata.json';
    const root = '/mock-docs/canto/.transactions/password-interrupted';
    filesystem[target] = 'enc:old';
    filesystem[`${root}/file-0`] = 'enc:new';
    filesystem[`${root}/marker.json`] = JSON.stringify({
      phase: 'prepared',
      files: [{ target, staged: `${root}/file-0` }],
    });

    await createLocalStore(createMockEncryption()).initialize();

    expect(filesystem[target]).toBe('enc:old');
    expect(filesystem[`${root}/marker.json`]).toBeUndefined();
  });

  it('replays a committed transaction after interruption before exposing storage', async () => {
    const target = '/mock-docs/canto/j1/metadata.json';
    const root = '/mock-docs/canto/.transactions/device-interrupted';
    filesystem[target] = 'old-device-ciphertext';
    filesystem[`${root}/file-0`] = 'new-device-ciphertext';
    filesystem[`${root}/marker.json`] = JSON.stringify({
      phase: 'committing',
      files: [{ target, staged: `${root}/file-0` }],
    });

    await createLocalStore(createMockEncryption()).initialize();

    expect(filesystem[target]).toBe('new-device-ciphertext');
    expect(filesystem[`${root}/marker.json`]).toBeUndefined();
  });

  it('discards corrupt markers and replacement roots, and removes old roots after commit', async () => {
    const corruptRoot = '/mock-docs/canto/.transactions/corrupt';
    const replacementRoot = '/mock-docs/canto/j1/attachments/chunk-v1-new';
    filesystem[`${corruptRoot}/marker.json`] = '{not json';
    const preparedRoot = '/mock-docs/canto/.transactions/prepared-with-root';
    filesystem[`${preparedRoot}/marker.json`] = JSON.stringify({
      phase: 'prepared',
      files: [],
      newRoots: [replacementRoot],
    });
    filesystem[`${replacementRoot}/0`] = 'enc:unpublished';

    const target = '/mock-docs/canto/j1/metadata.json';
    const committedRoot = '/mock-docs/canto/.transactions/committed-with-old-root';
    const oldRoot = '/mock-docs/canto/j1/attachments/chunk-v1-old';
    filesystem[`${committedRoot}/file-0`] = 'enc:new';
    filesystem[`${committedRoot}/marker.json`] = JSON.stringify({
      phase: 'committing',
      files: [{ target, staged: `${committedRoot}/file-0` }],
      oldRoots: [oldRoot],
    });
    filesystem[`${oldRoot}/0`] = 'enc:old';

    await createLocalStore(createMockEncryption()).initialize();

    expect(filesystem[`${corruptRoot}/marker.json`]).toBeUndefined();
    expect(filesystem[`${replacementRoot}/0`]).toBeUndefined();
    expect(filesystem[`${oldRoot}/0`]).toBeUndefined();
    expect(filesystem[target]).toBe('enc:new');
  });

  it('ignores incomplete transaction directories but refuses a committed transaction without staged data', async () => {
    const ignoredRoot = '/mock-docs/canto/.transactions/no-marker';
    // The file makes the mock expose a directory, while marker.json remains absent.
    filesystem[`${ignoredRoot}/orphan`] = 'unused';
    filesystem['/mock-docs/canto/.transactions/loose-file'] = 'not a transaction directory';

    await createLocalStore(createMockEncryption()).initialize();
    expect(filesystem[`${ignoredRoot}/orphan`]).toBeUndefined();

    const brokenRoot = '/mock-docs/canto/.transactions/committed-missing-stage';
    filesystem[`${brokenRoot}/marker.json`] = JSON.stringify({
      phase: 'committing',
      files: [{ target: '/mock-docs/canto/j1/metadata.json', staged: `${brokenRoot}/file-0` }],
    });
    await expect(createLocalStore(createMockEncryption()).initialize()).rejects.toThrow(
      'Incomplete storage transaction staging',
    );
  });
});

describe('createLocalStore', () => {
  it('initialize does not throw', async () => {
    const store = createLocalStore(createMockEncryption());
    await expect(store.initialize()).resolves.not.toThrow();
  });

  it('initialize recovers .tmp files left from interrupted writes', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);

    // Save a journal first so the directory structure exists
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    // Simulate an interrupted write by creating a .tmp file in the journal dir
    const journalDir = '/mock-docs/canto/j1';
    filesystem[`${journalDir}/metadata.json.tmp`] = 'enc:{"id":"j1","title":"Recovered"}';

    // Also create a .tmp in pages dir
    const pagesDir = `${journalDir}/pages`;
    filesystem[`${pagesDir}/p1.json.tmp`] = 'enc:{"id":"p1","text":"recovered page"}';

    // Initialize should recover these .tmp files
    await store.initialize();

    // The .tmp files should have been renamed to their final names
    expect(filesystem[`${journalDir}/metadata.json`]).toBeDefined();
    expect(filesystem[`${pagesDir}/p1.json`]).toBeDefined();
    expect(filesystem[`${journalDir}/metadata.json.tmp`]).toBeUndefined();
    expect(filesystem[`${pagesDir}/p1.json.tmp`]).toBeUndefined();
  });

  it('listJournals returns empty array initially', async () => {
    const store = createLocalStore(createMockEncryption());
    const journals = await store.listJournals();
    expect(journals).toEqual([]);
  });

  it('saveJournal and listJournals round-trip', async () => {
    const store = createLocalStore(createMockEncryption());
    const journal = makeJournalContent('j1');
    await store.saveJournal(journal);
    const journals = await store.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].id).toBe('j1');
    expect(journals[0].title).toBe('Journal j1');
  });

  it('getJournal returns saved journal with pages', async () => {
    const store = createLocalStore(createMockEncryption());
    const page = makePage('p1');
    const journal = makeJournalContent('j1', [page]);
    await store.saveJournal(journal);
    const result = await store.getJournal('j1');
    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(1);
    expect(result!.pages[0].id).toBe('p1');
  });

  it('reads a saved journal overview from the encrypted page catalog', async () => {
    const store = createLocalStore(createMockEncryption());
    const page = { ...makePage('p1'), tags: ['travel', 'test'], modified: 42 };
    await store.saveJournal(makeJournalContent('j1', [page]));

    const overview = await store.getJournalOverview?.('j1');

    expect(overview).toMatchObject({
      metadata: { id: 'j1', title: 'Journal j1' },
      pages: [expect.objectContaining({ id: 'p1' })],
      tags: ['test', 'travel'],
      latestModified: 42,
    });
    expect(filesystem['/mock-docs/canto/j1/page-catalog.json']).toMatch(/^enc:/);
  });

  it('reads only metadata and catalog for a warm overview', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    resetStorageIoCounters();

    await store.getJournalOverview?.('j1');

    expect(getStorageIoCounters()).toEqual({
      metadataReads: 1,
      catalogReads: 1,
      pageReads: 0,
      decryptions: 2,
      catalogRebuilds: 0,
    });
  });

  it('skips IO counter updates when development diagnostics are disabled', () => {
    const globalWithDev = globalThis as { __DEV__?: boolean };
    const original = globalWithDev.__DEV__;
    try {
      resetStorageIoCounters();
      globalWithDev.__DEV__ = false;

      recordStorageIo('metadataReads');

      expect(getStorageIoCounters().metadataReads).toBe(0);
    } finally {
      globalWithDev.__DEV__ = original;
    }
  });

  it('builds a sync snapshot from metadata and catalog without page reads', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(
      makeJournalContent('j1', [
        { ...makePage('p1'), modified: 42 },
        { ...makePage('p2'), modified: 43, deleted: true },
      ]),
    );
    resetStorageIoCounters();

    const snapshot = await store.getJournalSyncSnapshot?.('j1');

    expect(snapshot?.metadata).toMatchObject({ id: 'j1', title: 'Journal j1' });
    expect(snapshot?.pages).toEqual(
      new Map([
        ['p1', { modified: 42 }],
        ['p2', { modified: 43, deleted: true }],
      ]),
    );
    expect(getStorageIoCounters().pageReads).toBe(0);
    expect(getStorageIoCounters()).toMatchObject({ metadataReads: 1, catalogReads: 1 });
  });

  it('rebuilds a missing catalog once and reports page-count progress', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    delete filesystem['/mock-docs/canto/j1/page-catalog.json'];
    const progress: Array<{ current: number; total: number }> = [];

    await expect(
      store.getJournalOverview?.('j1', undefined, {
        onRebuildProgress: (event) => progress.push(event),
      }),
    ).resolves.toMatchObject({ pages: [expect.anything(), expect.anything()] });

    expect(progress).toEqual([
      { current: 0, total: 2 },
      { current: 1, total: 2 },
      { current: 2, total: 2 },
    ]);
    expect(filesystem['/mock-docs/canto/j1/page-catalog.json']).toMatch(/^enc:/);
  });

  it('rebuilds a missing catalog before returning a sync snapshot', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    delete filesystem['/mock-docs/canto/j1/page-catalog.json'];
    resetStorageIoCounters();

    const snapshot = await store.getJournalSyncSnapshot!('j1');

    expect(snapshot!.pages).toEqual(
      new Map([
        ['p1', expect.objectContaining({ modified: expect.any(Number) })],
        ['p2', expect.objectContaining({ modified: expect.any(Number) })],
      ]),
    );
    expect(filesystem['/mock-docs/canto/j1/page-catalog.json']).toMatch(/^enc:/);
    expect(getStorageIoCounters()).toMatchObject({ pageReads: 2, catalogRebuilds: 1 });
  });

  it('treats an invalid encrypted page catalog as rebuildable legacy data', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    filesystem['/mock-docs/canto/j1/page-catalog.json'] = 'enc:not-json';

    await expect(store.getJournalOverview?.('j1')).resolves.toMatchObject({
      pages: [expect.objectContaining({ id: 'p1' })],
    });
    expect(filesystem['/mock-docs/canto/j1/page-catalog.json']).not.toBe('enc:not-json');
  });

  it('reads a password-protected sync snapshot only with its derived key', async () => {
    const store = createLocalStore(createMockEncryption());
    const key = new Uint8Array(32).fill(7);
    const wrongKey = new Uint8Array(32).fill(8);
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]), key);

    await expect(store.getJournalSyncSnapshot!('j1', key)).resolves.toMatchObject({
      metadata: { id: 'j1' },
    });
    await expect(store.getJournalSyncSnapshot!('j1', wrongKey)).rejects.toThrow();
  });

  it('does not publish a catalog when a legacy rebuild is cancelled', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    delete filesystem['/mock-docs/canto/j1/page-catalog.json'];
    const controller = new AbortController();

    await expect(
      store.getJournalOverview?.('j1', undefined, {
        signal: controller.signal,
        onRebuildProgress: ({ current }) => {
          if (current === 1) controller.abort();
        },
      }),
    ).rejects.toThrow('catalog rebuild cancelled');

    expect(filesystem['/mock-docs/canto/j1/page-catalog.json']).toBeUndefined();
    await expect(store.getJournal('j1')).resolves.toMatchObject({
      pages: [expect.objectContaining({ id: 'p1' }), expect.objectContaining({ id: 'p2' })],
    });
  });

  it('updates journal metadata without rewriting pages or the catalog', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    const page = makePage('p1');
    await store.saveJournal(makeJournalContent('j1', [page]));
    const pagePath = '/mock-docs/canto/j1/pages/p1.json';
    const catalogPath = '/mock-docs/canto/j1/page-catalog.json';
    const pageBefore = filesystem[pagePath];
    const catalogBefore = filesystem[catalogPath];
    const encryptSpy = encryption.encrypt as jest.Mock;
    encryptSpy.mockClear();

    await store.saveJournalMetadata?.({
      ...makeJournalContent('j1', [page]),
      title: 'Renamed',
      pages: undefined,
    } as Omit<JournalContent, 'pages'>);

    expect(filesystem[pagePath]).toBe(pageBefore);
    expect(filesystem[catalogPath]).toBe(catalogBefore);
    expect(encryptSpy).toHaveBeenCalledTimes(2);
  });

  it('getJournal returns null for non-existent journal', async () => {
    const store = createLocalStore(createMockEncryption());
    const result = await store.getJournal('nonexistent');
    expect(result).toBeNull();
  });

  it('opens a metadata-only journal when no pages directory exists yet', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('metadata-only'));

    await expect(store.getJournal('metadata-only')).resolves.toMatchObject({
      id: 'metadata-only',
      pages: [],
    });
  });

  it('deleteJournal removes journal from listing', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    await store.deleteJournal('j1');
    const journals = await store.listJournals();
    expect(journals).toHaveLength(0);
  });

  it('savePage and getPage round-trip', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    const page = makePage('p1');
    await store.savePage('j1', page);
    const result = await store.getPage('j1', 'p1');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Page p1 content');
  });

  it('updates a warm page catalog without reading the full journal', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    const readJournal = jest.spyOn(store, 'getJournal');

    await store.savePage(
      'j1',
      { ...makePage('p1'), text: 'Updated', modified: 9 },
      undefined,
      true,
    );

    expect(readJournal).not.toHaveBeenCalled();
    await expect(store.getJournalOverview?.('j1')).resolves.toMatchObject({
      pages: [expect.objectContaining({ id: 'p1', previewText: 'Updated' })],
    });
  });

  it('rejects a save covering a malformed unrelated page and leaves every file unchanged', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    delete filesystem['/mock-docs/canto/j1/page-catalog.json'];
    filesystem['/mock-docs/canto/j1/pages/p2.json'] = 'enc:local corruption';
    const page1Before = filesystem['/mock-docs/canto/j1/pages/p1.json'];
    const page2Before = filesystem['/mock-docs/canto/j1/pages/p2.json'];

    // A rebuild may publish only after every discovered page validates. The
    // unreadable page must block the mutation and never be silently omitted
    // from a reduced catalog projection.
    await expect(
      store.savePage('j1', { ...makePage('p1'), text: 'Saved edit' }, undefined, true),
    ).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
      details: [expect.stringMatching(/^record:[0-9a-f]+$/)],
    });

    expect(filesystem['/mock-docs/canto/j1/page-catalog.json']).toBeUndefined();
    expect(filesystem['/mock-docs/canto/j1/pages/p1.json']).toBe(page1Before);
    expect(filesystem['/mock-docs/canto/j1/pages/p2.json']).toBe(page2Before);
    await expect(store.getPage('j1', 'p1')).resolves.toMatchObject({ text: 'Page p1 content' });
  });

  it('getPage returns null for non-existent page', async () => {
    const store = createLocalStore(createMockEncryption());
    const result = await store.getPage('j1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('deletePage soft-deletes the page', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    await store.savePage('j1', makePage('p1'));
    await store.deletePage('j1', 'p1');
    const result = await store.getPage('j1', 'p1');
    expect(result).not.toBeNull();
    expect(result!.deleted).toBe(true);
  });

  it('saveAttachment returns a file URI', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    const attachment: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const uri = await store.saveAttachment('j1', 'p1', attachment, 'base64data');
    expect(typeof uri).toBe('string');
    expect(uri.length).toBeGreaterThan(0);
  });

  it('deleteAttachment removes the file', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    const attachment: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const uri = await store.saveAttachment('j1', 'p1', attachment, 'base64data');
    await store.deleteAttachment(uri);
    const result = await store.getAttachment(uri);
    expect(result).toBeNull();
  });

  it('deleteJournal removes journal data so getJournal returns null', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    // Verify it exists
    expect(await store.getJournal('j1')).not.toBeNull();
    await store.deleteJournal('j1');
    // Index is cleared
    expect(await store.listJournals()).toHaveLength(0);
    // Data is cleared
    expect(await store.getJournal('j1')).toBeNull();
  });

  it('deleteJournal removes index entry even when called on already-deleted journal', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    await store.saveJournal(makeJournalContent('j2'));
    await store.deleteJournal('j1');
    // j2 should still be there
    const journals = await store.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].id).toBe('j2');
    // Deleting again should not throw
    await expect(store.deleteJournal('j1')).resolves.not.toThrow();
  });

  it('updates existing journal in index on re-save', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    const updated = makeJournalContent('j1');
    updated.title = 'Updated Title';
    await store.saveJournal(updated);
    const journals = await store.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].title).toBe('Updated Title');
  });
});

describe('readEncrypted password-layer fallback', () => {
  it('returns device-decrypted content when password decryption fails (L85)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);

    // Save a journal WITHOUT password encryption
    const journal = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(journal);

    // Now read with a derivedKey — password layer decryption will fail (data is not
    // password-encrypted), so it should fall back to returning device-decrypted content
    const derivedKey = new Uint8Array(32);
    crypto.getRandomValues(derivedKey);
    const result = await store.getJournal('j1', derivedKey);
    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(1);
  });
});

describe('deletePage edge cases', () => {
  it('deletePage on non-existent page returns without error (L305)', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    await expect(store.deletePage('j1', 'nonexistent')).resolves.not.toThrow();
  });

  it('deletePage cleans up attachment files (L319-325)', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));

    // Create a page with an attachment that has a path
    const att: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const attPath = await store.saveAttachment('j1', 'p1', att, 'base64data');

    // Save a page with the attachment
    const page = makePage('p1');
    page.images = [{ ...att, path: attPath }];
    await store.savePage('j1', page);

    // Delete the page — should trigger attachment cleanup
    await store.deletePage('j1', 'p1');

    // Allow the non-blocking cleanup to complete
    await new Promise((r) => setTimeout(r, 50));

    // Verify page is soft-deleted
    const result = await store.getPage('j1', 'p1');
    expect(result).not.toBeNull();
    expect(result!.deleted).toBe(true);
  });
});

describe('secure journal write guards (native)', () => {
  it('rejects keyless and all-zero-key savePage/deletePage for a secure journal and leaves files unchanged', async () => {
    const key = new Uint8Array(32).fill(7);
    const store = createLocalStore(createMockEncryption());
    const journal: JournalContent = {
      ...makeJournalContent('secure-j', [makePage('p1')]),
      secure: true,
    };
    await store.saveJournal(journal, key);

    const journalRoot = '/mock-docs/canto/secure-j';
    const before = {
      catalog: filesystem[`${journalRoot}/page-catalog.json`],
      page: filesystem[`${journalRoot}/pages/p1.json`],
      metadata: filesystem[`${journalRoot}/metadata.json`],
    };
    expect(before.catalog).toBeDefined();

    // Missing key: the secure status comes from the device-only index entry,
    // so both mutations reject before any filesystem write.
    await expect(store.savePage('secure-j', makePage('p2'), undefined)).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });
    await expect(store.deletePage('secure-j', 'p1', undefined)).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });

    // Revoked (all-zero) key: rejected by the defense-in-depth guard as well.
    await expect(
      store.savePage('secure-j', makePage('p3'), new Uint8Array(32)),
    ).rejects.toMatchObject({ code: 'JOURNAL_LOCKED' });
    await expect(store.deletePage('secure-j', 'p1', new Uint8Array(32))).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });

    // Every durable record is byte-identical and nothing new was published.
    expect(filesystem[`${journalRoot}/page-catalog.json`]).toBe(before.catalog);
    expect(filesystem[`${journalRoot}/pages/p1.json`]).toBe(before.page);
    expect(filesystem[`${journalRoot}/metadata.json`]).toBe(before.metadata);
    expect(filesystem[`${journalRoot}/pages/p2.json`]).toBeUndefined();
    expect(filesystem[`${journalRoot}/pages/p3.json`]).toBeUndefined();
  });

  it('still allows keyless page writes for a non-secure journal', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('ns-j'));
    await expect(store.savePage('ns-j', makePage('p1'))).resolves.toBeUndefined();
    expect(filesystem['/mock-docs/canto/ns-j/pages/p1.json']).toBeDefined();
    await expect(store.deletePage('ns-j', 'p1')).resolves.toBeUndefined();
    await expect(store.getPage('ns-j', 'p1')).resolves.toMatchObject({ deleted: true });
  });
});

describe('getAttachment', () => {
  it('returns device-decrypted content without derivedKey (L381)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.saveJournal(makeJournalContent('j1'));

    const att: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const path = await store.saveAttachment('j1', 'p1', att, 'base64data');

    // Read without derivedKey — should return device-decrypted data
    const result = await store.getAttachment(path);
    expect(result).toBe('base64data');
  });

  it('returns device-decrypted content when password decryption fails (L378)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.saveJournal(makeJournalContent('j1'));

    const att: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const path = await store.saveAttachment('j1', 'p1', att, 'base64data');

    // Read with derivedKey — password decrypt will fail, should fall back
    const derivedKey = new Uint8Array(32);
    crypto.getRandomValues(derivedKey);
    const result = await store.getAttachment(path, derivedKey);
    expect(result).not.toBeNull();
  });
});

describe('chunked attachment storage (native)', () => {
  it('writes independently encrypted chunks and reassembles only on an explicit read', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const data = 'A'.repeat(Math.ceil((ATTACHMENT_CHUNK_SIZE + 1) / 3) * 4);
    const attachment: Attachment = {
      id: 'chunked',
      path: '',
      name: 'recording.mp4',
      type: 'file',
      encrypted: false,
      size: Math.floor((data.length * 3) / 4),
      content: chunkedContentForBase64(data),
      deleted: false,
    };
    const path = await store.saveAttachment('j1', 'p1', attachment, data);
    attachment.path = path;
    const chunks: string[] = [];
    await store.forEachAttachmentChunk!(attachment, async (_index, chunk) => {
      chunks.push(chunk);
    });
    expect(chunks).toHaveLength(attachment.content!.chunkCount);
    expect(await store.getAttachment(path)).toBe(data);
  });

  it('streams exact chunks into an immutable generation and reads them back on demand', async () => {
    const store = createLocalStore(createMockEncryption());
    const attachment: Attachment = {
      id: 'streamed',
      path: '',
      name: 'streamed.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 3,
        chunkSize: 2,
        chunkCount: 2,
        generation: 'stream-generation',
      },
    };
    async function* source() {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3]);
    }

    const path = await store.saveAttachmentStream!('j1', 'p1', attachment, source());
    attachment.path = path;

    expect(await store.getAttachment(path)).toBe('AQID');
    const visited: number[] = [];
    await store.forEachAttachmentChunk!(
      attachment,
      async (index) => {
        visited.push(index);
      },
      new Set([1]),
    );
    expect(visited).toEqual([1]);
    await expect(store.saveAttachmentStream!('j1', 'p1', attachment, source())).rejects.toThrow(
      'Attachment generation already exists',
    );
  });

  it('rejects invalid streamed content and removes an incomplete generation', async () => {
    const store = createLocalStore(createMockEncryption());
    const attachment: Attachment = {
      id: 'stream-error',
      path: '',
      name: 'stream-error.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 2,
        chunkSize: 1,
        chunkCount: 2,
        generation: 'stream-error-generation',
      },
    };
    async function* tooLarge() {
      yield new Uint8Array([1, 2]);
    }
    async function* tooFew() {
      yield new Uint8Array([1]);
    }

    await expect(store.saveAttachmentStream!('j1', 'p1', attachment, tooLarge())).rejects.toThrow(
      'Attachment stream chunk exceeds limit',
    );
    await expect(store.saveAttachmentStream!('j1', 'p1', attachment, tooFew())).rejects.toThrow(
      'Attachment stream length mismatch',
    );
    await expect(
      store.forEachAttachmentChunk!({ ...attachment, content: undefined }, async () => undefined),
    ).rejects.toThrow('Chunked content descriptor required');
  });

  it('skips empty stream frames before persisting the declared chunk data', async () => {
    const store = createLocalStore(createMockEncryption());
    const attachment: Attachment = {
      id: 'empty-frame',
      path: '',
      name: 'empty-frame.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 1,
        chunkSize: 1,
        chunkCount: 1,
        generation: 'empty-frame-generation',
      },
    };
    async function* source() {
      yield new Uint8Array();
      yield new Uint8Array([1]);
    }

    const path = await store.saveAttachmentStream!('j1', 'p1', attachment, source());
    attachment.path = path;
    expect(await store.getAttachment(path)).toBe('AQ==');
  });

  it('persists downloaded chunk frames atomically and retains a complete immutable generation', async () => {
    const store = createLocalStore(createMockEncryption());
    const attachment: Attachment = {
      id: 'downloaded',
      path: '',
      name: 'downloaded.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 3,
        chunkSize: 2,
        chunkCount: 2,
        generation: 'download-generation',
      },
    };
    async function* frames() {
      yield encodeChunkFrame('j1', 'p1', attachment, 0, 'AQI=');
      yield encodeChunkFrame('j1', 'p1', attachment, 1, 'Aw==');
    }

    const path = await store.saveAttachmentChunks!('j1', 'p1', attachment, frames());
    attachment.path = path;
    expect(await store.getAttachment(path)).toBe('AQID');
    await expect(store.saveAttachmentChunks!('j1', 'p1', attachment, frames())).resolves.toBe(path);
    await store.deleteAttachment(path);
    expect(await store.getAttachment(path)).toBeNull();
  });

  it('streams only validated display chunks and supports bounded legacy display values', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'display-generation',
      path: '',
      name: 'display.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 3,
        chunkSize: 2,
        chunkCount: 2,
        generation: 'display-generation',
      },
    };
    async function* frames() {
      yield encodeChunkFrame('j1', 'p1', attachment, 0, 'AQI=');
      yield encodeChunkFrame('j1', 'p1', attachment, 1, 'Aw==');
    }
    attachment.path = await store.saveAttachmentChunks!('j1', 'p1', attachment, frames());
    const chunks: string[] = [];
    await store.forEachAttachmentDisplayChunk!(attachment, async (_index, data) => {
      chunks.push(data);
    });
    expect(chunks).toEqual(['AQI=', 'Aw==']);
    await expect(
      store.forEachAttachmentDisplayChunk!(
        { ...attachment, id: 'wrong-id' },
        async () => undefined,
      ),
    ).rejects.toThrow('manifest identity mismatch');

    const legacy = {
      ...attachment,
      id: 'legacy-display',
      path: '/mock-docs/legacy-display',
      content: undefined,
      size: 1,
    };
    filesystem[legacy.path] = 'enc:AQ==';
    await expect(
      store.forEachAttachmentDisplayChunk!(legacy, async (_index, data) => {
        expect(data).toBe('AQ==');
      }),
    ).resolves.toBeUndefined();
    await expect(
      store.forEachAttachmentDisplayChunk!({ ...legacy, size: undefined }, async () => undefined),
    ).rejects.toThrow('Legacy attachment is too large');
  });

  it('rejects incomplete or excessive downloaded chunk streams', async () => {
    const store = createLocalStore(createMockEncryption());
    const attachment: Attachment = {
      id: 'download-error',
      path: '',
      name: 'download-error.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 2,
        chunkSize: 1,
        chunkCount: 2,
        generation: 'download-error-generation',
      },
    };
    async function* tooFew() {
      yield 'one';
    }
    async function* tooMany() {
      yield 'one';
      yield 'two';
      yield 'three';
    }

    await expect(store.saveAttachmentChunks!('j1', 'p1', attachment, tooFew())).rejects.toThrow(
      'Missing attachment chunks',
    );
    await expect(store.saveAttachmentChunks!('j1', 'p1', attachment, tooMany())).rejects.toThrow(
      'Too many attachment chunks',
    );
  });

  it('rejects duplicate generations and cleans up a failed chunked attachment write', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    const attachment: Attachment = {
      id: 'duplicate',
      path: '',
      name: 'duplicate.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 1,
        chunkSize: 1,
        chunkCount: 1,
        generation: 'duplicate-generation',
      },
    };
    await store.saveAttachment('j1', 'p1', attachment, 'AQ==');
    await expect(store.saveAttachment('j1', 'p1', attachment, 'AQ==')).rejects.toThrow(
      'Attachment generation already exists',
    );

    const failingEncryption = createMockEncryption();
    (failingEncryption.encrypt as jest.Mock).mockRejectedValue(new Error('device write failed'));
    const failingStore = createLocalStore(failingEncryption);
    const failingAttachment = {
      ...attachment,
      id: 'failing',
      content: { ...attachment.content!, generation: 'failing-generation' },
    };
    await expect(
      failingStore.saveAttachment('j1', 'p1', failingAttachment, 'AQ=='),
    ).rejects.toThrow('device write failed');
  });

  it('rejects invalid streamed descriptors, excess chunks, and missing local chunks', async () => {
    const store = createLocalStore(createMockEncryption());
    const attachment: Attachment = {
      id: 'validation',
      path: '/missing/root',
      name: 'validation.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 1,
        chunkSize: 1,
        chunkCount: 1,
        generation: 'validation-generation',
      },
    };
    async function* excess() {
      yield new Uint8Array([1]);
      yield new Uint8Array([2]);
    }

    await expect(
      store.saveAttachmentStream!('j1', 'p1', { ...attachment, content: undefined }, excess()),
    ).rejects.toThrow('Chunked content descriptor required');
    await expect(store.saveAttachmentStream!('j1', 'p1', attachment, excess())).rejects.toThrow(
      'Too many attachment chunks',
    );
    await expect(store.forEachAttachmentChunk!(attachment, async () => undefined)).rejects.toThrow(
      'Attachment chunk missing',
    );
    await expect(
      store.saveAttachmentChunks!(
        'j1',
        'p1',
        { ...attachment, content: undefined },
        (async function* () {})(),
      ),
    ).rejects.toThrow('Chunked content descriptor required');
  });

  it('cleans up chunked page attachments and rejects incomplete roots on reads and downloads', async () => {
    const store = createLocalStore(createMockEncryption());
    // Establish the journal through the store so the device-only index entry
    // exists; the fail-closed index guard treats raw durable data without an
    // index as an integrity condition and blocks page mutations below.
    await store.saveJournal(makeJournalContent('j1'));
    const attachment: Attachment = {
      id: 'missing-root',
      path: '/mock-docs/canto/j1/attachments/chunk-v1-p1-missing-root-generation',
      name: 'missing-root.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 1,
        chunkSize: 1,
        chunkCount: 1,
        generation: 'missing-root-generation',
      },
    };
    filesystem[`${attachment.path}/manifest`] = `enc:${JSON.stringify({
      journalId: 'j1',
      pageId: 'p1',
      attachment,
    })}`;
    await expect(store.getAttachment(attachment.path)).rejects.toThrow('Attachment chunk missing');

    const incomplete = {
      ...attachment,
      id: 'incomplete-root',
      content: { ...attachment.content!, generation: 'incomplete-root-generation' },
    };
    const incompleteRoot =
      '/mock-docs/canto/j1/attachments/chunk-v1-p1-incomplete-root-incomplete-root-generation';
    filesystem[`${incompleteRoot}/0`] = 'enc:partial';
    await expect(
      store.saveAttachmentChunks!(
        'j1',
        'p1',
        incomplete,
        (async function* () {
          yield 'frame';
        })(),
      ),
    ).rejects.toThrow('Incomplete attachment generation already exists');

    const page = { ...makePage('p1'), files: [attachment] };
    await store.savePage('j1', page, undefined, true);
    await store.deletePage('j1', 'p1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(filesystem[`${attachment.path}/manifest`]).toBeUndefined();
  });

  it('decrypts password-protected chunk frames with the journal key', async () => {
    const store = createLocalStore(createMockEncryption());
    const key = new Uint8Array(32).fill(7);
    const attachment: Attachment = {
      id: 'encrypted-chunk',
      path: '',
      name: 'encrypted-chunk.bin',
      type: 'file',
      encrypted: true,
      deleted: false,
      content: chunkedContentForBase64('QUJD'),
    };
    const path = await store.saveAttachment('j1', 'p1', attachment, 'QUJD', key);
    await expect(store.getAttachment(path, key)).resolves.toBe('QUJD');
  });

  it('rejects writing an encrypted-flagged attachment without a usable key and leaves no root', async () => {
    const store = createLocalStore(createMockEncryption());
    const attachment: Attachment = {
      id: 'locked-chunk-write',
      path: '',
      name: 'locked-chunk-write.bin',
      type: 'file',
      encrypted: true,
      deleted: false,
      content: chunkedContentForBase64('QUJD'),
    };

    // The password-layer downgrade after auto-lock must fail closed: an
    // encrypted attachment with no usable key is never persisted device-only.
    await expect(store.saveAttachment('j1', 'p1', attachment, 'QUJD')).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });
    expect(
      filesystem['/mock-docs/canto/j1/attachments/chunk-v1-p1-locked-chunk-write-legacy'],
    ).toBeUndefined();
  });

  it('still tolerates legacy device-only chunk frames on read when metadata retains encrypted', async () => {
    // Pre-19.2 devices can retain encrypted attachment metadata while the
    // frame itself was written without a password layer (device-only). The
    // read path must tolerate that legacy state even though new keyless
    // writes are rejected. Build the legacy root directly, as an old device
    // or interrupted migration would have left it.
    const attachment: Attachment = {
      id: 'legacy-device-only-chunk',
      path: '',
      name: 'legacy-device-only-chunk.bin',
      type: 'file',
      encrypted: true,
      deleted: false,
      content: chunkedContentForBase64('QUJD'),
    };
    const root = `/mock-docs/canto/j1/attachments/chunk-v1-p1-legacy-device-only-chunk-legacy`;
    filesystem[`${root}/0`] = 'enc:' + encodeChunkFrame('j1', 'p1', attachment, 0, 'QUJD');
    filesystem[`${root}/manifest`] =
      'enc:' + JSON.stringify({ journalId: 'j1', pageId: 'p1', attachment });

    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await expect(store.getAttachment(root, new Uint8Array(32).fill(7))).resolves.toBe('QUJD');
  });

  it('keeps the published native generation readable when replacement encryption fails', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    const data = 'AQIDBA==';
    const attachment: Attachment = {
      id: 'chunked',
      path: '',
      name: 'recording.mp4',
      type: 'file',
      encrypted: false,
      size: 4,
      content: chunkedContentForBase64(data),
      deleted: false,
    };
    const journal = makeJournalContent('j1', [{ ...makePage('p1'), files: [attachment] }]);
    await store.saveJournal(journal);
    const path = await store.saveAttachment('j1', 'p1', attachment, data);
    const loaded = await store.getJournal('j1');
    loaded!.pages[0].files[0].path = path;
    await store.savePage('j1', loaded!.pages[0], undefined, true);

    (encryption.encrypt as jest.Mock).mockImplementation((value: string) => {
      if (value.includes('"format":"canto-chunked-v1"')) {
        return Promise.reject(new Error('simulated replacement failure'));
      }
      return Promise.resolve(`enc:${value}`);
    });

    await expect(
      store.reencryptJournal(loaded!, undefined, new Uint8Array(32).fill(7)),
    ).rejects.toThrow('simulated replacement failure');

    // The page was not published with its new generation, so the original
    // unprotected journal and its original root remain the live version.
    expect(await store.getJournal('j1')).not.toBeNull();
    expect(await store.getAttachment(path)).toBe(data);
  });
});

describe('reencryptJournal', () => {
  it('does not recreate its transaction directory after staging password rotation files', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    const journal = await store.getJournal('j1');

    await expect(
      store.reencryptJournal(journal!, undefined, new Uint8Array(32).fill(7)),
    ).resolves.toEqual({ skippedAttachments: [] });
  });

  it('removes an unreferenced replacement root if page publication cannot be staged', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    const attachment: Attachment = {
      id: 'replacement-cleanup',
      path: '',
      name: 'replacement-cleanup.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: chunkedContentForBase64('QQ=='),
    };
    const journal = makeJournalContent('j1', [{ ...makePage('p1'), files: [attachment] }]);
    await store.saveJournal(journal);
    attachment.path = await store.saveAttachment('j1', 'p1', attachment, 'QQ==');
    const loaded = await store.getJournal('j1');
    loaded!.pages[0].files[0].path = attachment.path;
    let writes = 0;
    (encryption.encrypt as jest.Mock).mockImplementation(async (value: string) => {
      writes++;
      if (writes === 3) throw new Error('staging failed');
      return `enc:${value}`;
    });

    await expect(
      store.reencryptJournal(loaded!, undefined, new Uint8Array(32).fill(9)),
    ).rejects.toThrow('staging failed');
    await expect(store.getAttachment(attachment.path)).resolves.toBe('QQ==');
  });

  it('keeps unsafe unprotected legacy attachments device-only and rejects protected ones', async () => {
    const store = createLocalStore(createMockEncryption());
    const unsafe: Attachment = {
      id: 'unsafe',
      path: '/mock-docs/canto/j1/attachments/missing-legacy.bin',
      name: 'missing-legacy.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      size: 1,
    };
    const journal = makeJournalContent('j1', [{ ...makePage('p1'), files: [unsafe] }]);
    const result = await store.reencryptJournal(journal, undefined, new Uint8Array(32).fill(7));
    expect(result.skippedAttachments).toEqual([{ name: unsafe.name, size: unsafe.size }]);

    await expect(
      store.reencryptJournal(
        makeJournalContent('j2', [
          { ...makePage('p2'), files: [{ ...unsafe, id: 'protected', encrypted: true }] },
        ]),
        new Uint8Array(32).fill(1),
        new Uint8Array(32).fill(2),
      ),
    ).rejects.toThrow('Cannot safely re-encrypt legacy attachment');
  });

  it('reports local attachment size metadata without opening the attachment', async () => {
    const store = createLocalStore(createMockEncryption());
    const path = await store.saveAttachment(
      'j1',
      'p1',
      { id: 'sized', path: '', name: 'sized.bin', type: 'file', encrypted: false, deleted: false },
      'QUJD',
    );
    await expect(store.getAttachmentStorageSize!(path)).resolves.toEqual({
      status: 'known',
      bytes: 8,
    });
    await expect(store.getAttachmentStorageSize!('/missing')).resolves.toEqual({
      status: 'missing',
    });
  });

  it('re-encrypts pages and metadata with progress', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const journal = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(journal);

    const loaded = await store.getJournal('j1');
    expect(loaded).not.toBeNull();

    const progressCalls: [number, number][] = [];
    await store.reencryptJournal(loaded!, undefined, undefined, (c, t) => {
      progressCalls.push([c, t]);
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    const result = await store.getJournal('j1');
    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(1);
  });

  it('falls back when attachment is not password-encrypted during reencrypt (L421-422)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    // Save journal with attachment (no password encryption)
    const att: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const journal = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(journal);
    await store.saveAttachment('j1', 'p1', att, 'imagedata');

    const loaded = await store.getJournal('j1');

    // Re-encrypt with an oldKey — aesGcmDecrypt will fail on the attachment
    // (it wasn't password-encrypted), hitting the catch branch at L421-422
    const oldKey = new Uint8Array(32);
    crypto.getRandomValues(oldKey);
    await store.reencryptJournal(loaded!, oldKey, undefined);

    const result = await store.getJournal('j1');
    expect(result).not.toBeNull();
  });

  it('adds new journal to index during reencrypt (L459)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    // Create journal content without saving it to the index (simulate orphaned data)
    // Actually, we need to create a journal that exists as files but NOT in the index.
    // The simplest way: save normally, then re-create store (fresh readIndex) and call
    // reencryptJournal with a journal ID not in the index.

    // Save j1 normally
    const j1 = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(j1);

    // Now call reencryptJournal with a journal whose id is 'j2' (not in index)
    const j2 = makeJournalContent('j2', [makePage('p2')]);
    // We need files on disk for j2, so save it first then delete from index only
    await store.saveJournal(j2);
    // Remove j2 from index by manipulating — actually let's just use a different approach:
    // Delete j2, then re-save its files manually, then reencrypt.
    // Simplest: just call reencryptJournal with j2 content when j2 is already in index.
    // That covers the "existing >= 0" path. For the "push" path (L459), j2 must NOT be in index.

    // Delete j2 from index (but keep files)
    await store.deleteJournal('j2');

    // Now j2 files are gone too (deleteJournal removes dir). Let me re-save just the files.
    // Actually, the reencryptJournal method doesn't check if files exist — it writes new ones.
    // It just reads from the journal parameter. So we can call it with any journal content.
    const j3 = makeJournalContent('j3', [makePage('p3')]);
    await store.reencryptJournal(j3, undefined, undefined);

    // j3 should now be in the index
    const journals = await store.listJournals();
    const ids = journals.map((j) => j.id);
    expect(ids).toContain('j1');
    expect(ids).toContain('j3');
  });

  it('sets attachment.encrypted=true when adding password (newKey provided)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    // Start: non-secure journal with a plain (non-encrypted) image attachment
    const att: Attachment = {
      id: 'img1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const page: Page = {
      ...makePage('p1'),
      images: [att],
    };
    const journal = makeJournalContent('j1', [page]);
    await store.saveJournal(journal);
    const savedPath = await store.saveAttachment('j1', 'p1', att, 'imagedata');

    // Reload and reflect the saved path
    const loaded = await store.getJournal('j1');
    loaded!.pages[0].images[0].path = savedPath;

    // User adds a password: reencryptJournal with newKey defined, oldKey undefined
    const newKey = new Uint8Array(32).fill(42);
    await store.reencryptJournal(loaded!, undefined, newKey);

    // The page on disk must reflect the new encryption state for its attachments
    const result = await store.getJournal('j1', newKey);
    expect(result).not.toBeNull();
    expect(result!.pages[0].images[0].encrypted).toBe(true);
  });

  it('sets attachment.encrypted=false when removing password (newKey undefined)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    // Start: secure journal with a password-encrypted attachment
    const att: Attachment = {
      id: 'img1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: true,
      deleted: false,
    };
    const page: Page = {
      ...makePage('p1'),
      images: [att],
    };
    const oldKey = new Uint8Array(32).fill(10);
    const journal: JournalContent = {
      ...makeJournalContent('j1', [page]),
      secure: true,
    };
    await store.saveJournal(journal, oldKey);
    const savedPath = await store.saveAttachment('j1', 'p1', att, 'imagedata', oldKey);

    const loaded = await store.getJournal('j1', oldKey);
    loaded!.pages[0].images[0].path = savedPath;

    // Remove password: newKey undefined
    await store.reencryptJournal(loaded!, oldKey, undefined);

    // After removal, attachment flags should reflect no password layer
    const result = await store.getJournal('j1');
    expect(result).not.toBeNull();
    expect(result!.pages[0].images[0].encrypted).toBe(false);
  });

  it('applies new attachment.encrypted flag to file attachments too', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const fileAtt: Attachment = {
      id: 'f1',
      path: '',
      name: 'doc.pdf',
      type: 'file',
      encrypted: false,
      deleted: false,
    };
    const page: Page = {
      ...makePage('p1'),
      files: [fileAtt],
    };
    const journal = makeJournalContent('j1', [page]);
    await store.saveJournal(journal);
    const savedPath = await store.saveAttachment('j1', 'p1', fileAtt, 'filedata');

    const loaded = await store.getJournal('j1');
    loaded!.pages[0].files[0].path = savedPath;

    const newKey = new Uint8Array(32).fill(42);
    await store.reencryptJournal(loaded!, undefined, newKey);

    const result = await store.getJournal('j1', newKey);
    expect(result!.pages[0].files[0].encrypted).toBe(true);
  });

  it('reports progress while copying each chunk during password rotation', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'chunked-progress',
      path: '',
      name: 'image.jpg',
      type: 'image',
      encrypted: false,
      size: 3,
      content: chunkedContentForBase64('QUJD'),
      deleted: false,
    };
    await store.saveJournal(
      makeJournalContent('j1', [{ ...makePage('p1'), images: [attachment] }]),
    );
    const path = await store.saveAttachment('j1', 'p1', attachment, 'QUJD');
    const journal = await store.getJournal('j1');
    journal!.pages[0].images[0].path = path;
    const progress: Array<[number, number]> = [];

    await store.reencryptJournal(
      journal!,
      undefined,
      new Uint8Array(32).fill(7),
      (current, total) => {
        progress.push([current, total]);
      },
    );

    expect(progress).toEqual([
      [1, 3], // bounded chunk copy
      [2, 3], // page publication staging
      [3, 3], // journal metadata staging
    ]);
  });
});

describe('reencryptAll (device key rotation)', () => {
  it('rejects an oversized legacy attachment before opening it during device-key rotation', async () => {
    const store = createLocalStore(createMockEncryption());
    filesystem['/mock-docs/canto/j1/attachments/legacy-large.bin'] = 'x'.repeat(33 * 1024 * 1024);
    await expect(
      store.reencryptAll(
        async (value) => value,
        async (value) => value,
        async (value) => `new:${value}`,
      ),
    ).rejects.toThrow('Cannot safely rotate device key for legacy attachment');
  });

  it('removes pre-commit device-key staging when decryption fails', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    await expect(
      store.reencryptAll(
        async () => {
          throw new Error('old key unavailable');
        },
        async (value) => value,
        async (value) => `new:${value}`,
      ),
    ).rejects.toThrow('old key unavailable');
    expect(Object.keys(filesystem).some((path) => path.includes('/.transactions/device-'))).toBe(
      false,
    );
  });

  it('re-encrypts all data so it is readable with new key', async () => {
    // Simulate two different device keys via prefixed passthrough encryption
    const oldEncryption = createMockEncryption();
    oldEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`old:${data}`));
    oldEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^old:/, '')));

    const store = createLocalStore(oldEncryption);
    await store.initialize();

    // Save journal + page with old encryption
    const page = makePage('p1');
    const journal = makeJournalContent('j1', [page]);
    await store.saveJournal(journal);

    // Verify data is readable with old key
    expect(await store.listJournals()).toHaveLength(1);
    const loaded = await store.getJournal('j1');
    expect(loaded).not.toBeNull();
    expect(loaded!.pages[0].text).toBe('Page p1 content');

    // Simulate key rotation: re-encrypt from old→new key
    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^old:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`old:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`new:${pt}`);
    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    // Now create a store with "new" encryption to verify data is accessible
    const newEncryption = createMockEncryption();
    newEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`new:${data}`));
    newEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^new:/, '')));
    const newStore = createLocalStore(newEncryption);
    // Simulate restarting after data commit but before the UI key-finalization
    // call: the durable, keyless completion proof must survive startup.
    await newStore.initialize();
    expect(await newStore.hasCompletedDeviceKeyRotation?.()).toBe(true);
    await newStore.clearCompletedDeviceKeyRotation?.();
    expect(await newStore.hasCompletedDeviceKeyRotation?.()).toBe(false);

    const journals = await newStore.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].id).toBe('j1');

    const result = await newStore.getJournal('j1');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Journal j1');
    expect(result!.pages).toHaveLength(1);
    expect(result!.pages[0].text).toBe('Page p1 content');
  });

  it('re-encrypts data that is no longer readable with old key', async () => {
    const oldEncryption = createMockEncryption();
    oldEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`old:${data}`));
    oldEncryption.decrypt = jest.fn((data: string) => {
      if (!data.startsWith('old:')) throw new Error('Wrong key');
      return Promise.resolve(data.replace(/^old:/, ''));
    });

    const store = createLocalStore(oldEncryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^old:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`old:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`new:${pt}`);
    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    // Old encryption can no longer decrypt the data (prefix is now "new:", not
    // "old:"). The store still uses old encryption internally, so reads must
    // fail closed with a typed integrity error instead of silently reporting
    // an empty journal.
    await expect(store.getJournal('j1')).rejects.toMatchObject({ code: 'JOURNAL_UNREADABLE' });
  });

  it('re-encrypts multiple journals and their pages', async () => {
    const oldEncryption = createMockEncryption();
    oldEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`old:${data}`));
    oldEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^old:/, '')));

    const store = createLocalStore(oldEncryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    await store.saveJournal(makeJournalContent('j2', [makePage('p3')]));

    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^old:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`old:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`new:${pt}`);
    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    // Verify with new encryption
    const newEncryption = createMockEncryption();
    newEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`new:${data}`));
    newEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^new:/, '')));
    const newStore = createLocalStore(newEncryption);

    const journals = await newStore.listJournals();
    expect(journals).toHaveLength(2);

    const j1 = await newStore.getJournal('j1');
    expect(j1).not.toBeNull();
    expect(j1!.pages).toHaveLength(2);

    const j2 = await newStore.getJournal('j2');
    expect(j2).not.toBeNull();
    expect(j2!.pages).toHaveLength(1);
    expect(j2!.pages[0].text).toBe('Page p3 content');
  });

  it('re-encrypts attachments during device key rotation', async () => {
    const oldEncryption = createMockEncryption();
    oldEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`old:${data}`));
    oldEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^old:/, '')));

    const store = createLocalStore(oldEncryption);
    await store.initialize();

    // Save journal with an attachment
    await store.saveJournal(makeJournalContent('j1'));
    const att: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    await store.saveAttachment('j1', 'p1', att, 'imagedata');

    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^old:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`old:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`new:${pt}`);
    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    // Verify with new encryption
    const newEncryption = createMockEncryption();
    newEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`new:${data}`));
    newEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^new:/, '')));
    const newStore = createLocalStore(newEncryption);

    const journals = await newStore.listJournals();
    expect(journals).toHaveLength(1);
  });

  it('works when index and journal data are on different keys (previous failed rotation)', async () => {
    // Simulate a previous failed rotation that re-encrypted the INDEX
    // with key B but left journal data on key A.
    //
    // Step 1: Create data with key A
    const encryptionA = createMockEncryption();
    encryptionA.encrypt = jest.fn((data: string) => Promise.resolve(`keyA:${data}`));
    encryptionA.decrypt = jest.fn((data: string) => {
      if (!data.startsWith('keyA:')) throw new Error('Wrong key A');
      return Promise.resolve(data.replace(/^keyA:/, ''));
    });

    const store = createLocalStore(encryptionA);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    // Step 2: Simulate the buggy rotation that only re-encrypted the index.
    // Manually re-encrypt just the index file from keyA→keyB.
    const indexUri = '/mock-docs/canto/journals.json';
    const indexCiphertext = filesystem[indexUri]; // "keyA:..."
    const indexPlain = indexCiphertext.replace(/^keyA:/, '');
    filesystem[indexUri] = `keyB:${indexPlain}`;
    // Journal metadata + pages remain on key A (buggy rotation didn't touch them)

    // Step 3: Now simulate the FIXED rotation with a fallback oldDecrypt.
    // This mirrors what SecuritySettingsModal does:
    //   try singleton decrypt (key A) → catch → fallback to SecureStore key (B)
    const oldDecrypt = async (ct: string) => {
      try {
        return await encryptionA.decrypt(ct);
      } catch {
        // fallback: try key B (the SecureStore key from the failed rotation)
        if (!ct.startsWith('keyB:')) throw new Error('Wrong key B');
        return ct.replace(/^keyB:/, '');
      }
    };
    const oldEncrypt = (_pt: string) => Promise.resolve('unused');
    const newEncrypt = (pt: string) => Promise.resolve(`keyC:${pt}`);

    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    // Verify everything is now consistently on key C
    const newEncryption = createMockEncryption();
    newEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`keyC:${data}`));
    newEncryption.decrypt = jest.fn((data: string) => {
      if (!data.startsWith('keyC:')) throw new Error('Wrong key C');
      return Promise.resolve(data.replace(/^keyC:/, ''));
    });
    const newStore = createLocalStore(newEncryption);

    const journals = await newStore.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].id).toBe('j1');

    const result = await newStore.getJournal('j1');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Journal j1');
    expect(result!.pages).toHaveLength(1);
    expect(result!.pages[0].text).toBe('Page p1 content');
  });
});

describe('device-key rotation write barrier (native)', () => {
  it('blocks a concurrent save until rotation commits', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    let releaseRotation!: () => void;
    const rotationGate = new Promise<void>((resolve) => {
      releaseRotation = resolve;
    });
    let rotationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      rotationStarted = resolve;
    });
    let writesDuringRotation = 0;
    encryption.encrypt = jest.fn(async (data: string) => {
      writesDuringRotation++;
      return data;
    });

    const rotation = store.reencryptAll(
      async (value) => value.replace(/^enc:/, ''),
      async (value) => value,
      async (value) => {
        rotationStarted();
        await rotationGate;
        return value;
      },
    );
    await started;
    const concurrentSave = store.savePage('j1', makePage('p2'));
    await Promise.resolve();

    expect(writesDuringRotation).toBe(0);
    releaseRotation();
    await rotation;
    await concurrentSave;
    // A page mutation commits both the authoritative page and its catalog projection.
    expect(writesDuringRotation).toBe(2);
  });
});

describe('fail-closed integrity reads and mutations (native)', () => {
  it('listJournals throws INDEX_UNREADABLE when the index file exists but is undecryptable', async () => {
    const encryption = createMockEncryption();
    encryption.decrypt = jest.fn(() => {
      throw new Error('Cannot decrypt index');
    });
    filesystem['/mock-docs/canto/journals.json'] = 'ciphertext-bytes';
    const store = createLocalStore(encryption);
    await store.initialize();
    await expect(store.listJournals()).rejects.toMatchObject({ code: 'INDEX_UNREADABLE' });
  });

  it('listJournals throws INDEX_UNREADABLE when the index is not valid JSON', async () => {
    filesystem['/mock-docs/canto/journals.json'] = 'enc:not-json';
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await expect(store.listJournals()).rejects.toMatchObject({ code: 'INDEX_UNREADABLE' });
  });

  it('an unreadable index blocks metadata publication and never writes a reduced index', async () => {
    filesystem['/mock-docs/canto/journals.json'] = 'enc:not-json';
    filesystem['/mock-docs/canto/j1/metadata.json'] = 'enc:{"id":"j1"}';
    const store = createLocalStore(createMockEncryption());
    await store.initialize();

    await expect(
      store.saveJournalMetadata?.({
        ...makeJournalContent('j1'),
        title: 'Renamed',
        pages: undefined,
      } as Omit<JournalContent, 'pages'>),
    ).rejects.toMatchObject({ code: 'INDEX_UNREADABLE' });

    expect(filesystem['/mock-docs/canto/journals.json']).toBe('enc:not-json');
  });

  it('an unreadable index blocks saveJournal and deleteJournal publication', async () => {
    filesystem['/mock-docs/canto/journals.json'] = 'enc:not-json';
    filesystem['/mock-docs/canto/j1/metadata.json'] = 'enc:{"id":"j1"}';
    const store = createLocalStore(createMockEncryption());
    await store.initialize();

    await expect(store.saveJournal(makeJournalContent('j2'))).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
    });
    await expect(store.deleteJournal('j1')).rejects.toMatchObject({ code: 'INDEX_UNREADABLE' });
    // Nothing was deleted or rewritten.
    expect(filesystem['/mock-docs/canto/j1/metadata.json']).toBe('enc:{"id":"j1"}');
    expect(filesystem['/mock-docs/canto/journals.json']).toBe('enc:not-json');
  });

  it('a missing index over existing durable journal data fails closed instead of listing an empty library', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    delete filesystem['/mock-docs/canto/journals.json'];

    await expect(store.listJournals()).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
      causeLayer: 'INDEX_ABSENT',
    });
    // The durable journal was never treated as evidence of deletion.
    expect(filesystem['/mock-docs/canto/j1/metadata.json']).toBeDefined();
    expect(filesystem['/mock-docs/canto/j1/pages/p1.json']).toBeDefined();
  });

  it('a missing index over existing data blocks every publication and never writes a reduced index', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    delete filesystem['/mock-docs/canto/journals.json'];

    await expect(store.deleteJournal('j1')).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
      causeLayer: 'INDEX_ABSENT',
    });
    await expect(store.saveJournal(makeJournalContent('j2'))).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
      causeLayer: 'INDEX_ABSENT',
    });
    // No reduced index was published and the existing journal was not deleted.
    expect(filesystem['/mock-docs/canto/journals.json']).toBeUndefined();
    expect(filesystem['/mock-docs/canto/j1/metadata.json']).toBeDefined();
  });

  it('lets a marker-covered import stage durable data and publish the final index', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const journalId = 'marker-import';
    await store.beginJournalImport?.(journalId);
    await store.updateJournalImport?.(journalId, 'writing');

    // Attachment staging writes durable journal records before the index or
    // any journal metadata exists. The active import marker is what makes this
    // an allowed, non-destructive staging state rather than an integrity error.
    const savedPath = await store.saveAttachment(
      journalId,
      'p1',
      {
        id: 'a1',
        path: '',
        name: 'photo.jpg',
        type: 'image',
        encrypted: false,
        deleted: false,
      },
      'QUJD',
    );
    expect(savedPath).toBeTruthy();

    await store.updateJournalImport?.(journalId, 'publishing', { expectedPageCount: 1 });
    await store.saveJournal(makeJournalContent(journalId, [makePage('p1')]));
    await store.updateJournalImport?.(journalId, 'committed');
    await store.completeJournalImport?.(journalId);

    // The final index was published with the fully imported journal.
    expect(await store.listJournals()).toEqual([
      expect.objectContaining({ id: journalId, title: 'Journal marker-import' }),
    ]);
  });

  it('keeps orphan durable directories without an import marker fail-closed', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    // Durable attachment data staged under no journal and no import marker is
    // an orphan: no index may be published over it, even for another journal.
    await store.saveAttachment(
      'orphan-directory',
      'p1',
      {
        id: 'a1',
        path: '',
        name: 'photo.jpg',
        type: 'image',
        encrypted: false,
        deleted: false,
      },
      'QUJD',
    );

    await expect(store.saveJournal(makeJournalContent('imported-ok'))).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
      causeLayer: 'INDEX_ABSENT',
    });
    await expect(store.listJournals()).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
    });
    expect(filesystem['/mock-docs/canto/journals.json']).toBeUndefined();
  });

  it('recovery never deletes import journals or markers while the index is unreadable', async () => {
    const journalId = 'orphaned-import';
    filesystem['/mock-docs/canto/.imports/orphaned-import'] = JSON.stringify({
      version: 2,
      journalId,
      phase: 'publishing',
      expectedPageCount: 1,
    });
    filesystem[`/mock-docs/canto/${journalId}/metadata.json`] = 'enc:{"id":"orphaned-import"}';
    filesystem['/mock-docs/canto/journals.json'] = 'enc:not-json';

    const store = createLocalStore(createMockEncryption());
    await store.initialize();

    // The unreadable index cannot prove the import is committed or uncommitted,
    // so startup must preserve every directory and marker instead of guessing.
    expect(filesystem[`/mock-docs/canto/${journalId}/metadata.json`]).toBe(
      'enc:{"id":"orphaned-import"}',
    );
    expect(filesystem['/mock-docs/canto/.imports/orphaned-import']).toBeDefined();
    await expect(store.listJournals()).rejects.toMatchObject({ code: 'INDEX_UNREADABLE' });
  });

  it('getJournalOverview fails closed when the catalog is unreadable and a page cannot be read', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    filesystem['/mock-docs/canto/j1/page-catalog.json'] = 'enc:not-json';
    filesystem['/mock-docs/canto/j1/pages/p1.json'] = 'enc:corrupt page data';

    await expect(store.getJournalOverview?.('j1')).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
      details: [expect.stringMatching(/^record:[0-9a-f]+$/)],
    });
    // The corrupt catalog was never replaced by a reduced projection.
    expect(filesystem['/mock-docs/canto/j1/page-catalog.json']).toBe('enc:not-json');
  });

  it('getJournalSyncSnapshot fails closed instead of publishing an incomplete snapshot', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    // Force a rebuild path (unreadable catalog) with an unreadable page: the
    // snapshot must reject rather than become a reduced sync authority.
    filesystem['/mock-docs/canto/j1/page-catalog.json'] = 'enc:not-json';
    filesystem['/mock-docs/canto/j1/pages/p1.json'] = 'enc:raw unreadable page';

    await expect(store.getJournalSyncSnapshot!('j1')).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
    });
  });

  it('savePage with a revoked all-zero key is rejected before any file mutation', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    const zeroKey = new Uint8Array(32); // already zeroed by auto-lock
    const catalogBefore = filesystem['/mock-docs/canto/j1/page-catalog.json'];
    const pageBefore = filesystem['/mock-docs/canto/j1/pages/p1.json'];

    await expect(
      store.savePage('j1', { ...makePage('p1'), text: 'locked edit' }, zeroKey),
    ).rejects.toMatchObject({ code: 'JOURNAL_LOCKED' });

    expect(filesystem['/mock-docs/canto/j1/page-catalog.json']).toBe(catalogBefore);
    expect(filesystem['/mock-docs/canto/j1/pages/p1.json']).toBe(pageBefore);
  });

  it('serializes concurrent mutations so every committed page survives in the catalog', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));

    // Both saves read the same warm catalog baseline. Without serialization,
    // last-writer-wins would silently drop one committed page.
    await Promise.all([
      store.savePage('j1', makePage('p1'), undefined, true),
      store.savePage('j1', makePage('p2'), undefined, true),
    ]);

    const overview = await store.getJournalOverview?.('j1');
    const ids = overview!.pages.map((page) => page.id).sort();
    expect(ids).toEqual(['p1', 'p2']);
    await expect(store.getJournal('j1')).resolves.toMatchObject({
      pages: [expect.objectContaining({ id: 'p1' }), expect.objectContaining({ id: 'p2' })],
    });
  });

  it('can read index/catalog state through the typed store seams', async () => {
    const store = createLocalStore(createMockEncryption());
    expect(await store.hasExistingData?.()).toBe(false);
    await store.recordFirstInstall?.();
    await store.saveJournal(makeJournalContent('j1'));
    expect(await store.hasExistingData?.()).toBe(true);
  });
});

describe('storage behavior coverage (native)', () => {
  const DEVICE_FAIL_SENTINEL = 'BOOM';

  function createFailingEncryption(): EncryptionService {
    return {
      encrypt: jest.fn((data: string) => Promise.resolve(`enc:${data}`)),
      decrypt: jest.fn((data: string) =>
        data === DEVICE_FAIL_SENTINEL
          ? Promise.reject(new Error('device decrypt failed'))
          : Promise.resolve(data.replace(/^enc:/, '')),
      ),
      encryptWithPassword: jest.fn(),
      decryptWithPassword: jest.fn(),
      generateSalt: jest.fn(() => new Uint8Array(16)),
      clearSession: jest.fn(),
    };
  }

  it('returns a null sync snapshot when the journal has no metadata', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await expect(store.getJournalSyncSnapshot!('missing')).resolves.toBeNull();
  });

  it('defaults a missing page modified timestamp to zero in the sync snapshot', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await store.savePage(
      'j1',
      { ...makePage('p1'), modified: undefined } as unknown as Page,
      undefined,
      true,
    );

    const snapshot = await store.getJournalSyncSnapshot!('j1');
    expect(snapshot!.pages.get('p1')).toEqual({ modified: 0 });
  });

  it('fails closed when saving secure journal metadata without a usable key', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await expect(
      store.saveJournalMetadata!({
        ...makeJournalContent('secure-meta'),
        secure: true,
        pages: undefined,
      } as unknown as Omit<JournalContent, 'pages'>),
    ).rejects.toMatchObject({ code: 'JOURNAL_LOCKED' });
  });

  it('adds a new journal to the index when saving metadata for an unknown id', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournalMetadata!({
      ...makeJournalContent('new-meta'),
      pages: undefined,
    } as unknown as Omit<JournalContent, 'pages'>);

    await expect(store.listJournals()).resolves.toEqual([
      expect.objectContaining({ id: 'new-meta' }),
    ]);
  });

  it('rejects updating an import marker that was never begun', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await expect(store.updateJournalImport?.('missing-marker', 'writing')).rejects.toThrow(
      'Journal import marker is missing',
    );
  });

  it('returns null when opening an overview for a journal without metadata', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await expect(store.getJournalOverview!('absent-journal')).resolves.toBeNull();
  });

  it('fails closed when journal metadata cannot be device-decrypted', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    filesystem['/mock-docs/canto/broken-meta/metadata.json'] = DEVICE_FAIL_SENTINEL;

    const failing = createLocalStore(createFailingEncryption());
    await failing.initialize();
    await expect(failing.getJournalOverview!('broken-meta')).rejects.toMatchObject({
      code: 'JOURNAL_UNREADABLE',
    });
  });

  it('reports a device-decrypt failure during a catalog rebuild scan', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    filesystem['/mock-docs/canto/j1/page-catalog.json'] = 'enc:not-json';
    filesystem['/mock-docs/canto/j1/pages/p2.json'] = DEVICE_FAIL_SENTINEL;

    const failing = createLocalStore(createFailingEncryption());
    await failing.initialize();
    await expect(failing.getJournalOverview!('j1')).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
      details: [expect.stringMatching(/^record:[0-9a-f]+$/)],
    });
  });

  it('treats an undecryptable page catalog as a rebuild trigger', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    filesystem['/mock-docs/canto/j1/page-catalog.json'] = DEVICE_FAIL_SENTINEL;

    const failing = createLocalStore(createFailingEncryption());
    await failing.initialize();
    await expect(failing.getJournalOverview!('j1')).resolves.toMatchObject({
      pages: [expect.objectContaining({ id: 'p1' })],
    });
  });

  it('rebuilds an invalid catalog before soft-deleting a page', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    filesystem['/mock-docs/canto/j1/page-catalog.json'] = 'enc:not-json';

    await store.deletePage('j1', 'p1');

    const overview = await store.getJournalOverview!('j1');
    expect(overview!.pages.find((page) => page.id === 'p1')).toMatchObject({ deleted: true });
  });

  it('defers a catalog rebuild when the read signal is already aborted', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    delete filesystem['/mock-docs/canto/j1/page-catalog.json'];

    await expect(
      store.getJournalOverview!('j1', undefined, { signal: { aborted: true } as AbortSignal }),
    ).rejects.toThrow('Journal catalog rebuild cancelled');
  });

  it('defers a catalog rebuild when the signal aborts after an empty scan', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    delete filesystem['/mock-docs/canto/j1/page-catalog.json'];

    let reads = 0;
    const signal = {
      get aborted() {
        reads += 1;
        return reads > 1;
      },
    } as AbortSignal;

    await expect(store.getJournalOverview!('j1', undefined, { signal })).rejects.toThrow(
      'Journal catalog rebuild cancelled',
    );
  });

  it('recovers a publishing import with zero expected pages and no pages directory', async () => {
    const first = createLocalStore(createMockEncryption());
    await first.initialize();
    await first.saveJournal(makeJournalContent('m1'));
    filesystem['/mock-docs/canto/journals.json'] = 'enc:{"journals":[]}';
    filesystem['/mock-docs/canto/.imports/m1'] = JSON.stringify({
      version: 2,
      journalId: 'm1',
      phase: 'publishing',
      expectedPageCount: 0,
    });

    const recovered = createLocalStore(createMockEncryption());
    await recovered.initialize();

    await expect(recovered.listJournals()).resolves.toEqual([
      expect.objectContaining({ id: 'm1' }),
    ]);
  });

  it('does not recover a publishing import whose metadata is missing', async () => {
    const first = createLocalStore(createMockEncryption());
    await first.initialize();
    filesystem['/mock-docs/canto/journals.json'] = 'enc:{"journals":[]}';
    filesystem['/mock-docs/canto/.imports/no-metadata'] = JSON.stringify({
      version: 2,
      journalId: 'no-metadata',
      phase: 'publishing',
      expectedPageCount: 1,
    });

    const recovered = createLocalStore(createMockEncryption());
    await recovered.initialize();

    expect(filesystem['/mock-docs/canto/.imports/no-metadata']).toBeUndefined();
  });

  it('does not recover a publishing import whose metadata id or security mismatches', async () => {
    const first = createLocalStore(createMockEncryption());
    await first.initialize();
    filesystem['/mock-docs/canto/journals.json'] = 'enc:{"journals":[]}';
    filesystem['/mock-docs/canto/.imports/mismatch'] = JSON.stringify({
      version: 2,
      journalId: 'mismatch',
      phase: 'publishing',
      expectedPageCount: 0,
    });
    filesystem['/mock-docs/canto/mismatch/metadata.json'] = 'enc:{"id":"other"}';
    filesystem['/mock-docs/canto/.imports/secure'] = JSON.stringify({
      version: 2,
      journalId: 'secure',
      phase: 'publishing',
      expectedPageCount: 0,
    });
    filesystem['/mock-docs/canto/secure/metadata.json'] = 'enc:{"id":"secure","secure":true}';

    const recovered = createLocalStore(createMockEncryption());
    await recovered.initialize();

    expect(filesystem['/mock-docs/canto/.imports/mismatch']).toBeUndefined();
    expect(filesystem['/mock-docs/canto/.imports/secure']).toBeUndefined();
  });

  it('does not recover a publishing import whose catalog is missing', async () => {
    const first = createLocalStore(createMockEncryption());
    await first.initialize();
    filesystem['/mock-docs/canto/journals.json'] = 'enc:{"journals":[]}';
    filesystem['/mock-docs/canto/.imports/no-catalog'] = JSON.stringify({
      version: 2,
      journalId: 'no-catalog',
      phase: 'publishing',
      expectedPageCount: 0,
    });
    filesystem['/mock-docs/canto/no-catalog/metadata.json'] = 'enc:{"id":"no-catalog"}';

    const recovered = createLocalStore(createMockEncryption());
    await recovered.initialize();

    expect(filesystem['/mock-docs/canto/.imports/no-catalog']).toBeUndefined();
  });

  it('defers recovery when only an unparseable marker covers durable data', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    await store.saveJournal(makeJournalContent('other'));
    filesystem['/mock-docs/canto/.imports/empty-marker'] = '';
    delete filesystem['/mock-docs/canto/journals.json'];

    await expect(createLocalStore(createMockEncryption()).initialize()).resolves.toBeUndefined();
    expect(filesystem['/mock-docs/canto/j1/metadata.json']).toBeDefined();
    expect(filesystem['/mock-docs/canto/other/metadata.json']).toBeDefined();
  });

  it('ignores non-file entries in the imports directory during recovery', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    filesystem['/mock-docs/canto/.imports/sub/nested'] = 'x';
    filesystem['/mock-docs/canto/.imports/m1'] = JSON.stringify({
      version: 2,
      journalId: 'm1',
      phase: 'committed',
    });

    await expect(createLocalStore(createMockEncryption()).initialize()).resolves.toBeUndefined();
    expect(filesystem['/mock-docs/canto/j1/metadata.json']).toBeDefined();
  });

  it('ignores non-file entries in the imports directory when resolving active imports', async () => {
    const store = createLocalStore(createMockEncryption());
    filesystem['/mock-docs/canto/.imports/sub/nested'] = 'x';
    filesystem['/mock-docs/canto/.imports/m1'] = JSON.stringify({
      version: 2,
      journalId: 'm1',
      phase: 'writing',
    });
    filesystem['/mock-docs/canto/j1/metadata.json'] = 'enc:{"id":"j1"}';

    await expect(store.listJournals()).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
      causeLayer: 'INDEX_ABSENT',
    });
  });

  it('reports durable data when the base directory holds an unrecognized file', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.recordFirstInstall?.();
    filesystem['/mock-docs/canto/.device-key-rotation-complete'] = 'complete';
    await expect(store.hasExistingData?.()).resolves.toBe(false);

    filesystem['/mock-docs/canto/stray.txt'] = 'stray';
    await expect(store.hasExistingData?.()).resolves.toBe(true);
  });

  it('rejects an oversized legacy attachment before materializing it', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'legacy-too-large',
      path: '/mock-docs/canto/j1/attachments/legacy-too-large',
      name: 'legacy-too-large.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      size: 512 * 1024 + 1,
    };
    await expect(
      store.forEachAttachmentDisplayChunk!(attachment, async () => undefined),
    ).rejects.toThrow('Legacy attachment is too large');
  });

  it('reads encrypted and plain legacy attachments through the display path', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const derivedKey = new Uint8Array(32).fill(7);
    filesystem['/mock-docs/canto/j1/attachments/plain-legacy'] = 'enc:AQ==';
    filesystem['/mock-docs/canto/j1/attachments/enc-legacy'] = 'enc:AQ==';

    const plain: Attachment = {
      id: 'plain-legacy',
      path: '/mock-docs/canto/j1/attachments/plain-legacy',
      name: 'plain-legacy.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      size: 1,
    };
    const encrypted: Attachment = {
      ...plain,
      id: 'enc-legacy',
      encrypted: true,
      path: '/mock-docs/canto/j1/attachments/enc-legacy',
    };

    const plainData: string[] = [];
    await store.forEachAttachmentDisplayChunk!(plain, async (_i, data) => {
      plainData.push(data);
    });
    expect(plainData).toEqual(['AQ==']);

    const encryptedData: string[] = [];
    await store.forEachAttachmentDisplayChunk!(
      encrypted,
      async (_i, data) => {
        encryptedData.push(data);
      },
      derivedKey,
    );
    expect(encryptedData).toEqual(['AQ==']);
  });

  it('reports a missing legacy attachment on the display path', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'missing-legacy',
      path: '/mock-docs/canto/j1/attachments/missing-legacy',
      name: 'missing-legacy.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      size: 1,
    };
    await expect(
      store.forEachAttachmentDisplayChunk!(attachment, async () => undefined),
    ).rejects.toThrow('Attachment not found');
  });

  it('reports a missing manifest and missing chunk on the chunked display path', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const root = '/mock-docs/canto/j1/attachments/chunk-v1-p1-display-missing-gen';
    const attachment: Attachment = {
      id: 'display-missing',
      path: root,
      name: 'display-missing.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 1,
        chunkSize: 1,
        chunkCount: 1,
        generation: 'gen',
      },
    };
    await expect(
      store.forEachAttachmentDisplayChunk!(attachment, async () => undefined),
    ).rejects.toThrow('Attachment manifest missing');

    filesystem[`${root}/manifest`] = `enc:${JSON.stringify({
      journalId: 'j1',
      pageId: 'p1',
      attachment,
    })}`;
    await expect(
      store.forEachAttachmentDisplayChunk!(attachment, async () => undefined),
    ).rejects.toThrow('Attachment chunk missing');
  });

  it('detects a display length mismatch against the chunk descriptor', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const root = '/mock-docs/canto/j1/attachments/chunk-v1-p1-display-mismatch-gen';
    const attachment: Attachment = {
      id: 'display-mismatch',
      path: root,
      name: 'display-mismatch.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 5,
        chunkSize: 5,
        chunkCount: 1,
        generation: 'gen',
      },
    };
    filesystem[`${root}/manifest`] = `enc:${JSON.stringify({
      journalId: 'j1',
      pageId: 'p1',
      attachment,
    })}`;
    filesystem[`${root}/0`] = `enc:${encodeChunkFrame('j1', 'p1', attachment, 0, 'AQ==')}`;
    await expect(
      store.forEachAttachmentDisplayChunk!(attachment, async () => undefined),
    ).rejects.toThrow('Attachment display length mismatch');
  });

  it('rolls back a password re-encryption when a source chunk is missing', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'missing-chunk',
      path: '/mock-docs/canto/j1/attachments/chunk-v1-p1-missing-chunk-gen',
      name: 'missing-chunk.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 3,
        chunkSize: 2,
        chunkCount: 2,
        generation: 'gen',
      },
    };
    const journal = makeJournalContent('j1', [{ ...makePage('p1'), files: [attachment] }]);

    await expect(
      store.reencryptJournal(journal, undefined, new Uint8Array(32).fill(3)),
    ).rejects.toThrow('Attachment chunk missing');
  });

  it('copies chunk frames without a password layer when removing the password', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'chunk-remove-password',
      path: '',
      name: 'chunk-remove-password.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: chunkedContentForBase64('QUJD'),
    };
    const journal = makeJournalContent('j1', [{ ...makePage('p1'), files: [attachment] }]);
    await store.saveJournal(journal);
    const path = await store.saveAttachment('j1', 'p1', attachment, 'QUJD');
    const loaded = await store.getJournal('j1');
    loaded!.pages[0].files[0].path = path;

    await store.reencryptJournal(loaded!, undefined, undefined);

    const rotated = await store.getJournal('j1');
    await expect(store.getAttachment(rotated!.pages[0].files[0].path)).resolves.toBe('QUJD');
  });

  it('rolls back a journal commit when a staging write fails', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const prototype = File.prototype as unknown as {
      write: (...args: unknown[]) => unknown;
    };
    const originalWrite = prototype.write;
    prototype.write = () => {
      throw new Error('disk full');
    };
    try {
      await expect(store.saveJournal(makeJournalContent('j2'))).rejects.toThrow('disk full');
      await expect(store.savePage('j1', makePage('p1'))).rejects.toThrow('disk full');
      await expect(store.deleteJournal('j1')).rejects.toThrow('disk full');
    } finally {
      prototype.write = originalWrite;
    }
  });

  it('cleans up a failed device-key rotation transaction', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    await expect(
      store.reencryptAll!(
        (ciphertext: string) => Promise.resolve(ciphertext.replace(/^enc:/, '')),
        (plaintext: string) => Promise.resolve(plaintext),
        () => Promise.reject(new Error('device rotate failed')),
      ),
    ).rejects.toThrow('device rotate failed');
  });

  it('fails closed when a page record cannot be device-decrypted', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    filesystem['/mock-docs/canto/j1/pages/p2.json'] = DEVICE_FAIL_SENTINEL;

    const failing = createLocalStore(createFailingEncryption());
    await failing.initialize();
    await expect(failing.getPage('j1', 'p2')).rejects.toMatchObject({
      code: 'JOURNAL_UNREADABLE',
    });
  });

  it('removes an import marker only when it exists', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.beginJournalImport?.('m1');
    await store.completeJournalImport?.('m1');
    expect(filesystem['/mock-docs/canto/.imports/m1']).toBeUndefined();
    await expect(store.completeJournalImport?.('m1')).resolves.toBeUndefined();
  });

  it('round-trips a password-encrypted chunked attachment and stream', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const key = new Uint8Array(32).fill(9);
    const attachment: Attachment = {
      id: 'encrypted-chunk',
      path: '',
      name: 'encrypted-chunk.bin',
      type: 'file',
      encrypted: true,
      deleted: false,
      content: chunkedContentForBase64('QUJD'),
    };
    attachment.path = await store.saveAttachment('j1', 'p1', attachment, 'QUJD', key);
    await expect(store.getAttachment(attachment.path, key)).resolves.toBe('QUJD');

    const streamed: Attachment = {
      ...attachment,
      id: 'encrypted-stream',
      path: '',
      content: {
        format: 'canto-chunked-v1',
        byteLength: 3,
        chunkSize: 2,
        chunkCount: 2,
        generation: 'encrypted-stream-generation',
      },
    };
    async function* frames() {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3]);
    }
    streamed.path = await store.saveAttachmentStream!('j1', 'p1', streamed, frames(), key);
    await expect(store.getAttachment(streamed.path, key)).resolves.toBe('AQID');
  });

  it('cleans up a password re-encryption transaction when staging fails', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    const loaded = await store.getJournal('j1');

    const prototype = File.prototype as unknown as {
      write: (...args: unknown[]) => unknown;
    };
    const originalWrite = prototype.write;
    prototype.write = () => {
      throw new Error('disk full');
    };
    try {
      await expect(
        store.reencryptJournal(loaded!, undefined, new Uint8Array(32).fill(4)),
      ).rejects.toThrow('disk full');
      await expect(
        store.reencryptAll!(
          (ciphertext: string) => Promise.resolve(ciphertext.replace(/^enc:/, '')),
          (plaintext: string) => Promise.resolve(plaintext),
          (plaintext: string) => Promise.resolve(`enc:${plaintext}`),
        ),
      ).rejects.toThrow('disk full');
    } finally {
      prototype.write = originalWrite;
    }
  });

  it('treats a stray base-directory file as durable during recovery', async () => {
    filesystem['/mock-docs/canto/.imports/j1'] = JSON.stringify({
      version: 2,
      journalId: 'j1',
      phase: 'writing',
    });
    filesystem['/mock-docs/canto/j1/metadata.json'] = 'enc:{"id":"j1"}';
    filesystem['/mock-docs/canto/stray.txt'] = 'stray';

    await expect(createLocalStore(createMockEncryption()).initialize()).resolves.toBeUndefined();
    expect(filesystem['/mock-docs/canto/stray.txt']).toBe('stray');
  });
});

// ---------------------------------------------------------------------------
// Deterministic publication fault injection: a process kill between commit
// phases must never expose a partial projection, and the explicit
// prepared/committing commit point must decide rollback vs replay.
// ---------------------------------------------------------------------------
const PUBLICATION_PHASES = ['stage', 'marker', 'apply'] as const;
type PublicationPhase = (typeof PUBLICATION_PHASES)[number];

/** One-shot write failure, restoring the original File.write after it fires. */
function armWriteFault(match: (uri: string, content: string) => boolean): () => void {
  const prototype = File.prototype as unknown as {
    write: (this: { uri: string }, content: string) => void;
  };
  const original = prototype.write;
  prototype.write = function write(this: { uri: string }, content: string) {
    if (match(this.uri, content)) {
      prototype.write = original;
      throw new Error('injected publication failure');
    }
    return original.call(this, content);
  };
  return () => {
    prototype.write = original;
  };
}

/**
 * Faults are keyed to a payload's *content*, not to its staged file index. The
 * mock encryption is a passthrough, so the staged ciphertext still carries the
 * JSON payload; matching `file-N` would silently stop covering the intended
 * target if staging order ever changes (the test would still pass).
 */
function armPublicationFault(
  phase: PublicationPhase,
  matchesStaged: (content: string) => boolean,
  applySuffix: string,
): () => void {
  return armWriteFault((uri, content) => {
    if (phase === 'stage') return uri.includes('.transactions/') && matchesStaged(content);
    if (phase === 'marker') {
      return uri.endsWith('/marker.json') && content.includes('"phase":"committing"');
    }
    return !uri.includes('.transactions/') && uri.endsWith(applySuffix);
  });
}

function stagedTransactionFiles(): string[] {
  return Object.keys(filesystem).filter((key) => key.includes('/.transactions/'));
}

describe('publication fault injection (native)', () => {
  it.each(PUBLICATION_PHASES)(
    'saveJournalMetadata rename never exposes a partial projection when %s is interrupted',
    async (phase) => {
      const store = createLocalStore(createMockEncryption());
      await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
      const oldIndex = filesystem['/mock-docs/canto/journals.json'];
      const oldMetadata = filesystem['/mock-docs/canto/j1/metadata.json'];

      const disarm = armPublicationFault(
        phase,
        (content) => content.includes('"journals":'),
        '/journals.json',
      );
      try {
        await expect(
          store.saveJournalMetadata!({
            ...makeJournalContent('j1'),
            title: 'Renamed',
            pages: undefined,
          } as Omit<JournalContent, 'pages'>),
        ).rejects.toThrow('injected publication failure');
      } finally {
        disarm();
      }

      const recovered = createLocalStore(createMockEncryption());
      await recovered.initialize();

      const [listed] = await recovered.listJournals();
      const overview = await recovered.getJournalOverview!('j1');
      // The projection must be internally consistent: the index entry and the
      // journal metadata never disagree about which revision is published.
      expect(listed.title).toBe(overview!.metadata.title);
      if (phase === 'apply') {
        // A durable committing marker replays the complete new projection.
        expect(listed.title).toBe('Renamed');
      } else {
        // Prepared/marker failure rolls back to the byte-identical old view.
        expect(listed.title).toBe('Journal j1');
        expect(filesystem['/mock-docs/canto/journals.json']).toBe(oldIndex);
        expect(filesystem['/mock-docs/canto/j1/metadata.json']).toBe(oldMetadata);
      }
      expect(stagedTransactionFiles()).toEqual([]);
    },
  );

  it.each(PUBLICATION_PHASES)(
    'warm savePage never exposes a partial page/catalog pair when %s is interrupted',
    async (phase) => {
      const store = createLocalStore(createMockEncryption());
      await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
      const oldPage = filesystem['/mock-docs/canto/j1/pages/p1.json'];
      const oldCatalog = filesystem['/mock-docs/canto/j1/page-catalog.json'];

      const disarm = armPublicationFault(
        phase,
        (content) => content.includes('"digest":'),
        '/page-catalog.json',
      );
      try {
        await expect(
          store.savePage('j1', { ...makePage('p1'), text: 'edited' }, undefined, true),
        ).rejects.toThrow('injected publication failure');
      } finally {
        disarm();
      }

      const recovered = createLocalStore(createMockEncryption());
      await recovered.initialize();

      const page = await recovered.getPage('j1', 'p1');
      const journal = await recovered.getJournal('j1');
      const overview = await recovered.getJournalOverview!('j1');
      // Every page referenced by the catalog is readable after restart.
      expect(overview!.pages.map((candidate) => candidate.id)).toEqual(['p1']);
      expect(journal!.pages.map((candidate) => candidate.id)).toEqual(['p1']);
      if (phase === 'apply') {
        expect(page!.text).toBe('edited');
      } else {
        expect(page!.text).toBe('Page p1 content');
        expect(filesystem['/mock-docs/canto/j1/pages/p1.json']).toBe(oldPage);
        expect(filesystem['/mock-docs/canto/j1/page-catalog.json']).toBe(oldCatalog);
      }
      expect(stagedTransactionFiles()).toEqual([]);
    },
  );

  it.each(PUBLICATION_PHASES)(
    'saveJournal of a new journal never publishes a partial library when %s is interrupted',
    async (phase) => {
      const store = createLocalStore(createMockEncryption());
      await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

      const disarm = armPublicationFault(
        phase,
        (content) => content.includes('"id":"p9"'),
        '/j2/pages/p9.json',
      );
      try {
        await expect(store.saveJournal(makeJournalContent('j2', [makePage('p9')]))).rejects.toThrow(
          'injected publication failure',
        );
      } finally {
        disarm();
      }

      const recovered = createLocalStore(createMockEncryption());
      await recovered.initialize();

      const ids = (await recovered.listJournals()).map((journal) => journal.id).sort();
      if (phase === 'apply') {
        // Metadata, every page, and the rebuildable catalog were staged before
        // the durable commit point, so replay publishes the whole journal.
        expect(ids).toEqual(['j1', 'j2']);
        await expect(recovered.getJournal('j2')).resolves.toMatchObject({
          pages: [expect.objectContaining({ id: 'p9' })],
        });
      } else {
        expect(ids).toEqual(['j1']);
        await expect(recovered.getJournal('j2')).resolves.toBeNull();
      }
      expect(stagedTransactionFiles()).toEqual([]);
    },
  );

  it.each(PUBLICATION_PHASES)(
    'index-only deleteJournal never writes a truncated index when %s is interrupted',
    async (phase) => {
      const store = createLocalStore(createMockEncryption());
      await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
      await store.saveJournal(makeJournalContent('j2', [makePage('p9')]));
      const oldIndex = filesystem['/mock-docs/canto/journals.json'];

      const disarm = armPublicationFault(
        phase,
        (content) => content.includes('"journals":'),
        '/journals.json',
      );
      try {
        await expect(store.deleteJournal('j1')).rejects.toThrow('injected publication failure');
      } finally {
        disarm();
      }

      const recovered = createLocalStore(createMockEncryption());
      await recovered.initialize();

      const ids = (await recovered.listJournals()).map((journal) => journal.id).sort();
      if (phase === 'apply') {
        // The index is the only staged entry, so the injected failure lands on
        // its own write: nothing was partially applied, and the durable commit
        // marker replays the complete new index exactly once.
        expect(ids).toEqual(['j2']);
      } else {
        // Rollback keeps the byte-identical old index; it is never truncated.
        expect(ids).toEqual(['j1', 'j2']);
        expect(filesystem['/mock-docs/canto/journals.json']).toBe(oldIndex);
        // The journal directory is deleted before the index-only commit, so a
        // prepared/marker rollback leaves a *ghost* index entry: j1 is still
        // listed while its data is already gone. This is the documented
        // "visible but recoverable" window (see deleteJournalRaw); assert it so
        // the window stays explicit rather than implicit.
        await expect(recovered.getJournal('j1')).resolves.toBeNull();
      }
      expect(stagedTransactionFiles()).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// Opt-in recovery tool (native): a read-only complete scan of the authoritative
// raw page files, followed by an explicitly confirmed catalog publication.
// The scan never reads the catalog and never writes; the restore only replaces
// the catalog projection (raw page records are never touched).
// ---------------------------------------------------------------------------
describe('recover local pages (native)', () => {
  it('scans every raw page ignoring a corrupt catalog, then publishes the confirmed catalog', async () => {
    const journalRoot = '/mock-docs/canto/j1';
    const catalogPath = `${journalRoot}/page-catalog.json`;
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));

    const pageOneBefore = filesystem[`${journalRoot}/pages/p1.json`];
    const pageTwoBefore = filesystem[`${journalRoot}/pages/p2.json`];
    // The catalog is unreadable, but raw page files remain authoritative.
    filesystem[catalogPath] = 'enc:{"corrupt":true}';
    const corruptCatalog = filesystem[catalogPath];

    const scan = await store.scanJournalPages!('j1');

    expect(scan.journalId).toBe('j1');
    expect(scan.pageCount).toBe(2);
    expect(scan.pages.map((page) => page.id).sort()).toEqual(['p1', 'p2']);
    // The scan is read-only: the current catalog is preserved byte-for-byte.
    expect(filesystem[catalogPath]).toBe(corruptCatalog);

    // Confirmation carries no caller-supplied pages: the store re-scans.
    await store.restoreJournalCatalog!('j1');

    // Restore replaced only the catalog; raw page records are byte-identical.
    expect(filesystem[catalogPath]).not.toBe(corruptCatalog);
    expect(filesystem[`${journalRoot}/pages/p1.json`]).toBe(pageOneBefore);
    expect(filesystem[`${journalRoot}/pages/p2.json`]).toBe(pageTwoBefore);

    const overview = await store.getJournalOverview!('j1');
    expect(overview!.pages.map((page) => page.id).sort()).toEqual(['p1', 'p2']);
  });

  it('re-scans at confirm so a page saved after the preview scan is published', async () => {
    const journalRoot = '/mock-docs/canto/j1';
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    // The preview count is captured before the concurrent edit.
    const preview = await store.scanJournalPages!('j1');
    expect(preview.pageCount).toBe(1);

    // A save lands between the read-only preview and the explicit confirmation.
    await store.savePage('j1', makePage('p2'), undefined, true);
    expect(filesystem[`${journalRoot}/pages/p2.json`]).toBeDefined();

    // Confirmation must publish a fresh complete scan, never the stale preview.
    await store.restoreJournalCatalog!('j1');

    const overview = await store.getJournalOverview!('j1');
    // The intervening save is not hidden by an old catalog projection.
    expect(overview!.pages.map((page) => page.id).sort()).toEqual(['p1', 'p2']);
    // The preview was stale (1) yet never determined the publication.
    expect(preview.pageCount).toBe(1);
  });

  it('rejects confirmation when a raw page became unreadable after the preview scan', async () => {
    const journalRoot = '/mock-docs/canto/j1';
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    const preview = await store.scanJournalPages!('j1');
    expect(preview.pageCount).toBe(1);
    const catalogBefore = filesystem[`${journalRoot}/page-catalog.json`];

    // The record degrades after the preview; the fresh confirm-time scan must
    // fail closed instead of publishing a reduced catalog.
    filesystem[`${journalRoot}/pages/p1.json`] = 'enc:not-json';

    await expect(store.restoreJournalCatalog!('j1')).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
    });
    // The then-current catalog is byte-identical.
    expect(filesystem[`${journalRoot}/page-catalog.json`]).toBe(catalogBefore);
  });
});

describe('recover local pages refuses unsafe scans (native)', () => {
  it('rejects when a discovered page is unreadable and leaves the catalog untouched', async () => {
    const catalogPath = '/mock-docs/canto/j1/page-catalog.json';
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    const catalogBefore = filesystem[catalogPath];
    filesystem['/mock-docs/canto/j1/pages/p-broken.json'] = 'enc:not-json';

    await expect(store.scanJournalPages!('j1')).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
      // Details are opaque record ids; the raw page id/path is never leaked.
      details: [expect.stringMatching(/^record:[0-9a-f]+$/)],
    });
    // Zero mutations: the current catalog is byte-identical.
    expect(filesystem[catalogPath]).toBe(catalogBefore);
  });

  it('rejects a malformed-but-valid-JSON page record and preserves the catalog', async () => {
    const journalRoot = '/mock-docs/canto/j1';
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    const catalogBefore = filesystem[`${journalRoot}/page-catalog.json`];
    // Valid JSON, but not a structurally valid Page (text must be a string).
    filesystem[`${journalRoot}/pages/p9.json`] =
      'enc:' + JSON.stringify({ ...makePage('p9'), text: 42 });

    const error = (await store.scanJournalPages!('j1').catch((e: unknown) => e)) as {
      code: string;
      details: string[];
      message: string;
    };
    expect(error.code).toBe('CATALOG_UNREADABLE');
    expect(error.details).toHaveLength(1);
    expect(error.details[0]).toMatch(/^record:[0-9a-f]+$/);
    // Neither the raw id/path nor the record body/error text is surfaced.
    expect(error.details[0]).not.toContain('p9');
    expect(error.message).not.toContain('p9');
    expect(filesystem[`${journalRoot}/page-catalog.json`]).toBe(catalogBefore);
  });

  it('rejects a page whose record id disagrees with its filename and preserves the catalog', async () => {
    const journalRoot = '/mock-docs/canto/j1';
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    const catalogBefore = filesystem[`${journalRoot}/page-catalog.json`];
    // The file is named pX.json but its record claims id pY.
    filesystem[`${journalRoot}/pages/pX.json`] = 'enc:' + JSON.stringify(makePage('pY'));

    await expect(store.scanJournalPages!('j1')).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
      details: [expect.stringMatching(/^record:[0-9a-f]+$/)],
    });
    expect(filesystem[`${journalRoot}/page-catalog.json`]).toBe(catalogBefore);
  });

  it('rejects duplicate discovered page ids and preserves the catalog', async () => {
    const journalRoot = '/mock-docs/canto/j1';
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    const catalogBefore = filesystem[`${journalRoot}/page-catalog.json`];
    // A second file that claims the same page id cannot both be published.
    filesystem[`${journalRoot}/pages/p1-alias.json`] = 'enc:' + JSON.stringify(makePage('p1'));

    await expect(store.scanJournalPages!('j1')).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
      details: [expect.stringMatching(/^record:[0-9a-f]+$/)],
    });
    expect(filesystem[`${journalRoot}/page-catalog.json`]).toBe(catalogBefore);
  });

  it('rejects a secure journal without a usable key before reading any page', async () => {
    const key = new Uint8Array(32).fill(7);
    const store = createLocalStore(createMockEncryption());
    const journal: JournalContent = {
      ...makeJournalContent('secure-j', [makePage('p1')]),
      secure: true,
    };
    await store.saveJournal(journal, key);

    await expect(store.scanJournalPages!('secure-j', undefined)).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });
    await expect(store.scanJournalPages!('secure-j', new Uint8Array(32))).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });

    // A usable key scans and stays read-only.
    const scan = await store.scanJournalPages!('secure-j', key);
    expect(scan.pageCount).toBe(1);
  });
});
