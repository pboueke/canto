import { LEGACY_ATTACHMENT_SYNC_LIMIT_BYTES, SyncEngine } from '../sync/engine';
import type { LocalStore } from '../storage/types';
import type { RemoteStore, SyncIndex } from '../sync/types';
import type { Page, JournalContent } from 'canto-data';

// Mock encryption to be passthrough so mock stores work with plain strings
jest.mock('../encryption/utils', () => ({
  aesGcmEncrypt: jest.fn((plaintext: string) => Promise.resolve(plaintext)),
  aesGcmDecrypt: jest.fn((ciphertext: string) => Promise.resolve(ciphertext)),
}));

const SYNC_KEY = new Uint8Array(32).fill(1);

const makePage = (id: string, modified: number, deleted = false): Page => ({
  id,
  text: `Page ${id}`,
  date: '2026-03-12T10:00:00Z',
  tags: [],
  files: [],
  images: [],
  comments: [],
  modified,
  deleted,
});

const makeJournal = (pages: Page[]): JournalContent => ({
  id: 'journal-1',
  title: 'Test Journal',
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
    remoteSync: true,
    autoSync: false,
  },
  version: 1,
});

function createMockLocalStore(journal: JournalContent | null): LocalStore {
  const pages = new Map(journal?.pages.map((p) => [p.id, p]) ?? []);

  return {
    initialize: jest.fn(),
    listJournals: jest.fn().mockResolvedValue(journal ? [journal] : []),
    getJournal: jest.fn().mockResolvedValue(journal),
    saveJournal: jest.fn(),
    deleteJournal: jest.fn(),
    getPage: jest
      .fn()
      .mockImplementation((_jId: string, pId: string) => Promise.resolve(pages.get(pId) ?? null)),
    savePage: jest.fn(),
    deletePage: jest.fn(),
    saveAttachment: jest.fn(),
    getAttachment: jest.fn(),
    getAttachmentStorageSize: jest.fn().mockResolvedValue({ status: 'known', bytes: 0 }),
    deleteAttachment: jest.fn(),
    reencryptJournal: jest.fn(),
    reencryptAll: jest.fn(),
  };
}

/** Build a SyncIndex from pages (mirrors what the engine does). */
function buildSyncIndex(pages: Page[]): SyncIndex {
  const index: SyncIndex = {};
  for (const p of pages) {
    index[p.id] = { modified: p.modified, ...(p.deleted ? { deleted: true } : {}) };
  }
  return index;
}

function createMockRemoteStore(journal: JournalContent | null): RemoteStore {
  // Store uploaded pages and sync index so they can be downloaded later
  const uploadedPages = new Map<string, string>();
  const remotePages = journal?.pages ?? [];

  return {
    provider: 'gdrive',
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    isRemotePath: jest.fn((path: string) => path.startsWith('gdrive://')),
    buildRemotePath: jest.fn(
      (journalId: string, filename: string) => `gdrive://${journalId}/attachments/${filename}`,
    ),
    listRemoteJournals: jest
      .fn()
      .mockResolvedValue(
        journal ? [{ id: journal.id, title: journal.title, lastModified: 0 }] : [],
      ),
    uploadJournalMeta: jest.fn(),
    downloadJournalMeta: jest.fn().mockResolvedValue(journal ? JSON.stringify(journal) : null),
    uploadPage: jest.fn().mockImplementation((_jId: string, pageId: string, content: string) => {
      uploadedPages.set(pageId, content);
      return Promise.resolve();
    }),
    downloadPage: jest.fn().mockImplementation((_jId: string, pId: string) => {
      // Check uploaded pages first (for round-trip tests), then remote pages
      if (uploadedPages.has(pId)) return Promise.resolve(uploadedPages.get(pId)!);
      const page = remotePages.find((p) => p.id === pId);
      return Promise.resolve(page ? JSON.stringify(page) : null);
    }),
    deletePage: jest.fn(),
    uploadSyncIndex: jest.fn(),
    downloadSyncIndex: jest
      .fn()
      .mockResolvedValue(journal && remotePages.length > 0 ? buildSyncIndex(remotePages) : null),
    uploadAttachment: jest
      .fn()
      .mockImplementation((_jId: string, localPath: string) =>
        Promise.resolve(`gdrive://journal-1/attachments/${localPath.split('/').pop()}`),
      ),
    downloadAttachment: jest.fn().mockResolvedValue('base64data'),
    deleteAttachment: jest.fn(),
    deleteJournal: jest.fn(),
  };
}

describe('SyncEngine', () => {
  it('uploads local-only pages', async () => {
    const localPage = makePage('p1', 1000);
    const local = createMockLocalStore(makeJournal([localPage]));
    const remote = createMockRemoteStore(makeJournal([]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1', SYNC_KEY);

    expect(result.uploaded).toContain('p1');
    expect(remote.uploadPage).toHaveBeenCalledWith('journal-1', 'p1', expect.any(String));
  });

  it('downloads remote-only pages', async () => {
    const remotePage = makePage('p2', 2000);
    const local = createMockLocalStore(makeJournal([]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1', SYNC_KEY);

    expect(result.downloaded).toContain('p2');
    expect(local.savePage).toHaveBeenCalledWith('journal-1', remotePage, SYNC_KEY, true);
  });

  it('uploads locally newer pages', async () => {
    const localPage = makePage('p1', 3000);
    const remotePage = makePage('p1', 1000);
    const local = createMockLocalStore(makeJournal([localPage]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1', SYNC_KEY);

    expect(result.uploaded).toContain('p1');
    expect(remote.uploadPage).toHaveBeenCalledWith('journal-1', 'p1', expect.any(String));
  });

  it('downloads remotely newer pages', async () => {
    const localPage = makePage('p1', 1000);
    const remotePage = makePage('p1', 3000);
    const local = createMockLocalStore(makeJournal([localPage]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1', SYNC_KEY);

    expect(result.downloaded).toContain('p1');
  });

  it('skips pages with equal timestamps', async () => {
    const page = makePage('p1', 1000);
    const local = createMockLocalStore(makeJournal([page]));
    const remote = createMockRemoteStore(makeJournal([page]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1', SYNC_KEY);

    expect(result.uploaded).toHaveLength(0);
    expect(result.downloaded).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
  });

  it('propagates local deletions to remote', async () => {
    const localPage = makePage('p1', 2000, true); // locally deleted
    const remotePage = makePage('p1', 1000, false); // still on remote
    const local = createMockLocalStore(makeJournal([localPage]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1', SYNC_KEY);

    expect(result.deleted).toContain('p1');
    expect(remote.deletePage).toHaveBeenCalledWith('journal-1', 'p1');
  });

  it('propagates remote deletions to local', async () => {
    const localPage = makePage('p1', 1000, false);
    const remotePage = makePage('p1', 2000, true); // remotely deleted
    const local = createMockLocalStore(makeJournal([localPage]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1', SYNC_KEY);

    expect(result.deleted).toContain('p1');
    expect(local.deletePage).toHaveBeenCalledWith('journal-1', 'p1', SYNC_KEY);
  });

  it('does not upload deleted local-only pages', async () => {
    const localPage = makePage('p1', 1000, true);
    const local = createMockLocalStore(makeJournal([localPage]));
    const remote = createMockRemoteStore(makeJournal([]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1', SYNC_KEY);

    expect(result.uploaded).toHaveLength(0);
    expect(remote.uploadPage).not.toHaveBeenCalled();
  });

  it('returns empty result for non-existent journal', async () => {
    const local = createMockLocalStore(null);
    const remote = createMockRemoteStore(null);

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('nonexistent', SYNC_KEY);

    expect(result.uploaded).toHaveLength(0);
    expect(result.downloaded).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
  });

  it('syncAll syncs all journals', async () => {
    const page = makePage('p1', 1000);
    const journal = makeJournal([page]);
    const local = createMockLocalStore(journal);
    const remote = createMockRemoteStore(makeJournal([]));

    const engine = new SyncEngine(local, remote);
    const results = await engine.syncAll(() => SYNC_KEY);

    expect(results).toHaveLength(1);
    expect(results[0].uploaded).toContain('p1');
  });

  describe('derivedKey passthrough', () => {
    it('passes derivedKey to local.getJournal', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const remote = createMockRemoteStore(makeJournal([]));
      const key = new Uint8Array(32);

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', key);

      expect(local.getJournal).toHaveBeenCalledWith('journal-1', key);
    });

    it('passes derivedKey to local.savePage on download', async () => {
      const remotePage = makePage('p1', 1000);
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      const key = new Uint8Array(32);

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', key);

      expect(local.savePage).toHaveBeenCalledWith('journal-1', remotePage, key, true);
    });

    it('passes derivedKey to local.deletePage on remote deletion', async () => {
      const localPage = makePage('p1', 1000, false);
      const remotePage = makePage('p1', 2000, true);
      const local = createMockLocalStore(makeJournal([localPage]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      const key = new Uint8Array(32);

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', key);

      expect(local.deletePage).toHaveBeenCalledWith('journal-1', 'p1', key);
    });
  });

  describe('syncAll with getKey', () => {
    it('passes per-journal derived keys via getKey callback', async () => {
      const page = makePage('p1', 1000);
      const journal = makeJournal([page]);
      const local = createMockLocalStore(journal);
      const remote = createMockRemoteStore(makeJournal([]));
      const key = new Uint8Array(32).fill(7);

      const engine = new SyncEngine(local, remote);
      await engine.syncAll((id) => (id === 'journal-1' ? key : undefined));

      expect(local.getJournal).toHaveBeenCalledWith('journal-1', key);
    });

    it('skips journals when getKey returns undefined', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const remote = createMockRemoteStore(makeJournal([]));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const engine = new SyncEngine(local, remote);
      const results = await engine.syncAll(() => undefined);

      // Journal is skipped when no key is available
      expect(results).toHaveLength(0);
      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('propagates remote upload errors', async () => {
      const page = makePage('p1', 1000);
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      (remote.uploadPage as jest.Mock).mockRejectedValueOnce(new Error('Upload failed'));

      const engine = new SyncEngine(local, remote);
      await expect(engine.sync('journal-1', SYNC_KEY)).rejects.toThrow('Upload failed');
    });

    it('gracefully handles remote download errors (warns and continues)', async () => {
      const remotePage = makePage('p1', 1000);
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      (remote.downloadPage as jest.Mock).mockRejectedValueOnce(new Error('Download failed'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const engine = new SyncEngine(local, remote);
      const result = await engine.sync('journal-1', SYNC_KEY);

      expect(result.downloaded).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to download page p1'),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it('gracefully handles local save errors during download (warns and continues)', async () => {
      const remotePage = makePage('p1', 1000);
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      (local.savePage as jest.Mock).mockRejectedValueOnce(new Error('Disk full'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const engine = new SyncEngine(local, remote);
      const result = await engine.sync('journal-1', SYNC_KEY);

      expect(result.downloaded).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to download page p1'),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it('propagates getJournal errors', async () => {
      const local = createMockLocalStore(null);
      const remote = createMockRemoteStore(null);
      (local.getJournal as jest.Mock).mockRejectedValueOnce(new Error('Decrypt failed'));

      const engine = new SyncEngine(local, remote);
      await expect(engine.sync('journal-1', SYNC_KEY)).rejects.toThrow('Decrypt failed');
    });
  });

  describe('sync snapshot and remote-index fencing', () => {
    it('does not index a local edit made after its snapshot page uploads', async () => {
      const snapshotPage = makePage('p1', 1000);
      const laterPage = makePage('p1', 2000);
      let currentJournal = makeJournal([snapshotPage]);
      const local = createMockLocalStore(currentJournal);
      (local.getJournal as jest.Mock).mockImplementation(() => Promise.resolve(currentJournal));
      const remote = createMockRemoteStore(makeJournal([]));
      (remote.uploadPage as jest.Mock).mockImplementation(() => {
        currentJournal = makeJournal([laterPage]);
        return Promise.resolve();
      });

      await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      expect(remote.uploadSyncIndex).toHaveBeenCalledWith('journal-1', {
        p1: { modified: 1000 },
      });
      expect(remote.uploadPage).toHaveBeenCalledWith(
        'journal-1',
        'p1',
        expect.stringContaining('"modified":1000'),
      );
    });

    it('retains a remote-only index entry when its page download is missing', async () => {
      const remotePage = makePage('p1', 3000);
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      (remote.downloadPage as jest.Mock).mockResolvedValueOnce(null);

      const result = await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      expect(result.downloaded).toEqual([]);
      expect(remote.uploadSyncIndex).toHaveBeenCalledWith('journal-1', {
        p1: { modified: 3000 },
      });
      expect(local.savePage).not.toHaveBeenCalled();
    });

    it('retains the remote index instead of overwriting it when a newer page download fails', async () => {
      const localPage = makePage('p1', 1000);
      const remotePage = makePage('p1', 3000);
      const local = createMockLocalStore(makeJournal([localPage]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      (remote.downloadPage as jest.Mock).mockRejectedValueOnce(
        new Error('transient download failure'),
      );
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      expect(remote.uploadSyncIndex).toHaveBeenCalledWith('journal-1', {
        p1: { modified: 3000 },
      });
      expect(local.savePage).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('uses the original snapshot index during a key-change re-upload', async () => {
      const snapshotPage = makePage('p1', 1000);
      const laterPage = makePage('p1', 2000);
      const snapshotJournal = { ...makeJournal([snapshotPage]), salt: 'bmV3LXNhbHQ=' };
      let currentJournal: JournalContent = snapshotJournal;
      const local = createMockLocalStore(snapshotJournal);
      (local.getJournal as jest.Mock).mockImplementation(() => Promise.resolve(currentJournal));
      const remoteJournal = { ...makeJournal([makePage('p1', 1000)]), salt: 'b2xkLXNhbHQ=' };
      const remote = createMockRemoteStore(remoteJournal);
      (remote.listRemoteJournals as jest.Mock).mockResolvedValue([
        { id: 'journal-1', title: 'Test Journal', lastModified: 0, salt: 'b2xkLXNhbHQ=' },
      ]);
      (remote.uploadPage as jest.Mock).mockImplementation(() => {
        currentJournal = { ...snapshotJournal, pages: [laterPage] };
        return Promise.resolve();
      });

      await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY, undefined, 'b2xkLXNhbHQ=');

      expect(remote.uploadSyncIndex).toHaveBeenCalledWith('journal-1', {
        p1: { modified: 1000 },
      });
    });
  });

  describe('attachment sync', () => {
    const makeAttachment = (id: string, path: string) => ({
      id,
      path,
      name: `${id}.png`,
      type: 'image' as const,
      encrypted: false,
      deleted: false,
    });

    it('uploads local attachments when uploading a page', async () => {
      const att = makeAttachment('img1', '/local/img1.png');
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      (local.getAttachment as jest.Mock).mockResolvedValue('base64data');

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY);

      expect(local.getAttachment).toHaveBeenCalledWith('/local/img1.png');
      expect(remote.uploadAttachment).toHaveBeenCalledWith(
        'journal-1',
        '/local/img1.png',
        expect.any(String), // encrypted attachment data
      );
    });

    it('skips already-remote attachments during upload', async () => {
      const att = makeAttachment('img1', 'gdrive://journal-1/attachments/img1.png');
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY);

      expect(local.getAttachment).not.toHaveBeenCalled();
      expect(remote.uploadAttachment).not.toHaveBeenCalled();
    });

    it('warns and continues when local attachment is missing', async () => {
      const att = makeAttachment('img1', '/local/missing.png');
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      (local.getAttachment as jest.Mock).mockResolvedValue(null);

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const engine = new SyncEngine(local, remote);
      const result = await engine.sync('journal-1', SYNC_KEY);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing local attachment'));
      expect(remote.uploadAttachment).not.toHaveBeenCalled();
      expect(result.uploaded).toContain('p1'); // page still uploaded
      consoleSpy.mockRestore();
    });

    it('downloads remote attachments and updates paths', async () => {
      const att = { ...makeAttachment('img1', '/remote/img1.png'), size: 1024 };
      const remotePage = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      (remote.downloadAttachment as jest.Mock).mockResolvedValue('base64data');
      (local.saveAttachment as jest.Mock).mockResolvedValue('/local/saved/img1.png');

      const engine = new SyncEngine(local, remote);
      const result = await engine.sync('journal-1', SYNC_KEY);

      expect(result.downloaded).toContain('p1');
      expect(remote.downloadAttachment).toHaveBeenCalled();
      expect(local.saveAttachment).toHaveBeenCalled();
    });

    it('defers an unknown remote legacy attachment before any whole-value download', async () => {
      const att = makeAttachment('unknown', '/remote/unknown.mp4');
      const remotePage = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));

      const result = await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      expect(remote.downloadAttachment).not.toHaveBeenCalled();
      expect(local.saveAttachment).not.toHaveBeenCalled();
      expect(local.savePage).toHaveBeenCalled();
      expect(result.warnings).toEqual([
        expect.objectContaining({
          pageId: 'p1',
          name: att.name,
          reason: 'legacy-attachment-too-large',
          size: undefined,
        }),
      ]);
    });

    it('defers an oversized remote legacy attachment before any whole-value download', async () => {
      const att = { ...makeAttachment('large', '/remote/large.mp4'), size: 512 * 1024 + 1 };
      const remotePage = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));

      await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      expect(remote.downloadAttachment).not.toHaveBeenCalled();
      expect(local.saveAttachment).not.toHaveBeenCalled();
    });

    it('defers a generation-less remote descriptor without fetching chunks or saving its page', async () => {
      const att = {
        ...makeAttachment('legacy-chunk', '/remote/legacy-chunk'),
        content: {
          format: 'canto-chunked-v1' as const,
          byteLength: 1024,
          chunkSize: 512,
          chunkCount: 2,
        },
      };
      const remotePage = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      remote.downloadAttachmentChunk = jest.fn();
      local.saveAttachmentChunks = jest.fn();

      const result = await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      expect(result.warnings).toEqual([
        expect.objectContaining({
          pageId: 'p1',
          name: att.name,
          reason: 'chunk-generation-missing',
        }),
      ]);
      expect(remote.downloadAttachmentChunk).not.toHaveBeenCalled();
      expect(local.saveAttachmentChunks).not.toHaveBeenCalled();
      expect(local.savePage).not.toHaveBeenCalled();
      expect(result.downloaded).toEqual([]);
    });

    it('skips deleted attachments', async () => {
      const att = { ...makeAttachment('img1', '/local/img1.png'), deleted: true };
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY);

      expect(local.getAttachment).not.toHaveBeenCalled();
    });

    it('limits attachment uploads to two concurrent reads', async () => {
      const attachments = ['one', 'two', 'three'].map((id) =>
        makeAttachment(id, `/local/${id}.png`),
      );
      const page = { ...makePage('p1', 1000), images: attachments };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      let activeReads = 0;
      let maxActiveReads = 0;
      (local.getAttachment as jest.Mock).mockImplementation(async () => {
        activeReads++;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeReads--;
        return 'base64data';
      });

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY);

      expect(maxActiveReads).toBe(2);
      expect(remote.uploadAttachment).toHaveBeenCalledTimes(3);
    });

    it('uploads a descriptor attachment as bounded chunks before its page', async () => {
      const att = {
        ...makeAttachment('video', '/local/chunk-root'),
        content: {
          format: 'canto-chunked-v1' as const,
          byteLength: 1024,
          chunkSize: 512,
          chunkCount: 2,
          generation: 'generation-1',
        },
      };
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      const events: string[] = [];
      local.forEachAttachmentChunk = jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'first-frame');
        await visitor(1, 'second-frame');
      });
      remote.prepareAttachmentChunkUploads = jest.fn();
      remote.uploadAttachmentChunk = jest.fn(async (_journalId, _id, generation, index) => {
        expect(generation).toBe('generation-1');
        events.push(`chunk-${index}`);
      });
      (remote.uploadPage as jest.Mock).mockImplementation(async () => events.push('page'));

      await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      expect(remote.prepareAttachmentChunkUploads).toHaveBeenCalledWith(
        'journal-1',
        [att],
        undefined,
      );
      expect(remote.uploadAttachmentChunk).toHaveBeenCalledTimes(2);
      expect(remote.uploadAttachment).not.toHaveBeenCalled();
      expect(events).toEqual(['chunk-0', 'chunk-1', 'page']);
    });

    it('checkpoints a web chunk budget and resumes missing indexes without local reads', async () => {
      const att = {
        ...makeAttachment('video', '/local/chunk-root'),
        content: {
          format: 'canto-chunked-v1' as const,
          byteLength: 1536,
          chunkSize: 512,
          chunkCount: 3,
          generation: 'generation-1',
        },
      };
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      const persisted = new Set<number>();
      const localReads: number[] = [];
      local.forEachAttachmentChunk = jest.fn(async (_attachment, visitor, indexes) => {
        for (const index of indexes ?? []) {
          localReads.push(index);
          await visitor(index, `frame-${index}`);
        }
      });
      remote.listAttachmentChunkIndexes = jest.fn(async () => new Set(persisted));
      remote.uploadAttachmentChunk = jest.fn(async (_journalId, _id, _generation, index) => {
        persisted.add(index);
      });

      const first = await new SyncEngine(local, remote).sync(
        'journal-1',
        SYNC_KEY,
        undefined,
        undefined,
        undefined,
        { newChunkUploadBudget: 2 },
      );

      expect(first.checkpointed).toBe(true);
      expect(localReads).toEqual([0, 1]);
      expect(remote.uploadPage).not.toHaveBeenCalled();
      expect(remote.uploadSyncIndex).not.toHaveBeenCalled();
      expect(remote.prepareAttachmentChunkUploads).toBeUndefined();

      const second = await new SyncEngine(local, remote).sync(
        'journal-1',
        SYNC_KEY,
        undefined,
        undefined,
        undefined,
        { newChunkUploadBudget: 2 },
      );

      expect(second.checkpointed).toBeUndefined();
      expect(localReads).toEqual([0, 1, 2]);
      expect(remote.uploadPage).toHaveBeenCalledWith('journal-1', 'p1', expect.any(String));
      expect(remote.uploadSyncIndex).toHaveBeenCalled();
    });

    it('restarts a partial web upload in a larger immutable generation before uploading', async () => {
      const att = {
        ...makeAttachment('video', '/local/chunk-root'),
        content: {
          format: 'canto-chunked-v1' as const,
          byteLength: 1536,
          chunkSize: 512,
          chunkCount: 3,
          generation: 'generation-1',
        },
      };
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      const replacement = {
        ...att,
        path: '/local/new-chunk-root',
        content: {
          ...att.content,
          chunkSize: 1024,
          chunkCount: 2,
          generation: 'generation-2',
        },
      };
      const migratedPage = { ...page, images: [replacement], modified: 2000 };
      local.migrateAttachmentChunkGeneration = jest.fn().mockResolvedValue(migratedPage);
      local.forEachAttachmentChunk = jest.fn(async (_attachment, visitor, indexes) => {
        for (const index of indexes ?? []) await visitor(index, `frame-${index}`);
      });
      remote.listAttachmentChunkIndexes = jest.fn((_journalId, _id, generation) =>
        Promise.resolve(generation === 'generation-1' ? new Set([0]) : new Set()),
      );
      remote.uploadAttachmentChunk = jest.fn();

      await new SyncEngine(local, remote).sync(
        'journal-1',
        SYNC_KEY,
        undefined,
        undefined,
        undefined,
        { newChunkUploadBudget: 2, restartPartialUploadChunkSize: 1024 },
      );

      expect(local.migrateAttachmentChunkGeneration).toHaveBeenCalledWith(
        'journal-1',
        'p1',
        att.id,
        'generation-1',
        1024,
        SYNC_KEY,
      );
      expect(local.forEachAttachmentChunk).toHaveBeenCalledWith(
        replacement,
        expect.any(Function),
        new Set([0, 1]),
      );
      expect(remote.uploadAttachmentChunk).toHaveBeenCalledTimes(2);
      expect(remote.uploadAttachmentChunk).toHaveBeenCalledWith(
        'journal-1',
        att.id,
        'generation-2',
        0,
        'frame-0',
        undefined,
      );
      expect(remote.uploadPage).toHaveBeenCalledWith('journal-1', 'p1', expect.any(String));
    });

    it('retains a concurrently published index entry when checkpointing a completed page', async () => {
      const att = {
        ...makeAttachment('video', '/local/chunk-root'),
        content: {
          format: 'canto-chunked-v1' as const,
          byteLength: 512,
          chunkSize: 512,
          chunkCount: 1,
          generation: 'generation-1',
        },
      };
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      local.forEachAttachmentChunk = jest.fn(async (_attachment, visitor, indexes) => {
        for (const index of indexes ?? []) await visitor(index, `frame-${index}`);
      });
      remote.listAttachmentChunkIndexes = jest.fn(async () => new Set<number>());
      remote.uploadAttachmentChunk = jest.fn();
      (remote.downloadSyncIndex as jest.Mock)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ p2: { modified: 2000 } });

      const result = await new SyncEngine(local, remote).sync(
        'journal-1',
        SYNC_KEY,
        undefined,
        undefined,
        undefined,
        { newChunkUploadBudget: 1 },
      );

      expect(result.checkpointed).toBe(true);
      expect(remote.uploadSyncIndex).toHaveBeenCalledWith('journal-1', {
        p1: { modified: 1000 },
        p2: { modified: 2000 },
      });
    });

    it('defers a generation-less descriptor instead of overwriting stable remote chunks', async () => {
      const att = {
        ...makeAttachment('video', '/local/legacy-chunk-root'),
        content: {
          format: 'canto-chunked-v1' as const,
          byteLength: 1024,
          chunkSize: 512,
          chunkCount: 2,
        },
      };
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      local.forEachAttachmentChunk = jest.fn();
      remote.uploadAttachmentChunk = jest.fn();

      const result = await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      expect(result.warnings).toEqual([
        expect.objectContaining({
          pageId: 'p1',
          name: att.name,
          reason: 'chunk-generation-missing',
        }),
      ]);
      expect(local.forEachAttachmentChunk).not.toHaveBeenCalled();
      expect(remote.uploadAttachmentChunk).not.toHaveBeenCalled();
      expect(remote.uploadPage).not.toHaveBeenCalled();
    });

    it("retains a failed generation rather than deleting a concurrent uploader's chunks", async () => {
      const att = {
        ...makeAttachment('video', '/local/chunk-root'),
        content: {
          format: 'canto-chunked-v1' as const,
          byteLength: 1024,
          chunkSize: 512,
          chunkCount: 2,
          generation: 'new-generation',
        },
      };
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      local.forEachAttachmentChunk = jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'first-frame');
        await visitor(1, 'second-frame');
      });
      remote.uploadAttachmentChunk = jest.fn(async (_journalId, _id, _generation, index) => {
        if (index === 1) throw new Error('network failed');
      });
      remote.deleteAttachmentChunk = jest.fn();

      await expect(new SyncEngine(local, remote).sync('journal-1', SYNC_KEY)).rejects.toThrow(
        'network failed',
      );

      expect(remote.uploadPage).not.toHaveBeenCalled();
      // A second device can be uploading this immutable generation from the
      // same page snapshot. Client-side failure cleanup cannot prove it owns
      // chunk 0, so it must retain the unreachable generation.
      expect(remote.deleteAttachmentChunk).not.toHaveBeenCalled();
    });

    it('retains a replaced published generation so a concurrent page update cannot lose it', async () => {
      const oldAttachment = {
        ...makeAttachment('video', '/old/root'),
        content: {
          format: 'canto-chunked-v1' as const,
          byteLength: 1024,
          chunkSize: 512,
          chunkCount: 2,
          generation: 'old-generation',
        },
      };
      const newAttachment = {
        ...oldAttachment,
        path: '/new/root',
        content: { ...oldAttachment.content, generation: 'new-generation' },
      };
      const remotePage = { ...makePage('p1', 1000), images: [oldAttachment] };
      const localPage = { ...makePage('p1', 2000), images: [newAttachment] };
      const local = createMockLocalStore(makeJournal([localPage]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      const events: string[] = [];
      local.forEachAttachmentChunk = jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'first-frame');
        await visitor(1, 'second-frame');
      });
      remote.uploadAttachmentChunk = jest.fn(async () => {
        events.push('chunk');
      });
      (remote.uploadPage as jest.Mock).mockImplementation(async () => {
        events.push('page');
      });
      remote.deleteAttachmentChunk = jest.fn(async () => {
        events.push('cleanup');
      });

      await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      // Device B may publish a page that still references old-generation after
      // device A has read the index. Client cleanup would be a TOCTOU delete.
      expect(events).toEqual(['chunk', 'chunk', 'page']);
      expect(remote.deleteAttachmentChunk).not.toHaveBeenCalled();
    });

    it('does not delete a concurrently uploaded unpublished generation after a password rotation', async () => {
      const attachment = {
        ...makeAttachment('video', '/new/root'),
        content: {
          format: 'canto-chunked-v1' as const,
          byteLength: 512,
          chunkSize: 512,
          chunkCount: 1,
          generation: 'rotated-generation',
        },
      };
      const page = { ...makePage('p1', 2000), images: [attachment] };
      const localJournal = { ...makeJournal([page]), salt: 'new-salt' };
      const remotePage = { ...makePage('p1', 1000), images: [attachment] };
      const local = createMockLocalStore(localJournal);
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      local.forEachAttachmentChunk = jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'frame');
      });
      remote.uploadAttachmentChunk = jest.fn();
      remote.listRemoteJournals = jest
        .fn()
        .mockResolvedValue([
          { id: 'journal-1', title: 'Test Journal', lastModified: 0, salt: 'old-salt' },
        ]);
      const unpublishedGeneration = 'other-device-unpublished-generation';
      remote.deleteAttachmentGenerationsExcept = jest.fn();
      remote.deleteAttachmentChunk = jest.fn(async (_journal, _id, generation) => {
        // This models another device having written a new generation before it
        // can publish its page. Prefix cleanup would delete this payload.
        expect(generation).not.toBe(unpublishedGeneration);
      });

      await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY, undefined, 'old-salt');

      // Another device can have an unpublished generation under the same
      // attachment ID. Only a generation observed in the previous page may be
      // removed; broad prefix cleanup would destroy that concurrent upload.
      expect(remote.deleteAttachmentGenerationsExcept).not.toHaveBeenCalled();
      expect(remote.deleteAttachmentChunk).not.toHaveBeenCalled();
    });

    it('keeps a key rotation atomic when a web chunk budget is requested', async () => {
      const attachment = {
        ...makeAttachment('video', '/new/root'),
        content: {
          format: 'canto-chunked-v1' as const,
          byteLength: 1024,
          chunkSize: 512,
          chunkCount: 2,
          generation: 'rotated-generation',
        },
      };
      const localPage = { ...makePage('p1', 2000), images: [attachment] };
      const remotePage = { ...makePage('p1', 1000), images: [attachment] };
      const local = createMockLocalStore({ ...makeJournal([localPage]), salt: 'new-salt' });
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      local.forEachAttachmentChunk = jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'frame-0');
        await visitor(1, 'frame-1');
      });
      remote.uploadAttachmentChunk = jest.fn();
      remote.listRemoteJournals = jest
        .fn()
        .mockResolvedValue([
          { id: 'journal-1', title: 'Test Journal', lastModified: 0, salt: 'old-salt' },
        ]);

      const result = await new SyncEngine(local, remote).sync(
        'journal-1',
        SYNC_KEY,
        undefined,
        'old-salt',
        undefined,
        { newChunkUploadBudget: 1 },
      );

      expect(result.checkpointed).toBeUndefined();
      expect(remote.uploadAttachmentChunk).toHaveBeenCalledTimes(2);
      expect(remote.uploadPage).toHaveBeenCalledWith('journal-1', 'p1', expect.any(String));
      expect(remote.uploadJournalMeta).toHaveBeenCalledTimes(1);
      expect(remote.uploadSyncIndex).toHaveBeenCalledTimes(1);
    });

    it('aborts a password rotation before publication when a non-deleted remote page is absent locally', async () => {
      const localPage = makePage('p1', 2000);
      const remoteOnlyPage = makePage('p2', 1000);
      const local = createMockLocalStore({ ...makeJournal([localPage]), salt: 'new-salt' });
      const remote = createMockRemoteStore(makeJournal([localPage, remoteOnlyPage]));
      remote.listRemoteJournals = jest
        .fn()
        .mockResolvedValue([
          { id: 'journal-1', title: 'Test Journal', lastModified: 0, salt: 'old-salt' },
        ]);
      remote.downloadSyncIndex = jest
        .fn()
        .mockResolvedValue(buildSyncIndex([localPage, remoteOnlyPage]));

      await expect(
        new SyncEngine(local, remote).sync('journal-1', SYNC_KEY, undefined, 'old-salt'),
      ).rejects.toThrow('password rotation requires remote page p2 to be available locally');

      expect(remote.uploadPage).not.toHaveBeenCalled();
      expect(remote.uploadJournalMeta).not.toHaveBeenCalled();
      expect(remote.uploadSyncIndex).not.toHaveBeenCalled();
    });

    it('keeps the previous remote salt when password rotation has a deferred attachment', async () => {
      const attachment = {
        ...makeAttachment('video', '/local/video.mp4'),
        size: LEGACY_ATTACHMENT_SYNC_LIMIT_BYTES + 1,
      };
      const page = { ...makePage('p1', 2000), images: [attachment] };
      const local = createMockLocalStore({ ...makeJournal([page]), salt: 'new-salt' });
      const remote = createMockRemoteStore(makeJournal([makePage('p1', 1000)]));
      remote.listRemoteJournals = jest
        .fn()
        .mockResolvedValue([
          { id: 'journal-1', title: 'Test Journal', lastModified: 0, salt: 'old-salt' },
        ]);

      const result = await new SyncEngine(local, remote).sync(
        'journal-1',
        SYNC_KEY,
        undefined,
        'old-salt',
      );

      expect(result.warnings).toEqual([
        expect.objectContaining({
          pageId: 'p1',
          reason: 'legacy-attachment-too-large',
        }),
      ]);
      expect(remote.uploadPage).not.toHaveBeenCalled();
      expect(remote.uploadJournalMeta).not.toHaveBeenCalled();
      expect(remote.uploadSyncIndex).not.toHaveBeenCalled();
    });

    it('defers an oversized legacy attachment without publishing its page', async () => {
      const att = { ...makeAttachment('video', '/local/video.mp4'), size: 32 * 1024 * 1024 + 1 };
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));

      const result = await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      expect(local.getAttachment).not.toHaveBeenCalled();
      expect(remote.uploadAttachment).not.toHaveBeenCalled();
      expect(remote.uploadPage).not.toHaveBeenCalled();
      expect(result.uploaded).not.toContain('p1');
      expect(result.warnings).toEqual([
        expect.objectContaining({ pageId: 'p1', name: 'video.png', size: att.size }),
      ]);
    });

    it('defers an unknown-size legacy attachment before reading it', async () => {
      const att = makeAttachment('unknown', '/local/unknown.mp4');
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      local.getAttachmentStorageSize = jest.fn().mockResolvedValue({ status: 'unknown' });
      const remote = createMockRemoteStore(makeJournal([]));

      const result = await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      expect(local.getAttachmentStorageSize).toHaveBeenCalledWith(att.path);
      expect(local.getAttachment).not.toHaveBeenCalled();
      expect(remote.uploadPage).not.toHaveBeenCalled();
      expect(result.warnings).toEqual([
        expect.objectContaining({ pageId: 'p1', name: 'unknown.png', size: undefined }),
      ]);
    });

    it('keeps the missing-attachment warning path without deferring the page', async () => {
      const att = makeAttachment('missing', '/local/missing.mp4');
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      local.getAttachmentStorageSize = jest.fn().mockResolvedValue({ status: 'missing' });
      const remote = createMockRemoteStore(makeJournal([]));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await new SyncEngine(local, remote).sync('journal-1', SYNC_KEY);

      expect(local.getAttachment).not.toHaveBeenCalled();
      expect(remote.uploadAttachment).not.toHaveBeenCalled();
      expect(remote.uploadPage).toHaveBeenCalledWith('journal-1', 'p1', expect.any(String));
      expect(result.uploaded).toContain('p1');
      expect(result.warnings).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing local attachment'));
      consoleSpy.mockRestore();
    });

    it('reports the attachment path when an attachment read fails', async () => {
      const att = makeAttachment('img1', '/local/large-video.mp4');
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      (local.getAttachment as jest.Mock).mockRejectedValue(
        new Error('[IDB] Timeout reading /local/large-video.mp4'),
      );

      const engine = new SyncEngine(local, remote);
      await expect(engine.sync('journal-1', SYNC_KEY)).rejects.toThrow(
        'Failed to upload attachment /local/large-video.mp4',
      );

      expect(remote.uploadPage).not.toHaveBeenCalled();
    });
  });

  it('does not download remote-only deleted pages (L117)', async () => {
    const remotePage = makePage('p2', 2000, true); // deleted on remote
    const local = createMockLocalStore(makeJournal([]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1', SYNC_KEY);

    expect(result.downloaded).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
    expect(local.savePage).not.toHaveBeenCalled();
  });

  it('marks both-deleted pages as deleted (L128)', async () => {
    const localPage = makePage('p1', 1000, true);
    const remotePage = makePage('p1', 2000, true);
    const local = createMockLocalStore(makeJournal([localPage]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1', SYNC_KEY);

    expect(result.deleted).toContain('p1');
    // Should not call deletePage on either side (both already deleted)
    expect(remote.deletePage).not.toHaveBeenCalled();
    expect(local.deletePage).not.toHaveBeenCalled();
  });

  it('warns when remote attachment is missing during download (L61)', async () => {
    const att = {
      id: 'img1',
      path: '/remote/img1.png',
      name: 'img1.png',
      type: 'image' as const,
      encrypted: false,
      deleted: false,
      size: 1024,
    };
    const remotePage = { ...makePage('p1', 1000), images: [att] };
    const local = createMockLocalStore(makeJournal([]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));
    (remote.downloadAttachment as jest.Mock).mockResolvedValue(null);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1', SYNC_KEY);

    // Page download fails gracefully — attachment error caught by per-page try-catch
    expect(result.downloaded).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to download page p1'),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  describe('progress callback', () => {
    it('calls onProgress for each page', async () => {
      const pages = [makePage('p1', 1000), makePage('p2', 2000), makePage('p3', 3000)];
      const local = createMockLocalStore(makeJournal(pages));
      const remote = createMockRemoteStore(makeJournal([]));
      const onProgress = jest.fn();

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY, onProgress);

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenCalledWith(1, 3);
      expect(onProgress).toHaveBeenCalledWith(2, 3);
      expect(onProgress).toHaveBeenCalledWith(3, 3);
    });

    it('does not call onProgress when there are no pages', async () => {
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([]));
      const onProgress = jest.fn();

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY, onProgress);

      expect(onProgress).not.toHaveBeenCalled();
    });

    it('reports correct total when both local and remote pages exist', async () => {
      const localPage = makePage('p1', 1000);
      const remotePage = makePage('p2', 2000);
      const local = createMockLocalStore(makeJournal([localPage]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      const onProgress = jest.fn();

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY, onProgress);

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith(1, 2);
      expect(onProgress).toHaveBeenCalledWith(2, 2);
    });

    it('counts overlapping pages correctly (no duplicates in total)', async () => {
      const page = makePage('p1', 1000);
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([page]));
      const onProgress = jest.fn();

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY, onProgress);

      // Same page exists locally and remotely — should count as 1
      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(1, 1);
    });

    it('works without onProgress callback', async () => {
      const local = createMockLocalStore(makeJournal([makePage('p1', 1000)]));
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      // Should not throw when onProgress is undefined
      const result = await engine.sync('journal-1', SYNC_KEY);
      expect(result.uploaded).toContain('p1');
    });
  });
});
