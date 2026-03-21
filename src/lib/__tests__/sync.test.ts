import { SyncEngine } from '../sync/engine';
import type { LocalStore } from '../storage/types';
import type { RemoteStore } from '../sync/types';
import type { Page, JournalContent } from '@/data';

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
    deleteAttachment: jest.fn(),
    reencryptJournal: jest.fn(),
    reencryptAll: jest.fn(),
  };
}

function createMockRemoteStore(journal: JournalContent | null): RemoteStore {
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
    downloadJournalMeta: jest.fn().mockResolvedValue(journal ? { content: journal } : null),
    uploadPage: jest.fn(),
    downloadPage: jest.fn().mockImplementation((_jId: string, pId: string) => {
      const page = journal?.pages.find((p) => p.id === pId);
      return Promise.resolve(page ?? null);
    }),
    deletePage: jest.fn(),
    uploadAttachment: jest.fn(),
    downloadAttachment: jest.fn(),
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
    const result = await engine.sync('journal-1');

    expect(result.uploaded).toContain('p1');
    expect(remote.uploadPage).toHaveBeenCalledWith('journal-1', localPage);
  });

  it('downloads remote-only pages', async () => {
    const remotePage = makePage('p2', 2000);
    const local = createMockLocalStore(makeJournal([]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1');

    expect(result.downloaded).toContain('p2');
    expect(local.savePage).toHaveBeenCalledWith('journal-1', remotePage, undefined, true);
  });

  it('uploads locally newer pages', async () => {
    const localPage = makePage('p1', 3000);
    const remotePage = makePage('p1', 1000);
    const local = createMockLocalStore(makeJournal([localPage]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1');

    expect(result.uploaded).toContain('p1');
    expect(remote.uploadPage).toHaveBeenCalledWith('journal-1', localPage);
  });

  it('downloads remotely newer pages', async () => {
    const localPage = makePage('p1', 1000);
    const remotePage = makePage('p1', 3000);
    const local = createMockLocalStore(makeJournal([localPage]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1');

    expect(result.downloaded).toContain('p1');
  });

  it('skips pages with equal timestamps', async () => {
    const page = makePage('p1', 1000);
    const local = createMockLocalStore(makeJournal([page]));
    const remote = createMockRemoteStore(makeJournal([page]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1');

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
    const result = await engine.sync('journal-1');

    expect(result.deleted).toContain('p1');
    expect(remote.deletePage).toHaveBeenCalledWith('journal-1', 'p1');
  });

  it('propagates remote deletions to local', async () => {
    const localPage = makePage('p1', 1000, false);
    const remotePage = makePage('p1', 2000, true); // remotely deleted
    const local = createMockLocalStore(makeJournal([localPage]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1');

    expect(result.deleted).toContain('p1');
    expect(local.deletePage).toHaveBeenCalledWith('journal-1', 'p1', undefined);
  });

  it('does not upload deleted local-only pages', async () => {
    const localPage = makePage('p1', 1000, true);
    const local = createMockLocalStore(makeJournal([localPage]));
    const remote = createMockRemoteStore(makeJournal([]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1');

    expect(result.uploaded).toHaveLength(0);
    expect(remote.uploadPage).not.toHaveBeenCalled();
  });

  it('returns empty result for non-existent journal', async () => {
    const local = createMockLocalStore(null);
    const remote = createMockRemoteStore(null);

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('nonexistent');

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
    const results = await engine.syncAll();

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

    it('passes undefined when getKey returns undefined', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      await engine.syncAll(() => undefined);

      expect(local.getJournal).toHaveBeenCalledWith('journal-1', undefined);
    });

    it('passes undefined when getKey is omitted', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      await engine.syncAll();

      expect(local.getJournal).toHaveBeenCalledWith('journal-1', undefined);
    });
  });

  describe('error handling', () => {
    it('propagates remote upload errors', async () => {
      const page = makePage('p1', 1000);
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));
      (remote.uploadPage as jest.Mock).mockRejectedValueOnce(new Error('Upload failed'));

      const engine = new SyncEngine(local, remote);
      await expect(engine.sync('journal-1')).rejects.toThrow('Upload failed');
    });

    it('propagates remote download errors', async () => {
      const remotePage = makePage('p1', 1000);
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      (remote.downloadPage as jest.Mock).mockRejectedValueOnce(new Error('Download failed'));

      const engine = new SyncEngine(local, remote);
      await expect(engine.sync('journal-1')).rejects.toThrow('Download failed');
    });

    it('propagates local save errors', async () => {
      const remotePage = makePage('p1', 1000);
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      (local.savePage as jest.Mock).mockRejectedValueOnce(new Error('Disk full'));

      const engine = new SyncEngine(local, remote);
      await expect(engine.sync('journal-1')).rejects.toThrow('Disk full');
    });

    it('propagates getJournal errors', async () => {
      const local = createMockLocalStore(null);
      const remote = createMockRemoteStore(null);
      (local.getJournal as jest.Mock).mockRejectedValueOnce(new Error('Decrypt failed'));

      const engine = new SyncEngine(local, remote);
      await expect(engine.sync('journal-1')).rejects.toThrow('Decrypt failed');
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
      await engine.sync('journal-1');

      expect(local.getAttachment).toHaveBeenCalledWith('/local/img1.png');
      expect(remote.uploadAttachment).toHaveBeenCalledWith(
        'journal-1',
        '/local/img1.png',
        'base64data',
      );
    });

    it('skips already-remote attachments during upload', async () => {
      const att = makeAttachment('img1', 'gdrive://journal-1/attachments/img1.png');
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1');

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
      const result = await engine.sync('journal-1');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing local attachment'));
      expect(remote.uploadAttachment).not.toHaveBeenCalled();
      expect(result.uploaded).toContain('p1'); // page still uploaded
      consoleSpy.mockRestore();
    });

    it('downloads remote attachments and updates paths', async () => {
      const att = makeAttachment('img1', '/remote/img1.png');
      const remotePage = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      (remote.downloadAttachment as jest.Mock).mockResolvedValue('base64data');
      (local.saveAttachment as jest.Mock).mockResolvedValue('/local/saved/img1.png');

      const engine = new SyncEngine(local, remote);
      const result = await engine.sync('journal-1');

      expect(result.downloaded).toContain('p1');
      expect(remote.downloadAttachment).toHaveBeenCalled();
      expect(local.saveAttachment).toHaveBeenCalled();
    });

    it('skips deleted attachments', async () => {
      const att = { ...makeAttachment('img1', '/local/img1.png'), deleted: true };
      const page = { ...makePage('p1', 1000), images: [att] };
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1');

      expect(local.getAttachment).not.toHaveBeenCalled();
    });
  });

  it('does not download remote-only deleted pages (L117)', async () => {
    const remotePage = makePage('p2', 2000, true); // deleted on remote
    const local = createMockLocalStore(makeJournal([]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));

    const engine = new SyncEngine(local, remote);
    const result = await engine.sync('journal-1');

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
    const result = await engine.sync('journal-1');

    expect(result.deleted).toContain('p1');
    // Should not call deletePage on either side (both already deleted)
    expect(remote.deletePage).not.toHaveBeenCalled();
    expect(local.deletePage).not.toHaveBeenCalled();
  });

  it('throws when remote attachment is missing during download (L61)', async () => {
    const att = {
      id: 'img1',
      path: '/remote/img1.png',
      name: 'img1.png',
      type: 'image' as const,
      encrypted: false,
      deleted: false,
    };
    const remotePage = { ...makePage('p1', 1000), images: [att] };
    const local = createMockLocalStore(makeJournal([]));
    const remote = createMockRemoteStore(makeJournal([remotePage]));
    (remote.downloadAttachment as jest.Mock).mockResolvedValue(null);

    const engine = new SyncEngine(local, remote);
    await expect(engine.sync('journal-1')).rejects.toThrow('Attachment not found on remote');
  });

  describe('progress callback', () => {
    it('calls onProgress for each page', async () => {
      const pages = [makePage('p1', 1000), makePage('p2', 2000), makePage('p3', 3000)];
      const local = createMockLocalStore(makeJournal(pages));
      const remote = createMockRemoteStore(makeJournal([]));
      const onProgress = jest.fn();

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', undefined, onProgress);

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
      await engine.sync('journal-1', undefined, onProgress);

      expect(onProgress).not.toHaveBeenCalled();
    });

    it('reports correct total when both local and remote pages exist', async () => {
      const localPage = makePage('p1', 1000);
      const remotePage = makePage('p2', 2000);
      const local = createMockLocalStore(makeJournal([localPage]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));
      const onProgress = jest.fn();

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', undefined, onProgress);

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
      await engine.sync('journal-1', undefined, onProgress);

      // Same page exists locally and remotely — should count as 1
      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(1, 1);
    });

    it('works without onProgress callback', async () => {
      const local = createMockLocalStore(makeJournal([makePage('p1', 1000)]));
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      // Should not throw when onProgress is undefined
      const result = await engine.sync('journal-1');
      expect(result.uploaded).toContain('p1');
    });
  });
});
