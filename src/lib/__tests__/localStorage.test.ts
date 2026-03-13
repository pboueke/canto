import { createLocalStore } from '../storage/local';
import type { EncryptionService } from '../encryption';
import type { JournalContent, Page, Attachment } from '@/models';

// In-memory filesystem mock
const filesystem: Record<string, string> = {};

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      const segments = parts.map((p) => (typeof p === 'string' ? p : p.uri));
      this.uri = segments.join('/');
    }
    get exists() {
      return this.uri in filesystem;
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
      // no-op for directories in our mock
    }
    list() {
      const prefix = this.uri + '/';
      const entries: MockFile[] = [];
      for (const key of Object.keys(filesystem)) {
        if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
          entries.push(new MockFile(key));
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
      remoteSync: false,
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

describe('createLocalStore', () => {
  it('initialize does not throw', async () => {
    const store = createLocalStore(createMockEncryption());
    await expect(store.initialize()).resolves.not.toThrow();
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

  it('getJournal returns null for non-existent journal', async () => {
    const store = createLocalStore(createMockEncryption());
    const result = await store.getJournal('nonexistent');
    expect(result).toBeNull();
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
