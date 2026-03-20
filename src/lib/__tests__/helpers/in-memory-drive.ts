/**
 * In-memory Google Drive simulation for sync e2e tests.
 * Provides a fake GDrive backend that wires into a jest-mocked gdrive/api module.
 *
 * IMPORTANT: The consuming test file MUST call jest.mock('../sync/gdrive/api')
 * before importing this module, then pass the mocked api to the constructor.
 */
import type * as apiModule from '../../sync/gdrive/api';

type MockedApi = jest.Mocked<typeof apiModule>;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parentId?: string;
  content: string;
  trashed: boolean;
}

export class InMemoryDrive {
  private files = new Map<string, DriveFile>();
  private nextId = 1;
  private api: MockedApi;

  constructor(mockedApi: MockedApi) {
    this.api = mockedApi;
  }

  setup() {
    this.files.clear();
    this.nextId = 1;

    this.api.listFiles.mockImplementation(async (_token: string, query: string, space?: string) => {
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
    });

    this.api.createFile.mockImplementation(
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

    this.api.getFileContent.mockImplementation(async (_token: string, fileId: string) => {
      const file = this.files.get(fileId);
      if (!file) throw new Error(`File not found: ${fileId}`);
      return file.content;
    });

    this.api.updateFile.mockImplementation(
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

    this.api.deleteFile.mockImplementation(async (_token: string, fileId: string) => {
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

  /** Get all non-trashed files (for debugging). */
  dump(): DriveFile[] {
    return [...this.files.values()].filter((f) => !f.trashed);
  }

  private matchesQuery(file: DriveFile, query: string): boolean {
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
