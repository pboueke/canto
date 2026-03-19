/**
 * End-to-end sync test for GDrive implementation.
 * Tests the full journal sync lifecycle using SyncEngine + GDriveRemoteStore
 * with a simulated in-memory GDrive backend.
 */
import { SyncEngine } from '../sync/engine';
import { GDriveRemoteStore } from '../sync/gdrive/store';
import * as api from '../sync/gdrive/api';
import type { LocalStore } from '../storage/types';
import type { Page, JournalContent, Attachment } from '@/models';

jest.mock('../sync/gdrive/api');
const mockedApi = api as jest.Mocked<typeof api>;

// ---------- In-memory GDrive simulation ----------

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parentId?: string;
  content: string;
  trashed: boolean;
}

class InMemoryDrive {
  private files = new Map<string, DriveFile>();
  private nextId = 1;

  setup() {
    this.files.clear();
    this.nextId = 1;

    mockedApi.listFiles.mockImplementation(
      async (_token: string, query: string, space?: string) => {
        const results: DriveFile[] = [];
        for (const f of this.files.values()) {
          if (f.trashed) continue;
          if (space === 'appDataFolder' && !f.parentId?.startsWith('appData')) continue;
          if (this.matchesQuery(f, query)) {
            results.push(f);
          }
        }
        return results.map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          modifiedTime: '',
        }));
      },
    );

    mockedApi.createFile.mockImplementation(
      async (
        _token: string,
        metadata: { name: string; mimeType?: string; parents?: string[] },
        content: string,
        space?: string,
      ) => {
        const id = `file-${this.nextId++}`;
        const parentId = space === 'appDataFolder' ? 'appData' : metadata.parents?.[0];
        const file: DriveFile = {
          id,
          name: metadata.name,
          mimeType: metadata.mimeType || 'application/json',
          parentId,
          content: content ?? '',
          trashed: false,
        };
        this.files.set(id, file);
        return { id, name: file.name, mimeType: file.mimeType, modifiedTime: '' };
      },
    );

    mockedApi.getFileContent.mockImplementation(async (_token: string, fileId: string) => {
      const file = this.files.get(fileId);
      if (!file) throw new Error(`File not found: ${fileId}`);
      return file.content;
    });

    mockedApi.updateFile.mockImplementation(
      async (_token: string, fileId: string, _metadata: unknown, content: string) => {
        const file = this.files.get(fileId);
        if (file && content !== undefined) {
          file.content = content;
        }
        return {
          id: fileId,
          name: file?.name ?? '',
          mimeType: file?.mimeType ?? '',
          modifiedTime: '',
        };
      },
    );

    mockedApi.deleteFile.mockImplementation(async (_token: string, fileId: string) => {
      const file = this.files.get(fileId);
      if (file) file.trashed = true;
    });
  }

  /** Put a file directly into the simulated drive (for setting up remote state). */
  putFile(name: string, parentId: string, content: string, mimeType = 'application/json'): string {
    const id = `file-${this.nextId++}`;
    this.files.set(id, { id, name, mimeType, parentId, content, trashed: false });
    return id;
  }

  putFolder(name: string, parentId?: string): string {
    const id = `file-${this.nextId++}`;
    this.files.set(id, {
      id,
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parentId,
      content: '',
      trashed: false,
    });
    return id;
  }

  getFileContent(fileId: string): string | undefined {
    return this.files.get(fileId)?.content;
  }

  isTrashed(fileId: string): boolean {
    return this.files.get(fileId)?.trashed ?? false;
  }

  private matchesQuery(file: DriveFile, query: string): boolean {
    // Simple query parser for GDrive-like queries
    if (query.includes(`name = '`)) {
      const nameMatch = query.match(/name = '([^']+)'/);
      if (nameMatch && file.name !== nameMatch[1]) return false;
    }
    if (query.includes(`mimeType = '`)) {
      const mimeMatch = query.match(/mimeType = '([^']+)'/);
      if (mimeMatch && file.mimeType !== mimeMatch[1]) return false;
    }
    if (query.includes(`' in parents`)) {
      const parentMatch = query.match(/'([^']+)' in parents/);
      if (parentMatch && file.parentId !== parentMatch[1]) return false;
    }
    if (query.includes('trashed = false') && file.trashed) return false;
    return true;
  }
}

// ---------- helpers ----------

const makePage = (
  id: string,
  modified: number,
  deleted = false,
  images: Attachment[] = [],
): Page => ({
  id,
  text: `Page ${id} content`,
  date: '2026-03-12T10:00:00Z',
  tags: ['test'],
  files: [],
  images,
  comments: [],
  modified,
  deleted,
});

const makeAttachment = (id: string, path: string): Attachment => ({
  id,
  path,
  name: `${id}.png`,
  type: 'image',
  encrypted: false,
  deleted: false,
});

const makeJournal = (pages: Page[], secure = false, salt?: string): JournalContent => ({
  id: 'j1',
  title: 'My Journal',
  icon: 'book',
  date: '2026-01-01T00:00:00Z',
  secure,
  salt,
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
    syncProvider: 'gdrive',
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
        Promise.resolve(`/local/files/${att.name}`),
      ),
    getAttachment: jest.fn().mockResolvedValue('base64imagedata'),
    deleteAttachment: jest.fn(),
    reencryptJournal: jest.fn(),
    reencryptAll: jest.fn(),
  };
}

// ---------- tests ----------

describe('GDrive sync E2E', () => {
  const drive = new InMemoryDrive();
  let store: GDriveRemoteStore;

  beforeEach(async () => {
    drive.setup();
    store = new GDriveRemoteStore();
    await store.connect({ accessToken: 'test-token' });
  });

  it('first sync: uploads all local pages to empty GDrive', async () => {
    const p1 = makePage('p1', 1000);
    const p2 = makePage('p2', 2000);
    const journal = makeJournal([p1, p2]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toHaveLength(2);
    expect(result.uploaded).toContain('p1');
    expect(result.uploaded).toContain('p2');
    expect(result.downloaded).toHaveLength(0);
  });

  it('second sync: downloads remote-only pages', async () => {
    // Simulate: first device synced p1, second device has no local pages
    const p1 = makePage('p1', 1000);
    const emptyJournal = makeJournal([]);
    const local = createMockLocalStore(emptyJournal);

    // Set up remote state: journal with p1 already synced
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...emptyJournal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(p1));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.downloaded).toContain('p1');
    expect(local.savePage).toHaveBeenCalledWith('j1', p1, undefined);
  });

  it('conflict resolution: local newer wins', async () => {
    const localPage = makePage('p1', 5000);
    const remotePage = makePage('p1', 1000);
    const journal = makeJournal([localPage]);
    const local = createMockLocalStore(journal);

    // Set up remote with older page
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toContain('p1');
    expect(result.downloaded).toHaveLength(0);
  });

  it('conflict resolution: remote newer wins', async () => {
    const localPage = makePage('p1', 1000);
    const remotePage = makePage('p1', 5000);
    const journal = makeJournal([localPage]);
    const local = createMockLocalStore(journal);

    // Set up remote with newer page
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.downloaded).toContain('p1');
    expect(result.uploaded).toHaveLength(0);
    expect(local.savePage).toHaveBeenCalledWith('j1', remotePage, undefined);
  });

  it('local deletion propagates to remote', async () => {
    const localPage = makePage('p1', 2000, true); // locally deleted
    const remotePage = makePage('p1', 1000, false); // alive on remote
    const journal = makeJournal([localPage]);
    const local = createMockLocalStore(journal);

    // Set up remote with alive page
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    const pageFileId = drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.deleted).toContain('p1');
    expect(drive.isTrashed(pageFileId)).toBe(true);
  });

  it('remote deletion propagates to local', async () => {
    const localPage = makePage('p1', 1000, false);
    const remotePage = makePage('p1', 2000, true); // remotely deleted
    const journal = makeJournal([localPage]);
    const local = createMockLocalStore(journal);

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.deleted).toContain('p1');
    expect(local.deletePage).toHaveBeenCalledWith('j1', 'p1', undefined);
  });

  it('attachment upload: local attachment gets gdrive:// path', async () => {
    const att = makeAttachment('img1', '/local/files/img1.png');
    const page = makePage('p1', 1000, false, [att]);
    const journal = makeJournal([page]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toContain('p1');
    expect(local.getAttachment).toHaveBeenCalledWith('/local/files/img1.png');
    // uploadAttachment should have been called (via the API mock)
    expect(mockedApi.createFile).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ name: 'img1.png' }),
      'base64imagedata',
    );
  });

  it('attachment download: remote attachment saved locally', async () => {
    const att = makeAttachment('img1', '/remote/img1.png');
    const remotePage = makePage('p1', 1000, false, [att]);
    const journal = makeJournal([]);
    const local = createMockLocalStore(journal);

    // Set up remote with page that has attachment
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    const attFolderId = drive.putFolder('attachments', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify(makeJournal([])));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile('img1.png', attFolderId, 'base64imagedata');
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.downloaded).toContain('p1');
    expect(local.saveAttachment).toHaveBeenCalled();
  });

  it('encrypted journal: derivedKey threaded through sync', async () => {
    const page = makePage('p1', 1000);
    const journal = makeJournal([page], true, 'base64salt==');
    const local = createMockLocalStore(journal);
    const derivedKey = new Uint8Array(32).fill(42);

    const engine = new SyncEngine(local, store);
    await engine.sync('j1', derivedKey);

    expect(local.getJournal).toHaveBeenCalledWith('j1', derivedKey);
  });

  it('handles missing local attachment gracefully', async () => {
    const att = makeAttachment('img1', '/local/files/img1.png');
    const page = makePage('p1', 1000, false, [att]);
    const journal = makeJournal([page]);
    const local = createMockLocalStore(journal);
    (local.getAttachment as jest.Mock).mockResolvedValue(null); // attachment missing

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toContain('p1');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing local attachment'));
    consoleSpy.mockRestore();
  });

  it('multiple pages with attachments sync correctly', async () => {
    const att1 = makeAttachment('img1', '/local/files/img1.png');
    const att2 = makeAttachment('img2', '/local/files/img2.png');
    const p1 = makePage('p1', 1000, false, [att1]);
    const p2 = makePage('p2', 2000, false, [att2]);
    const journal = makeJournal([p1, p2]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toHaveLength(2);
    // Both attachments should be uploaded
    expect(local.getAttachment).toHaveBeenCalledTimes(2);
  });

  it('sync with one corrupted remote page still downloads others', async () => {
    // Set up remote with two pages, one with corrupt JSON
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify(makeJournal([])));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(makePage('p1', 1000)));
    drive.putFile('p2.json', pagesFolderId, 'this is not valid json!!!');
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const journal = makeJournal([]);
    const local = createMockLocalStore(journal);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    // p1 should download successfully despite p2 being corrupt
    expect(result.downloaded).toContain('p1');
    consoleSpy.mockRestore();
  });

  it('full cycle: sync, modify remotely, re-sync downloads changes', async () => {
    // First sync: upload local page
    const p1 = makePage('p1', 1000);
    const journal = makeJournal([p1]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    const result1 = await engine.sync('j1');
    expect(result1.uploaded).toContain('p1');

    // Simulate remote edit: create a new store instance (like a second device)
    // The in-memory drive already has the page. Update it with newer timestamp.
    // Find the page file and update its content
    const updatedPage = makePage('p1', 5000);

    // Re-create store (simulates reconnection)
    const store2 = new GDriveRemoteStore();
    await store2.connect({ accessToken: 'test-token' });

    // Update the remote page directly via the drive simulation
    // We need to upload via the store to ensure the page file gets updated
    await store2.uploadPage('j1', updatedPage);

    // Now sync again with the original local (still has modified=1000)
    const store3 = new GDriveRemoteStore();
    await store3.connect({ accessToken: 'test-token' });
    const engine2 = new SyncEngine(local, store3);
    const result2 = await engine2.sync('j1');

    expect(result2.downloaded).toContain('p1');
  });
});
