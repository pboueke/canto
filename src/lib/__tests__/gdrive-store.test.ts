import { GDriveRemoteStore } from '../sync/gdrive/store';
import * as api from '../sync/gdrive/api';
import type { JournalContent, Page } from '@/data';

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

  describe('provider identity', () => {
    it('has provider set to gdrive', () => {
      expect(store.provider).toBe('gdrive');
    });

    it('isRemotePath returns true for gdrive:// paths', () => {
      expect(store.isRemotePath('gdrive://j1/attachments/img.png')).toBe(true);
    });

    it('isRemotePath returns false for local paths', () => {
      expect(store.isRemotePath('/data/user/0/com.canto/files/img.png')).toBe(false);
    });

    it('buildRemotePath constructs gdrive:// path', () => {
      expect(store.buildRemotePath('j1', 'photo.jpg')).toBe('gdrive://j1/attachments/photo.jpg');
    });
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

  describe('safeJsonParse error diagnostics', () => {
    beforeEach(async () => {
      await store.connect({ accessToken: TOKEN });
    });

    it('throws descriptive error when registry contains invalid JSON', async () => {
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'reg-id',
          name: 'canto-journals.json',
          mimeType: 'application/json',
          modifiedTime: '',
        },
      ]);
      mockedApi.getFileContent.mockResolvedValueOnce('login required');

      await expect(store.listRemoteJournals()).rejects.toThrow('[GDrive] Invalid JSON in registry');
    });

    it('does not leak file content in error messages', async () => {
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'reg-id',
          name: 'canto-journals.json',
          mimeType: 'application/json',
          modifiedTime: '',
        },
      ]);
      mockedApi.getFileContent.mockResolvedValueOnce('not json at all');

      await expect(store.listRemoteJournals()).rejects.toThrow('[GDrive] Invalid JSON in registry');
      // Verify the raw content is NOT in the error
    });

    it('throws descriptive error when page content is invalid JSON', async () => {
      const rootFolder = {
        id: 'root-id',
        name: 'Canto',
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      };
      const journalFolder = {
        id: 'j-id',
        name: 'journal-1',
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      };
      const pagesFolder = {
        id: 'p-id',
        name: 'pages',
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      };
      const pageFile = {
        id: 'pf-id',
        name: 'p1.json',
        mimeType: 'application/json',
        modifiedTime: '',
      };

      mockedApi.listFiles
        .mockResolvedValueOnce([rootFolder])
        .mockResolvedValueOnce([journalFolder])
        .mockResolvedValueOnce([pagesFolder])
        .mockResolvedValueOnce([pageFile]);

      mockedApi.getFileContent.mockResolvedValueOnce('corrupted data');

      await expect(store.downloadPage('journal-1', 'p1')).rejects.toThrow(
        '[GDrive] Invalid JSON in page:p1',
      );
    });
  });

  describe('token update without cache clear', () => {
    it('preserves file ID cache when token is refreshed', async () => {
      await store.connect({ accessToken: 'token-1' });

      // First listRemoteJournals — populates cache with registry file lookup
      mockedApi.listFiles.mockResolvedValueOnce([]); // registry lookup — no file
      await store.listRemoteJournals();
      const callCountAfterFirst = mockedApi.listFiles.mock.calls.length;

      // Reconnect with new token
      await store.connect({ accessToken: 'token-2' });

      // Second listRemoteJournals — registry file ID was null (not cached), so looks up again
      mockedApi.listFiles.mockResolvedValueOnce([]); // registry lookup again
      await store.listRemoteJournals();

      const callsAfterSecond = mockedApi.listFiles.mock.calls.length - callCountAfterFirst;
      expect(callsAfterSecond).toBe(1); // Only registry lookup
    });
  });
});
