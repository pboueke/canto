import { SyncEngine } from '../sync/engine';
import type { LocalStore } from '../storage/types';
import type { RemoteStore } from '../sync/types';
import type { Page, JournalContent } from '@/models';

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
    showMarkdownPlaceholder: true,
    autoLocation: false,
    remoteSync: true,
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
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    listRemoteJournals: jest
      .fn()
      .mockResolvedValue(
        journal ? [{ id: journal.id, title: journal.title, lastModified: 0 }] : [],
      ),
    uploadJournalMeta: jest.fn(),
    downloadJournalMeta: jest.fn().mockResolvedValue(journal),
    uploadPage: jest.fn(),
    downloadPage: jest.fn().mockImplementation((_jId: string, pId: string) => {
      const page = journal?.pages.find((p) => p.id === pId);
      return Promise.resolve(page ?? null);
    }),
    deletePage: jest.fn(),
    uploadAttachment: jest.fn(),
    downloadAttachment: jest.fn(),
    deleteAttachment: jest.fn(),
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
    expect(local.savePage).toHaveBeenCalledWith('journal-1', remotePage);
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
    expect(local.deletePage).toHaveBeenCalledWith('journal-1', 'p1');
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
});
