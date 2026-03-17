import { GDriveRemoteStore } from '../sync/gdrive/store';
import * as api from '../sync/gdrive/api';
import type { JournalContent, Page } from '@/models';

jest.mock('../sync/gdrive/api');

const mockedApi = api as jest.Mocked<typeof api>;

const TOKEN = 'test-token';

const makePage = (id: string, modified: number): Page => ({
  id,
  text: `Page ${id}`,
  date: '2026-03-12T10:00:00Z',
  tags: [],
  files: [],
  images: [],
  comments: [],
  modified,
  deleted: false,
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
    autoSync: false,
  },
  version: 1,
});

describe('GDriveRemoteStore', () => {
  let store: GDriveRemoteStore;

  beforeEach(() => {
    store = new GDriveRemoteStore();
    jest.clearAllMocks();
  });

  describe('connect/disconnect', () => {
    it('connects with access token', async () => {
      await store.connect({ accessToken: TOKEN });
      expect(store.isConnected()).toBe(true);
    });

    it('disconnects', async () => {
      await store.connect({ accessToken: TOKEN });
      await store.disconnect();
      expect(store.isConnected()).toBe(false);
    });

    it('throws when not connected', async () => {
      await expect(store.listRemoteJournals()).rejects.toThrow('Not connected');
    });
  });

  describe('listRemoteJournals', () => {
    it('returns empty when no registry file exists', async () => {
      await store.connect({ accessToken: TOKEN });
      mockedApi.listFiles.mockResolvedValueOnce([]); // no registry file
      const result = await store.listRemoteJournals();
      expect(result).toEqual([]);
    });

    it('returns journals from registry', async () => {
      await store.connect({ accessToken: TOKEN });
      // Find registry file
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'reg-id',
          name: 'canto-journals.json',
          mimeType: 'application/json',
          modifiedTime: '',
        },
      ]);
      // Read registry content
      mockedApi.getFileContent.mockResolvedValueOnce(
        JSON.stringify([{ id: 'j1', title: 'Journal 1', encrypted: false }]),
      );

      const result = await store.listRemoteJournals();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('j1');
      expect(result[0].title).toBe('Journal 1');
    });
  });

  describe('uploadJournalMeta', () => {
    it('creates journal folder and meta file', async () => {
      await store.connect({ accessToken: TOKEN });
      const journal = makeJournal([]);

      // getOrCreateFolder for Canto root
      mockedApi.listFiles.mockResolvedValueOnce([]);
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'root-folder',
        name: 'Canto',
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      // getOrCreateFolder for journal
      mockedApi.listFiles.mockResolvedValueOnce([]);
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'journal-folder',
        name: 'journal-1',
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      // findFile for meta.json (not found)
      mockedApi.listFiles.mockResolvedValueOnce([]);
      // createFile for meta.json
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'meta-id',
        name: 'meta.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });
      // getRegistryFileId (registry not found)
      mockedApi.listFiles.mockResolvedValueOnce([]);
      // readRegistry returns empty (no file)
      // getRegistryFileId again for write (not found)
      mockedApi.listFiles.mockResolvedValueOnce([]);
      // createFile for registry
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'reg-id',
        name: 'canto-journals.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      await store.uploadJournalMeta(journal);

      // Verify meta.json was created
      expect(mockedApi.createFile).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ name: 'meta.json' }),
        expect.any(String),
      );
    });
  });

  describe('uploadPage / downloadPage', () => {
    it('uploads a page', async () => {
      await store.connect({ accessToken: TOKEN });
      const page = makePage('p1', 1000);

      // Resolve folders
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'root-id',
          name: 'Canto',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'j-id',
          name: 'journal-1',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'pages-id',
          name: 'pages',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      // findFile for p1.json (not found)
      mockedApi.listFiles.mockResolvedValueOnce([]);
      // createFile
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'page-file-id',
        name: 'p1.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      await store.uploadPage('journal-1', page);

      expect(mockedApi.createFile).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ name: 'p1.json' }),
        JSON.stringify(page),
      );
    });

    it('downloads a page', async () => {
      await store.connect({ accessToken: TOKEN });
      const page = makePage('p1', 1000);

      // Resolve folders
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'root-id',
          name: 'Canto',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'j-id',
          name: 'journal-1',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'pages-id',
          name: 'pages',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      // findFile for p1.json
      mockedApi.listFiles.mockResolvedValueOnce([
        { id: 'page-id', name: 'p1.json', mimeType: 'application/json', modifiedTime: '' },
      ]);
      // getFileContent
      mockedApi.getFileContent.mockResolvedValueOnce(JSON.stringify(page));

      const result = await store.downloadPage('journal-1', 'p1');
      expect(result).toEqual(page);
    });

    it('returns null for missing page', async () => {
      await store.connect({ accessToken: TOKEN });

      // Resolve folders
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'root-id',
          name: 'Canto',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'j-id',
          name: 'journal-1',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'pages-id',
          name: 'pages',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      // findFile returns nothing
      mockedApi.listFiles.mockResolvedValueOnce([]);

      const result = await store.downloadPage('journal-1', 'missing');
      expect(result).toBeNull();
    });
  });

  describe('deletePage', () => {
    it('deletes a page file', async () => {
      await store.connect({ accessToken: TOKEN });

      // Resolve folders
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'root-id',
          name: 'Canto',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'j-id',
          name: 'journal-1',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'pages-id',
          name: 'pages',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      // findFile
      mockedApi.listFiles.mockResolvedValueOnce([
        { id: 'page-id', name: 'p1.json', mimeType: 'application/json', modifiedTime: '' },
      ]);
      // deleteFile
      mockedApi.deleteFile.mockResolvedValueOnce(undefined);

      await store.deletePage('journal-1', 'p1');
      expect(mockedApi.deleteFile).toHaveBeenCalledWith(TOKEN, 'page-id');
    });
  });

  describe('file ID caching', () => {
    it('caches folder IDs to avoid redundant lookups', async () => {
      await store.connect({ accessToken: TOKEN });

      // First call: resolve Canto folder
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'root-id',
          name: 'Canto',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'j-id',
          name: 'journal-1',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'pages-id',
          name: 'pages',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: '',
        },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([]); // findFile
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'pf1',
        name: 'p1.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      await store.uploadPage('journal-1', makePage('p1', 1000));

      // Second call: folders should be cached, only findFile + create
      mockedApi.listFiles.mockResolvedValueOnce([]); // findFile
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'pf2',
        name: 'p2.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      await store.uploadPage('journal-1', makePage('p2', 2000));

      // 3 folder lookups for first call + 1 findFile, then just 1 findFile for second call = 5 total listFiles calls
      expect(mockedApi.listFiles).toHaveBeenCalledTimes(5);
    });
  });
});
