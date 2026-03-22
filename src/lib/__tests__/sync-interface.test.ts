import { SyncEngine } from '../sync/engine';
import type { LocalStore } from '../storage/types';
import type { RemoteStore, SyncIndex } from '../sync/types';
import type { Page, JournalContent, Attachment } from 'canto-data';

// Mock encryption to be passthrough so mock stores work with plain strings
jest.mock('../encryption/utils', () => ({
  aesGcmEncrypt: jest.fn((plaintext: string) => Promise.resolve(plaintext)),
  aesGcmDecrypt: jest.fn((ciphertext: string) => Promise.resolve(ciphertext)),
}));

const SYNC_KEY = new Uint8Array(32).fill(1);

const makePage = (
  id: string,
  modified: number,
  deleted = false,
  images: Attachment[] = [],
): Page => ({
  id,
  text: `Page ${id}`,
  date: '2026-03-12T10:00:00Z',
  tags: [],
  files: [],
  images,
  comments: [],
  modified,
  deleted,
});

const makeAttachment = (id: string, path: string, deleted = false): Attachment => ({
  id,
  path,
  name: `${id}.png`,
  type: 'image',
  encrypted: false,
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
    saveAttachment: jest
      .fn()
      .mockImplementation((_jId: string, _pId: string, att: Attachment) =>
        Promise.resolve(`/local/${att.name}`),
      ),
    getAttachment: jest.fn().mockResolvedValue('base64data'),
    deleteAttachment: jest.fn(),
    reencryptJournal: jest.fn(),
    reencryptAll: jest.fn(),
  };
}

/** Build a SyncIndex from pages. */
function buildSyncIndex(pages: Page[]): SyncIndex {
  const index: SyncIndex = {};
  for (const p of pages) {
    index[p.id] = { modified: p.modified, ...(p.deleted ? { deleted: true } : {}) };
  }
  return index;
}

/**
 * Creates a mock RemoteStore with a custom provider prefix.
 * This proves SyncEngine is provider-agnostic — it uses isRemotePath/buildRemotePath
 * rather than hardcoding any provider scheme.
 */
function createMockRemoteStore(
  journal: JournalContent | null,
  providerPrefix = 'mockprovider',
): RemoteStore {
  const remotePages = journal?.pages ?? [];

  return {
    provider: 'gdrive', // type-level constraint, but behavior uses custom prefix
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    isRemotePath: jest.fn((path: string) => path.startsWith(`${providerPrefix}://`)),
    buildRemotePath: jest.fn(
      (journalId: string, filename: string) =>
        `${providerPrefix}://${journalId}/attachments/${filename}`,
    ),
    listRemoteJournals: jest
      .fn()
      .mockResolvedValue(
        journal ? [{ id: journal.id, title: journal.title, lastModified: 0 }] : [],
      ),
    uploadJournalMeta: jest.fn(),
    downloadJournalMeta: jest.fn().mockResolvedValue(journal ? JSON.stringify(journal) : null),
    uploadPage: jest.fn(),
    downloadPage: jest.fn().mockImplementation((_jId: string, pId: string) => {
      const page = remotePages.find((p) => p.id === pId);
      return Promise.resolve(page ? JSON.stringify(page) : null);
    }),
    deletePage: jest.fn(),
    uploadSyncIndex: jest.fn(),
    downloadSyncIndex: jest
      .fn()
      .mockResolvedValue(remotePages.length > 0 ? buildSyncIndex(remotePages) : null),
    uploadAttachment: jest
      .fn()
      .mockImplementation((_jId: string, localPath: string) =>
        Promise.resolve(`${providerPrefix}://journal-1/attachments/${localPath.split('/').pop()}`),
      ),
    downloadAttachment: jest.fn().mockResolvedValue('base64data'),
    deleteAttachment: jest.fn(),
    deleteJournal: jest.fn(),
  };
}

describe('SyncEngine — provider-agnostic interface', () => {
  describe('RemoteStore contract', () => {
    it('calls uploadJournalMeta with encrypted meta and registry', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY);

      expect(remote.uploadJournalMeta).toHaveBeenCalledWith(
        'journal-1',
        expect.any(String),
        expect.objectContaining({ title: 'Test Journal', encrypted: false }),
      );
    });

    it('calls downloadSyncIndex to get remote page timestamps', async () => {
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY);

      expect(remote.downloadSyncIndex).toHaveBeenCalledWith('journal-1');
    });

    it('calls connect/disconnect are not called by SyncEngine directly', async () => {
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY);

      // SyncEngine should not manage connection — that is SyncManager's job
      expect(remote.connect).not.toHaveBeenCalled();
      expect(remote.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('isRemotePath usage', () => {
    it('skips uploading attachments that are already remote', async () => {
      const att = makeAttachment('img1', 'mockprovider://journal-1/attachments/img1.png');
      const page = makePage('p1', 1000, false, [att]);
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY);

      // isRemotePath should have been called to check the attachment path
      expect(remote.isRemotePath).toHaveBeenCalledWith(
        'mockprovider://journal-1/attachments/img1.png',
      );
      // Should not try to upload since path is already remote
      expect(remote.uploadAttachment).not.toHaveBeenCalled();
    });

    it('uploads attachments with local paths', async () => {
      const att = makeAttachment('img1', '/local/path/img1.png');
      const page = makePage('p1', 1000, false, [att]);
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY);

      expect(remote.isRemotePath).toHaveBeenCalledWith('/local/path/img1.png');
      expect(remote.uploadAttachment).toHaveBeenCalledWith(
        'journal-1',
        '/local/path/img1.png',
        expect.any(String), // encrypted data (passthrough in mock)
      );
    });
  });

  describe('buildRemotePath usage', () => {
    it('uses buildRemotePath to construct download path for attachments', async () => {
      const att = makeAttachment('img1', '/remote/img1.png');
      const remotePage = makePage('p1', 1000, false, [att]);
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));

      const engine = new SyncEngine(local, remote);
      await engine.sync('journal-1', SYNC_KEY);

      expect(remote.buildRemotePath).toHaveBeenCalledWith('journal-1', 'img1.png');
      expect(remote.downloadAttachment).toHaveBeenCalledWith(
        'mockprovider://journal-1/attachments/img1.png',
      );
    });
  });

  describe('page sync with generic RemoteStore', () => {
    it('uploads local-only pages', async () => {
      const page = makePage('p1', 1000);
      const local = createMockLocalStore(makeJournal([page]));
      const remote = createMockRemoteStore(makeJournal([]));

      const engine = new SyncEngine(local, remote);
      const result = await engine.sync('journal-1', SYNC_KEY);

      expect(result.uploaded).toContain('p1');
      expect(remote.uploadPage).toHaveBeenCalledWith('journal-1', 'p1', expect.any(String));
    });

    it('downloads remote-only pages', async () => {
      const page = makePage('p2', 2000);
      const local = createMockLocalStore(makeJournal([]));
      const remote = createMockRemoteStore(makeJournal([page]));

      const engine = new SyncEngine(local, remote);
      const result = await engine.sync('journal-1', SYNC_KEY);

      expect(result.downloaded).toContain('p2');
      expect(local.savePage).toHaveBeenCalledWith('journal-1', page, SYNC_KEY, true);
    });

    it('resolves conflicts with last-write-wins', async () => {
      const localPage = makePage('p1', 3000);
      const remotePage = makePage('p1', 1000);
      const local = createMockLocalStore(makeJournal([localPage]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));

      const engine = new SyncEngine(local, remote);
      const result = await engine.sync('journal-1', SYNC_KEY);

      expect(result.uploaded).toContain('p1');
      expect(remote.uploadPage).toHaveBeenCalledWith('journal-1', 'p1', expect.any(String));
    });

    it('propagates local deletion to remote', async () => {
      const localPage = makePage('p1', 2000, true);
      const remotePage = makePage('p1', 1000);
      const local = createMockLocalStore(makeJournal([localPage]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));

      const engine = new SyncEngine(local, remote);
      const result = await engine.sync('journal-1', SYNC_KEY);

      expect(result.deleted).toContain('p1');
      expect(remote.deletePage).toHaveBeenCalledWith('journal-1', 'p1');
    });

    it('propagates remote deletion to local', async () => {
      const localPage = makePage('p1', 1000);
      const remotePage = makePage('p1', 2000, true);
      const local = createMockLocalStore(makeJournal([localPage]));
      const remote = createMockRemoteStore(makeJournal([remotePage]));

      const engine = new SyncEngine(local, remote);
      const result = await engine.sync('journal-1', SYNC_KEY);

      expect(result.deleted).toContain('p1');
      expect(local.deletePage).toHaveBeenCalledWith('journal-1', 'p1', SYNC_KEY);
    });
  });
});
