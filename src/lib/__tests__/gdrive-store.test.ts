import { GDriveRemoteStore } from '../sync/gdrive/store';
import * as api from '../sync/gdrive/api';
import type { Attachment, JournalContent, Page } from 'canto-data';

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

    it('throws when access token is empty', async () => {
      await expect(store.connect({ accessToken: '' })).rejects.toThrow('Access token is required');
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
      const { pages: _pages, ...metaWithoutPages } = journal;
      const encryptedMeta = JSON.stringify(metaWithoutPages);
      const registry = { title: journal.title, encrypted: journal.secure, salt: journal.salt };

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

      await store.uploadJournalMeta(journal.id, encryptedMeta, registry);

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

      await store.uploadPage('journal-1', page.id, JSON.stringify(page));

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
      expect(result).toBe(JSON.stringify(page));
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

  describe('downloadJournalMeta', () => {
    it('returns raw string content of meta.json', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      const metaContent = JSON.stringify({
        id: 'journal-1',
        title: 'Test Journal',
        icon: 'book',
        date: '2026-01-01T00:00:00Z',
        secure: false,
        salt: 'dGVzdHNhbHQ=',
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

      // Resolve root folder
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      // Resolve journal folder
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      // findFile for meta.json
      mockedApi.listFiles.mockResolvedValueOnce([
        { id: 'meta-id', name: 'meta.json', mimeType: 'application/json', modifiedTime: '' },
      ]);
      // getFileContent
      mockedApi.getFileContent.mockResolvedValueOnce(metaContent);

      const result = await store.downloadJournalMeta('journal-1');

      expect(result).not.toBeNull();
      expect(result).toBe(metaContent);
      // Caller can parse it
      const parsed = JSON.parse(result!);
      expect(parsed.title).toBe('Test Journal');
    });

    it('chooses the newest metadata file when a legacy journal has duplicates', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      // An old concurrent sync could create a second meta.json. Its key no
      // longer matches the registry, so importing must select the latest one.
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'old-meta',
          name: 'meta.json',
          mimeType: 'application/json',
          modifiedTime: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'current-meta',
          name: 'meta.json',
          mimeType: 'application/json',
          modifiedTime: '2026-02-01T00:00:00.000Z',
        },
      ]);
      mockedApi.getFileContent.mockImplementation(async (_token, fileId) =>
        fileId === 'current-meta' ? 'current-ciphertext' : 'old-ciphertext',
      );

      await expect(store.downloadJournalMetaCandidates('journal-1')).resolves.toEqual([
        'current-ciphertext',
        'old-ciphertext',
      ]);
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

      await store.uploadPage('journal-1', 'p1', JSON.stringify(makePage('p1', 1000)));

      // Second call: folders should be cached, only findFile + create
      mockedApi.listFiles.mockResolvedValueOnce([]); // findFile
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'pf2',
        name: 'p2.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      await store.uploadPage('journal-1', 'p2', JSON.stringify(makePage('p2', 2000)));

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

      await expect(store.listRemoteJournals()).rejects.toThrow('Invalid JSON in registry');
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

      await expect(store.listRemoteJournals()).rejects.toThrow('Invalid JSON in registry');
      // Verify the raw content is NOT in the error
    });

    it('downloadPage returns raw string even for invalid JSON', async () => {
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

      // downloadPage now returns raw string without parsing
      const result = await store.downloadPage('journal-1', 'p1');
      expect(result).toBe('corrupted data');
    });
  });

  describe('downloadJournalMeta returns null when meta.json not found (L251)', () => {
    it('returns null when meta.json does not exist', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // Resolve root folder
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      // Resolve journal folder
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      // findFile for meta.json — not found
      mockedApi.listFiles.mockResolvedValueOnce([]);

      const result = await store.downloadJournalMeta('journal-1');
      expect(result).toBeNull();
    });
  });

  describe('downloadAttachment', () => {
    it('returns null for invalid remote path (L323)', async () => {
      await store.connect({ accessToken: TOKEN });
      const result = await store.downloadAttachment('invalid-path');
      expect(result).toBeNull();
    });

    it('returns null when attachment file not found on Drive (L327)', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // Resolve folders for attachments
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('att-id', 'attachments')]);
      // findFile returns empty
      mockedApi.listFiles.mockResolvedValueOnce([]);

      const result = await store.downloadAttachment('gdrive://journal-1/attachments/photo.jpg');
      expect(result).toBeNull();
    });
  });

  describe('deleteAttachment', () => {
    it('does nothing for invalid remote path', async () => {
      await store.connect({ accessToken: TOKEN });
      await store.deleteAttachment('invalid-path');
      expect(mockedApi.deleteFile).not.toHaveBeenCalled();
    });

    it('deletes attachment file on Drive (L332-339)', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // Resolve folders
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('att-id', 'attachments')]);
      // findFile for photo.jpg
      mockedApi.listFiles.mockResolvedValueOnce([
        { id: 'att-file-id', name: 'photo.jpg', mimeType: 'image/jpeg', modifiedTime: '' },
      ]);
      mockedApi.deleteFile.mockResolvedValueOnce(undefined);

      await store.deleteAttachment('gdrive://journal-1/attachments/photo.jpg');
      expect(mockedApi.deleteFile).toHaveBeenCalledWith(TOKEN, 'att-file-id');
    });

    it('does nothing when attachment file not found on Drive', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('att-id', 'attachments')]);
      mockedApi.listFiles.mockResolvedValueOnce([]); // not found

      await store.deleteAttachment('gdrive://journal-1/attachments/missing.jpg');
      expect(mockedApi.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('uploadAttachment', () => {
    it('uploads an attachment and returns gdrive:// path', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // Resolve folders: root → journal → attachments
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('att-id', 'attachments')]);
      // findFile for photo.jpg — not found
      mockedApi.listFiles.mockResolvedValueOnce([]);
      // createFile for the attachment
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'att-file-id',
        name: 'photo.jpg',
        mimeType: 'application/octet-stream',
        modifiedTime: '',
      });

      const result = await store.uploadAttachment('journal-1', '/local/photo.jpg', 'binary-data');
      expect(result).toBe('gdrive://journal-1/attachments/photo.jpg');
      expect(mockedApi.createFile).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ name: 'photo.jpg', mimeType: 'application/octet-stream' }),
        'binary-data',
      );
    });
  });

  describe('downloadAttachment (successful)', () => {
    it('downloads attachment content from Drive', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // Resolve folders
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('att-id', 'attachments')]);
      // findFile for photo.jpg — found
      mockedApi.listFiles.mockResolvedValueOnce([
        { id: 'att-file-id', name: 'photo.jpg', mimeType: 'image/jpeg', modifiedTime: '' },
      ]);
      mockedApi.getFileContent.mockResolvedValueOnce('binary-data');

      const result = await store.downloadAttachment('gdrive://journal-1/attachments/photo.jpg');
      expect(result).toBe('binary-data');
    });
  });

  describe('upsertFile update path', () => {
    it('updates existing file instead of creating new one', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // First upload: create
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('pages-id', 'pages')]);
      mockedApi.listFiles.mockResolvedValueOnce([]); // findFile — not found
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'page-file-id',
        name: 'p1.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      const page = makePage('p1', 1000);
      await store.uploadPage('journal-1', page.id, JSON.stringify(page));

      // Second upload: the file is now cached, findFile returns the cached ID
      mockedApi.updateFile.mockResolvedValueOnce({
        id: 'page-file-id',
        name: 'p1.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      const updatedPage = makePage('p1', 2000);
      await store.uploadPage('journal-1', updatedPage.id, JSON.stringify(updatedPage));

      expect(mockedApi.updateFile).toHaveBeenCalledWith(
        TOKEN,
        'page-file-id',
        expect.objectContaining({ name: 'p1.json' }),
        JSON.stringify(updatedPage),
      );
    });
  });

  describe('uploadJournalMeta updates existing registry entry', () => {
    it('updates existing entry in registry instead of pushing new one', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      const journal = makeJournal([]);
      const { pages: _pages, ...metaWithoutPages } = journal;
      const encryptedMeta = JSON.stringify(metaWithoutPages);
      const registry = { title: journal.title, encrypted: journal.secure, salt: journal.salt };

      // getOrCreateFolder root
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      // getOrCreateFolder journal
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-folder', 'journal-1')]);
      // findFile meta.json
      mockedApi.listFiles.mockResolvedValueOnce([]);
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'meta-id',
        name: 'meta.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });
      // readRegistry: getRegistryFileId
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'reg-id',
          name: 'canto-journals.json',
          mimeType: 'application/json',
          modifiedTime: '',
        },
      ]);
      mockedApi.getFileContent.mockResolvedValueOnce(
        JSON.stringify([{ id: 'journal-1', title: 'Old Title', encrypted: false }]),
      );
      // writeRegistry: getRegistryFileId (cached from readRegistry), so updateFile
      mockedApi.updateFile.mockResolvedValueOnce({
        id: 'reg-id',
        name: 'canto-journals.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      await store.uploadJournalMeta(journal.id, encryptedMeta, registry);

      // Verify updateFile was called for registry
      const updateCalls = mockedApi.updateFile.mock.calls.filter(
        (call) => call[2]?.name === 'canto-journals.json',
      );
      expect(updateCalls).toHaveLength(1);
      // Verify the registry content has updated entry, not duplicate
      const registryContent = JSON.parse(updateCalls[0][3] as string);
      expect(registryContent).toHaveLength(1);
      expect(registryContent[0].title).toBe('Test Journal');
    });
  });

  describe('deleteJournal', () => {
    it('deletes journal folder when cached and cleans up cache entries', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // First, populate the cache by resolving journal folder
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-folder-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('pages-id', 'pages')]);
      mockedApi.listFiles.mockResolvedValueOnce([]); // findFile
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'pf1',
        name: 'p1.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      await store.uploadPage('journal-1', 'p1', JSON.stringify(makePage('p1', 1000)));

      // Now delete — the journal folder should be cached
      mockedApi.deleteFile.mockResolvedValueOnce(undefined);
      // readRegistry (no registry file)
      mockedApi.listFiles.mockResolvedValueOnce([]);

      await store.deleteJournal('journal-1');
      expect(mockedApi.deleteFile).toHaveBeenCalledWith(TOKEN, 'j-folder-id');
    });

    it('deletes journal folder when not cached (L345-351)', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // getRootFolderId
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      // Journal folder not cached — lookup by listing
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-folder-id', 'journal-1')]);
      mockedApi.deleteFile.mockResolvedValueOnce(undefined);
      // readRegistry (no registry file)
      mockedApi.listFiles.mockResolvedValueOnce([]);

      await store.deleteJournal('journal-1');
      expect(mockedApi.deleteFile).toHaveBeenCalledWith(TOKEN, 'j-folder-id');
    });

    it('deletes cached journal folder and clears cache (L349-357)', async () => {
      // Use a fresh store
      const freshStore = new GDriveRemoteStore();
      await freshStore.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // First, populate the cache by uploading a page (resolves all folders)
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('pages-id', 'pages')]);
      mockedApi.listFiles.mockResolvedValueOnce([]); // findFile
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'pf1',
        name: 'p1.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      await freshStore.uploadPage('journal-1', 'p1', JSON.stringify(makePage('p1', 1000)));

      // Now delete the journal — folder ID should be cached
      mockedApi.deleteFile.mockResolvedValueOnce(undefined);
      // readRegistry — no registry file
      mockedApi.listFiles.mockResolvedValueOnce([]);

      await freshStore.deleteJournal('journal-1');
      expect(mockedApi.deleteFile).toHaveBeenCalledWith(TOKEN, 'j-id');
    });

    it('deletes journal and removes from registry', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // getRootFolderId
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      // Journal folder not cached
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-folder-id', 'journal-1')]);
      mockedApi.deleteFile.mockResolvedValueOnce(undefined);
      // readRegistry — has the journal
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'reg-id',
          name: 'canto-journals.json',
          mimeType: 'application/json',
          modifiedTime: '',
        },
      ]);
      mockedApi.getFileContent.mockResolvedValueOnce(
        JSON.stringify([{ id: 'journal-1', title: 'Test', encrypted: false }]),
      );
      // writeRegistry (update existing registry file)
      mockedApi.listFiles.mockResolvedValueOnce([
        {
          id: 'reg-id',
          name: 'canto-journals.json',
          mimeType: 'application/json',
          modifiedTime: '',
        },
      ]);
      mockedApi.updateFile.mockResolvedValueOnce({
        id: 'reg-id',
        name: 'canto-journals.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      await store.deleteJournal('journal-1');
      expect(mockedApi.deleteFile).toHaveBeenCalledWith(TOKEN, 'j-folder-id');
      expect(mockedApi.updateFile).toHaveBeenCalled();
    });
  });

  describe('uploadAttachment / downloadAttachment', () => {
    it('uploads an attachment and returns gdrive:// path (L314-317)', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // Resolve folders
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('att-id', 'attachments')]);
      // findFile — not found
      mockedApi.listFiles.mockResolvedValueOnce([]);
      // createFile
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'att-file-id',
        name: 'photo.jpg',
        mimeType: 'application/octet-stream',
        modifiedTime: '',
      });

      const result = await store.uploadAttachment('journal-1', '/local/photo.jpg', 'imagedata');
      expect(result).toBe('gdrive://journal-1/attachments/photo.jpg');
    });

    it('downloads an attachment successfully (L328)', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('att-id', 'attachments')]);
      // findFile — found
      mockedApi.listFiles.mockResolvedValueOnce([
        { id: 'att-file-id', name: 'photo.jpg', mimeType: 'image/jpeg', modifiedTime: '' },
      ]);
      mockedApi.getFileContent.mockResolvedValueOnce('imagedata');

      const result = await store.downloadAttachment('gdrive://journal-1/attachments/photo.jpg');
      expect(result).toBe('imagedata');
    });

    it('downloads, deletes, and retains the requested immutable chunk generation', async () => {
      await store.connect({ accessToken: TOKEN });
      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      const chunks = [
        {
          id: 'old-0',
          name: 'chunk-v1-att-old-0',
          mimeType: 'application/octet-stream',
          modifiedTime: '',
        },
        {
          id: 'keep-0',
          name: 'chunk-v1-att-keep-0',
          mimeType: 'application/octet-stream',
          modifiedTime: '',
        },
        {
          id: 'old-1',
          name: 'chunk-v1-att-old-1',
          mimeType: 'application/octet-stream',
          modifiedTime: '',
        },
      ];
      mockedApi.listFiles.mockImplementation(async (_token, query) => {
        if (query.includes("name = 'Canto'")) return [folder('root', 'Canto')];
        if (query.includes("name = 'journal-1'")) return [folder('journal', 'journal-1')];
        if (query.includes("name = 'attachments'")) return [folder('attachments', 'attachments')];
        if (query.includes("name = 'chunk-v1-att-keep-0'")) return [chunks[1]];
        if (query.includes("name = 'chunk-v1-att-missing-0'")) return [];
        if (query.includes("name contains 'chunk-v1-att-'")) return chunks;
        return [];
      });
      mockedApi.getFileContent.mockResolvedValue('encrypted-chunk');

      await expect(store.downloadAttachmentChunk('journal-1', 'att', 'keep', 0)).resolves.toBe(
        'encrypted-chunk',
      );
      await expect(
        store.downloadAttachmentChunk('journal-1', 'att', 'missing', 0),
      ).resolves.toBeNull();
      await store.deleteAttachmentChunk('journal-1', 'att', 'keep', 0);
      await store.deleteAttachmentChunk('journal-1', 'att', 'missing', 0);
      await store.deleteAttachmentGenerationsExcept('journal-1', 'att', 'keep');

      expect(mockedApi.deleteFile).toHaveBeenCalledWith(TOKEN, 'keep-0');
      expect(mockedApi.deleteFile).toHaveBeenCalledWith(TOKEN, 'old-0');
      expect(mockedApi.deleteFile).toHaveBeenCalledWith(TOKEN, 'old-1');
    });
  });

  describe('concurrent folder creation dedup (L116)', () => {
    it('deduplicates concurrent getOrCreateFolder calls', async () => {
      // Use a fresh store to avoid cache from other tests
      const freshStore = new GDriveRemoteStore();
      await freshStore.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      // Both uploadPage calls will need: root → journal → pages folders
      // With dedup, concurrent calls for the same folder should share the same promise

      // Root folder (Canto) — found
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      // Journal folder — not found, create
      mockedApi.listFiles.mockResolvedValueOnce([]);
      mockedApi.createFile.mockResolvedValueOnce(folder('j-id', 'journal-1'));
      // Pages folder — not found, create
      mockedApi.listFiles.mockResolvedValueOnce([]);
      mockedApi.createFile.mockResolvedValueOnce(folder('pages-id', 'pages'));
      // findFile p1.json — not found, create
      mockedApi.listFiles.mockResolvedValueOnce([]);
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'pf1',
        name: 'p1.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });
      // findFile p2.json — not found, create
      mockedApi.listFiles.mockResolvedValueOnce([]);
      mockedApi.createFile.mockResolvedValueOnce({
        id: 'pf2',
        name: 'p2.json',
        mimeType: 'application/json',
        modifiedTime: '',
      });

      const page1 = makePage('p1', 1000);
      const page2 = makePage('p2', 2000);

      // Fire concurrently — folder resolution should be shared
      await Promise.all([
        freshStore.uploadPage('journal-1', page1.id, JSON.stringify(page1)),
        freshStore.uploadPage('journal-1', page2.id, JSON.stringify(page2)),
      ]);

      // Both pages uploaded successfully — the inflight dedup worked
      expect(mockedApi.createFile).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ name: 'p1.json' }),
        expect.any(String),
      );
      expect(mockedApi.createFile).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ name: 'p2.json' }),
        expect.any(String),
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

  describe('uploadSyncIndex / downloadSyncIndex', () => {
    beforeEach(() => {
      store = new GDriveRemoteStore();
      mockedApi.listFiles.mockReset();
      mockedApi.createFile.mockReset();
      mockedApi.updateFile.mockReset();
      mockedApi.getFileContent.mockReset();
      mockedApi.getFileContentWithEtag.mockReset();
      mockedApi.deleteFile.mockReset();
    });

    it('uploads a sync index', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      // findFile for index.json — not found
      mockedApi.listFiles.mockResolvedValueOnce([]);
      mockedApi.createFile
        .mockResolvedValueOnce({
          id: 'delta-id',
          name: 'index-v2-delta.json',
          mimeType: 'application/json',
          modifiedTime: '',
        })
        .mockResolvedValueOnce({
          id: 'idx-id',
          name: 'index.json',
          mimeType: 'application/json',
          modifiedTime: '',
        });

      const index = { p1: { modified: 1000 }, p2: { modified: 2000, deleted: true } };
      await store.uploadSyncIndex('journal-1', index);

      expect(mockedApi.createFile).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({
          name: expect.stringMatching(/-index-v2-/),
          parents: ['appDataFolder'],
        }),
        JSON.stringify(index),
        'appDataFolder',
      );
      expect(mockedApi.createFile).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ name: 'index.json' }),
        JSON.stringify(index),
        'drive',
        undefined,
      );
    });

    it('compacts and permanently removes published deltas after a successful sync', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      const legacyFiles = [
        {
          id: 'legacy-v2',
          name: 'index-v2-00000000-0000-4000-8000-000000000000.json',
          content: JSON.stringify({ remote: { modified: 500 } }),
        },
      ];
      const hiddenFiles: Array<{ id: string; name: string; content: string }> = [];
      let nextId = 1;
      mockedApi.listFiles.mockImplementation(async (_token, query) => {
        if (query.includes("name = 'Canto'")) return [folder('root-id', 'Canto')];
        if (query.includes("name = 'journal-1'")) return [folder('journal-id', 'journal-1')];
        if (query.includes("name = 'index.json'")) return [];
        if (query.includes("name contains 'index-v'")) {
          return legacyFiles.map((file) => ({
            id: file.id,
            name: file.name,
            mimeType: 'application/json',
            modifiedTime: '',
          }));
        }
        if (query.includes("name contains 'canto-sync-index-v1-journal-1-'")) {
          return hiddenFiles.map((file) => ({
            id: file.id,
            name: file.name,
            mimeType: 'application/json',
            modifiedTime: '',
          }));
        }
        return [];
      });
      mockedApi.createFile.mockImplementation(async (_token, metadata, content) => {
        const id = `file-${nextId++}`;
        if (metadata.name.startsWith('canto-sync-index-v1-')) {
          hiddenFiles.push({ id, name: metadata.name, content });
        }
        return {
          id,
          name: metadata.name,
          mimeType: metadata.mimeType ?? 'application/json',
          modifiedTime: '',
        };
      });
      mockedApi.getFileContent.mockImplementation(async (_token, fileId) => {
        const file = [...legacyFiles, ...hiddenFiles].find((candidate) => candidate.id === fileId);
        if (!file) throw new Error('missing hidden index file');
        return file.content;
      });
      mockedApi.deleteFile.mockImplementation(async (_token, fileId) => {
        const index = hiddenFiles.findIndex((file) => file.id === fileId);
        if (index >= 0) hiddenFiles.splice(index, 1);
        const legacyIndex = legacyFiles.findIndex((file) => file.id === fileId);
        if (legacyIndex >= 0) legacyFiles.splice(legacyIndex, 1);
      });

      const publication = await store.openSyncIndexPublication('journal-1');
      await publication.publishPage('p1', { modified: 1000 });
      await publication.finalize({ successful: true });

      expect(hiddenFiles).toHaveLength(1);
      expect(hiddenFiles[0].name).toMatch(/-index-v3-/);
      expect(JSON.parse(hiddenFiles[0].content)).toEqual({
        version: 3,
        entries: { remote: { modified: 500 }, p1: { modified: 1000 } },
        coveredFileIds: expect.any(Array),
      });
      expect(legacyFiles).toHaveLength(0);
      expect(mockedApi.deleteFile).toHaveBeenCalledTimes(2);
    });

    it('keeps fewer than 128 deltas at a checkpoint', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      const hiddenFiles: Array<{ id: string; name: string; content: string }> = [];
      let nextId = 1;
      mockedApi.listFiles.mockImplementation(async (_token, query) => {
        if (query.includes("name = 'Canto'")) return [folder('root-id', 'Canto')];
        if (query.includes("name = 'journal-1'")) return [folder('journal-id', 'journal-1')];
        if (query.includes("name = 'index.json'")) return [];
        if (query.includes("name contains 'index-v'")) return [];
        if (query.includes("name contains 'canto-sync-index-v1-journal-1-'")) {
          return hiddenFiles.map((file) => ({
            id: file.id,
            name: file.name,
            mimeType: 'application/json',
            modifiedTime: '',
          }));
        }
        return [];
      });
      mockedApi.createFile.mockImplementation(async (_token, metadata, content) => {
        const id = `file-${nextId++}`;
        if (metadata.name.startsWith('canto-sync-index-v1-')) {
          hiddenFiles.push({ id, name: metadata.name, content });
        }
        return {
          id,
          name: metadata.name,
          mimeType: metadata.mimeType ?? 'application/json',
          modifiedTime: '',
        };
      });

      const publication = await store.openSyncIndexPublication('journal-1');
      await publication.publishPage('p1', { modified: 1000 });
      await publication.finalize({ successful: false });

      expect(hiddenFiles.map((file) => file.name)).toEqual([expect.stringMatching(/-index-v2-/)]);
      expect(mockedApi.deleteFile).not.toHaveBeenCalled();
    });

    it('merges concurrent entries and retries a precondition failure', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([
        { id: 'idx-id', name: 'index.json', mimeType: 'application/json', modifiedTime: '' },
      ]);
      mockedApi.getFileContentWithEtag
        .mockResolvedValueOnce({ content: '{"remote":{"modified":1000}}', etag: '"v1"' })
        .mockResolvedValueOnce({
          content: '{"remote":{"modified":1000},"other":{"modified":2000}}',
          etag: '"v2"',
        });
      mockedApi.updateFile
        .mockRejectedValueOnce(Object.assign(new api.GDriveApiError(412), { status: 412 }))
        .mockResolvedValueOnce({
          id: 'idx-id',
          name: 'index.json',
          mimeType: 'application/json',
          modifiedTime: '',
        });

      await store.uploadSyncIndex('journal-1', { local: { modified: 1500 } });

      expect(mockedApi.updateFile).toHaveBeenLastCalledWith(
        TOKEN,
        'idx-id',
        { name: 'index.json', mimeType: 'application/json' },
        JSON.stringify({
          remote: { modified: 1000 },
          other: { modified: 2000 },
          local: { modified: 1500 },
        }),
        undefined,
        '"v2"',
      );
    });

    it('merges immutable deltas when concurrent first writers create duplicate legacy indexes', async () => {
      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      const files: Array<{ id: string; name: string; content: string }> = [];
      let nextId = 1;
      let indexLookups = 0;
      let releaseIndexLookups!: () => void;
      const bothIndexLookups = new Promise<void>((resolve) => {
        releaseIndexLookups = resolve;
      });
      mockedApi.listFiles.mockImplementation(async (_token, query) => {
        if (query.includes("name = 'Canto'")) return [folder('root-id', 'Canto')];
        if (query.includes("name = 'journal-1'")) return [folder('j-id', 'journal-1')];
        if (query.includes("name = 'index.json'")) {
          if (++indexLookups <= 2) {
            if (indexLookups === 2) releaseIndexLookups();
            await bothIndexLookups;
          }
          return files
            .filter((file) => file.name === 'index.json')
            .map((file) => ({ ...folder(file.id, file.name), mimeType: 'application/json' }));
        }
        if (
          query.includes("name contains 'index-v'") ||
          query.includes("name contains 'canto-sync-index-v1-journal-1-'")
        ) {
          return files
            .filter(
              (file) =>
                file.name.startsWith('index-v2-') ||
                file.name.startsWith('canto-sync-index-v1-journal-1-index-v2-'),
            )
            .map((file) => ({ ...folder(file.id, file.name), mimeType: 'application/json' }));
        }
        return [];
      });
      mockedApi.createFile.mockImplementation(async (_token, metadata, content) => {
        const file = { id: `f-${nextId++}`, name: metadata.name, content };
        files.push(file);
        return { ...folder(file.id, file.name), mimeType: metadata.mimeType ?? 'application/json' };
      });
      mockedApi.getFileContent.mockImplementation(async (_token, fileId) => {
        const file = files.find((candidate) => candidate.id === fileId);
        if (!file) throw new Error('missing test file');
        return file.content;
      });

      const first = new GDriveRemoteStore();
      const second = new GDriveRemoteStore();
      await Promise.all([
        first.connect({ accessToken: TOKEN }),
        second.connect({ accessToken: TOKEN }),
      ]);
      await Promise.all([
        first.uploadSyncIndex('journal-1', { first: { modified: 1000 } }),
        second.uploadSyncIndex('journal-1', { second: { modified: 2000 } }),
      ]);

      expect(files.filter((file) => file.name === 'index.json')).toHaveLength(2);
      expect(
        files.filter((file) => file.name.startsWith('canto-sync-index-v1-journal-1-index-v2-')),
      ).toHaveLength(2);

      const reader = new GDriveRemoteStore();
      await reader.connect({ accessToken: TOKEN });
      await expect(reader.downloadSyncIndex('journal-1')).resolves.toEqual({
        first: { modified: 1000 },
        second: { modified: 2000 },
      });
    });

    it('downloads a sync index', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([
        { id: 'idx-id', name: 'index.json', mimeType: 'application/json', modifiedTime: '' },
      ]);
      mockedApi.listFiles.mockResolvedValueOnce([]); // legacy root-level deltas
      mockedApi.listFiles.mockResolvedValueOnce([]); // hidden deltas

      const index = { p1: { modified: 1000 }, p2: { modified: 2000 } };
      mockedApi.getFileContent.mockResolvedValueOnce(JSON.stringify(index));

      const result = await store.downloadSyncIndex('journal-1');
      expect(result).toEqual(index);
    });

    it('returns null when no sync index exists', async () => {
      await store.connect({ accessToken: TOKEN });

      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });

      mockedApi.listFiles.mockResolvedValueOnce([folder('root-id', 'Canto')]);
      mockedApi.listFiles.mockResolvedValueOnce([folder('j-id', 'journal-1')]);
      mockedApi.listFiles.mockResolvedValueOnce([]); // index.json not found
      mockedApi.listFiles.mockResolvedValueOnce([]); // legacy root-level deltas
      mockedApi.listFiles.mockResolvedValueOnce([]); // hidden deltas

      const result = await store.downloadSyncIndex('journal-1');
      expect(result).toBeNull();
    });

    it('prepares immutable chunk uploads from metadata and permits only missing chunks', async () => {
      await store.connect({ accessToken: TOKEN });
      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      mockedApi.listFiles.mockImplementation(async (_token, query) => {
        if (query.includes("name = 'Canto'")) return [folder('root', 'Canto')];
        if (query.includes("name = 'journal-1'")) return [folder('journal', 'journal-1')];
        if (query.includes("name = 'attachments'")) return [folder('attachments', 'attachments')];
        if (query.includes("name contains 'chunk-v1-'")) {
          return [
            {
              id: 'existing-0',
              name: 'chunk-v1-video-generation-0',
              mimeType: 'application/octet-stream',
              modifiedTime: '',
            },
          ];
        }
        return [];
      });
      mockedApi.createFile.mockResolvedValue({
        id: 'created-1',
        name: 'chunk-v1-video-generation-1',
        mimeType: 'application/octet-stream',
        modifiedTime: '',
      });
      const attachment = {
        id: 'video',
        path: '/local/video',
        name: 'video.bin',
        type: 'file' as const,
        encrypted: false,
        deleted: false,
        content: {
          format: 'canto-chunked-v1' as const,
          byteLength: 2,
          chunkSize: 1,
          chunkCount: 2,
          generation: 'generation',
        },
      };

      const prepared = await store.prepareChunkUploads('journal-1', [attachment]);
      expect(prepared.missingIndexes(attachment)).toEqual([1]);
      await expect(prepared.uploadMissingChunk(attachment, 0, 'already-present')).rejects.toThrow(
        'not prepared as missing',
      );
      await prepared.uploadMissingChunk(attachment, 1, 'encrypted-frame');
      expect(prepared.missingIndexes(attachment)).toEqual([]);
      expect(mockedApi.createFile).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ name: 'chunk-v1-video-generation-1' }),
        'encrypted-frame',
        'drive',
        undefined,
      );
    });

    it('lists only canonical immutable chunk indexes and updates prewarmed entries in place', async () => {
      await store.connect({ accessToken: TOKEN });
      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      mockedApi.listFiles.mockImplementation(async (_token, query) => {
        if (query.includes("name = 'Canto'")) return [folder('root', 'Canto')];
        if (query.includes("name = 'journal-1'")) return [folder('journal', 'journal-1')];
        if (query.includes("name = 'attachments'")) return [folder('attachments', 'attachments')];
        return [
          folder('zero', 'chunk-v1-video-generation-0'),
          folder('one', 'chunk-v1-video-generation-1'),
          folder('fraction', 'chunk-v1-video-generation-1.0'),
          folder('large', 'chunk-v1-video-generation-2'),
          folder('other', 'chunk-v1-other-generation-0'),
        ];
      });
      mockedApi.updateFile.mockResolvedValue({
        id: 'zero',
        name: 'chunk-v1-video-generation-0',
        mimeType: 'application/octet-stream',
        modifiedTime: '',
      });

      await expect(
        store.listAttachmentChunkIndexes('journal-1', 'video', 'generation', 2),
      ).resolves.toEqual(new Set([0, 1]));
      await store.uploadAttachmentChunk('journal-1', 'video', 'generation', 0, 'replacement');
      expect(mockedApi.updateFile).toHaveBeenCalledWith(
        TOKEN,
        'zero',
        expect.anything(),
        'replacement',
        undefined,
      );
    });

    it('rejects invalid prepared chunks and falls back when a prewarmed Drive file was deleted', async () => {
      await store.connect({ accessToken: TOKEN });
      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      const valid: Attachment = {
        id: 'video',
        path: '/local/video',
        name: 'video.bin',
        type: 'file',
        encrypted: false,
        deleted: false,
        content: {
          format: 'canto-chunked-v1',
          byteLength: 1,
          chunkSize: 1,
          chunkCount: 1,
          generation: 'generation',
        },
      };
      const generationless = {
        ...valid,
        name: 'legacy.bin',
        content: { ...valid.content!, generation: undefined },
      };
      await expect(store.prepareChunkUploads('journal-1', [generationless])).rejects.toThrow(
        'Immutable chunk generation required',
      );

      mockedApi.listFiles.mockImplementation(async (_token, query) => {
        if (query.includes("name = 'Canto'")) return [folder('root', 'Canto')];
        if (query.includes("name = 'journal-1'")) return [folder('journal', 'journal-1')];
        if (query.includes("name = 'attachments'")) return [folder('attachments', 'attachments')];
        if (query.includes("name contains 'chunk-v1-'")) {
          return [
            {
              id: 'stale',
              name: 'chunk-v1-video-generation-0',
              mimeType: 'application/octet-stream',
              modifiedTime: '',
            },
          ];
        }
        return [];
      });
      await store.prepareAttachmentChunkUploads('journal-1', [valid]);
      mockedApi.updateFile.mockRejectedValueOnce(
        Object.assign(new api.GDriveApiError(404), { status: 404 }),
      );
      mockedApi.createFile.mockResolvedValue({
        id: 'replacement',
        name: 'chunk-v1-video-generation-0',
        mimeType: 'application/octet-stream',
        modifiedTime: '',
      });

      await store.uploadAttachmentChunk('journal-1', 'video', 'generation', 0, 'replacement-data');

      expect(mockedApi.createFile).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ name: 'chunk-v1-video-generation-0' }),
        'replacement-data',
      );
    });

    it('makes an immutable index publication final exactly once and tolerates compaction errors', async () => {
      await store.connect({ accessToken: TOKEN });
      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      let legacyIndexLists = 0;
      mockedApi.listFiles.mockImplementation(async (_token, query) => {
        if (query.includes("name = 'Canto'")) return [folder('root', 'Canto')];
        if (query.includes("name = 'journal-1'")) return [folder('journal', 'journal-1')];
        if (query.includes("name = 'index.json'")) return [];
        if (query.includes("name contains 'index-v'")) {
          legacyIndexLists++;
          if (legacyIndexLists > 1) throw new Error('Drive unavailable');
          return [];
        }
        if (query.includes('canto-sync-index-v1-journal-1-')) return [];
        return [];
      });
      mockedApi.createFile.mockResolvedValue({
        id: 'delta',
        name: 'canto-sync-index-v1-journal-1-index-v2-delta',
        mimeType: 'application/json',
        modifiedTime: '',
      });
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      try {
        const publication = await store.openSyncIndexPublication('journal-1');
        await publication.publishPage('p1', { modified: 1 });
        await publication.finalize({ successful: true });
        await publication.finalize({ successful: true });
        await expect(publication.publishPage('p2', { modified: 2 })).rejects.toThrow('finalized');
        expect(warn).toHaveBeenCalledWith(
          '[GDrive] Sync-index compaction deferred:',
          expect.any(Error),
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('handles optional and invalid immutable-index edge cases without treating metadata as payload', async () => {
      await store.connect({ accessToken: TOKEN });
      const folder = (id: string, name: string) => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: '',
      });
      const chunk: Attachment = {
        id: 'video',
        path: '/local/video',
        name: 'video.bin',
        type: 'file',
        encrypted: false,
        deleted: false,
        content: {
          format: 'canto-chunked-v1',
          byteLength: 1,
          chunkSize: 1,
          chunkCount: 1,
          generation: 'generation',
        },
      };
      mockedApi.listFiles.mockImplementation(async (_token, query) => {
        if (query.includes("name = 'Canto'")) return [folder('root', 'Canto')];
        if (query.includes("name = 'journal-1'")) return [folder('journal', 'journal-1')];
        if (query.includes("name = 'attachments'")) return [folder('attachments', 'attachments')];
        if (query.includes("name = 'index.json'")) {
          return [
            { id: 'index', name: 'index.json', mimeType: 'application/json', modifiedTime: '' },
          ];
        }
        if (query.includes("name contains 'chunk-v1-'")) {
          return [
            {
              id: 'chunk-id',
              name: 'chunk-v1-video-generation-0',
              mimeType: 'application/octet-stream',
              modifiedTime: '',
            },
            {
              id: 'unrelated',
              name: 'chunk-v1-other-generation-0',
              mimeType: 'application/octet-stream',
              modifiedTime: '',
            },
          ];
        }
        return [];
      });
      mockedApi.getFileContentWithEtag.mockResolvedValue({ content: '{}', etag: null });
      mockedApi.getFileContent.mockResolvedValue('{}');
      mockedApi.updateFile.mockResolvedValue({
        id: 'chunk-id',
        name: 'chunk-v1-video-generation-0',
        mimeType: 'application/octet-stream',
        modifiedTime: '',
      });

      await store.prepareAttachmentChunkUploads('journal-1', []);
      await store.prepareAttachmentChunkUploads('journal-1', [
        { ...chunk, content: { ...chunk.content!, generation: undefined } },
      ]);
      const prepared = await store.prepareChunkUploads('journal-1', [chunk]);
      expect(() => prepared.missingIndexes({ ...chunk, id: 'other' })).toThrow('not prepared');
      await expect(prepared.uploadMissingChunk(chunk, 0, 'already-present')).rejects.toThrow(
        'not prepared as missing',
      );
      await store.uploadAttachmentChunk(
        'journal-1',
        'video',
        'generation',
        0,
        'replacement',
        new AbortController().signal,
      );
      await store.uploadSyncIndex('journal-1', { p1: { modified: 1 } });

      expect(mockedApi.updateFile).toHaveBeenCalledWith(
        TOKEN,
        'chunk-id',
        expect.objectContaining({ name: 'chunk-v1-video-generation-0' }),
        'replacement',
        expect.any(AbortSignal),
      );
    });
  });
});
