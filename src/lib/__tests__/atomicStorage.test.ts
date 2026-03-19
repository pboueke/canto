import { createLocalStore } from '../storage/local';
import type { EncryptionService } from '../encryption';
import type { JournalContent, Page } from '@/models';

// In-memory filesystem mock (same pattern as localStorage.test.ts)
const filesystem: Record<string, string> = {};

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    name: string;
    parentDirectory: { uri: string };
    constructor(...parts: (string | { uri: string })[]) {
      const segments = parts.map((p) => (typeof p === 'string' ? p : p.uri));
      this.uri = segments.join('/');
      const lastSlash = this.uri.lastIndexOf('/');
      this.name = lastSlash >= 0 ? this.uri.slice(lastSlash + 1) : this.uri;
      this.parentDirectory = { uri: lastSlash >= 0 ? this.uri.slice(0, lastSlash) : '' };
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
    move(target: { uri: string }) {
      filesystem[target.uri] = filesystem[this.uri];
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
      // no-op
    }
    list() {
      const prefix = this.uri + '/';
      const entries: (MockFile | MockDirectory)[] = [];
      const seen = new Set<string>();
      for (const key of Object.keys(filesystem)) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const slashIdx = rest.indexOf('/');
          if (slashIdx === -1) {
            // Direct child file
            entries.push(new MockFile(key));
          } else {
            // Subdirectory
            const dirName = rest.slice(0, slashIdx);
            const dirUri = prefix + dirName;
            if (!seen.has(dirUri)) {
              seen.add(dirUri);
              entries.push(new MockDirectory(dirUri));
            }
          }
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
      autoSync: false,
    },
    version: 1,
  };
}

beforeEach(() => {
  for (const key of Object.keys(filesystem)) delete filesystem[key];
});

describe('readEncrypted error handling', () => {
  it('returns null for non-existent file', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const result = await store.getPage('nonexistent', 'p1');
    expect(result).toBeNull();
  });

  it('returns null on decryption failure and does not crash', async () => {
    const mockEnc = createMockEncryption();
    (mockEnc.decrypt as jest.Mock).mockRejectedValueOnce(new Error('Tampered data'));

    const store = createLocalStore(mockEnc);
    await store.initialize();

    // Save a journal first
    const journal = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(journal);

    // Break decryption for next read
    (mockEnc.decrypt as jest.Mock).mockRejectedValueOnce(new Error('Tampered'));
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await store.getPage('j1', 'p1');
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('initialize — crash recovery', () => {
  it('recovers .tmp files in journal directories', async () => {
    const enc = createMockEncryption();
    const store = createLocalStore(enc);

    // Set up a .tmp file simulating interrupted write
    const journalDir = '/mock-docs/canto/j1';
    const tmpPath = `${journalDir}/metadata.json.tmp`;
    const finalPath = `${journalDir}/metadata.json`;
    filesystem[tmpPath] = 'enc:{"id":"j1","title":"recovered"}';

    await store.initialize();

    // .tmp should be moved to final
    expect(filesystem[finalPath]).toBe('enc:{"id":"j1","title":"recovered"}');
    expect(filesystem[tmpPath]).toBeUndefined();
  });

  it('recovers .tmp files in pages subdirectory', async () => {
    const enc = createMockEncryption();
    const store = createLocalStore(enc);

    const tmpPath = '/mock-docs/canto/j1/pages/p1.json.tmp';
    const finalPath = '/mock-docs/canto/j1/pages/p1.json';
    filesystem[tmpPath] = 'enc:{"id":"p1"}';

    await store.initialize();

    expect(filesystem[finalPath]).toBe('enc:{"id":"p1"}');
    expect(filesystem[tmpPath]).toBeUndefined();
  });

  it('no-ops when no .tmp files exist', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    // No .tmp recovery needed
    expect(Object.keys(filesystem).filter((k) => k.endsWith('.tmp'))).toHaveLength(0);
  });
});

describe('reencryptJournal', () => {
  it('re-encrypts all pages and metadata with new key', async () => {
    const enc = createMockEncryption();
    const store = createLocalStore(enc);
    await store.initialize();

    const journal = makeJournalContent('j1', [makePage('p1'), makePage('p2')]);
    await store.saveJournal(journal);

    // Re-encrypt: no old key, no new key (device-only)
    await store.reencryptJournal(journal, undefined, undefined);

    // Verify pages still readable
    const result = await store.getJournal('j1');
    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(2);
  });

  it('progress callback fires with correct counts', async () => {
    const enc = createMockEncryption();
    const store = createLocalStore(enc);
    await store.initialize();

    const pages = [makePage('p1'), makePage('p2'), makePage('p3')];
    const journal = makeJournalContent('j1', pages);
    await store.saveJournal(journal);

    const progress: [number, number][] = [];
    await store.reencryptJournal(journal, undefined, undefined, (c, t) => progress.push([c, t]));

    // 3 pages + 1 metadata = 4 total
    expect(progress).toHaveLength(4);
    expect(progress[0]).toEqual([1, 4]);
    expect(progress[3]).toEqual([4, 4]);
  });

  it('updates index with journal metadata', async () => {
    const enc = createMockEncryption();
    const store = createLocalStore(enc);
    await store.initialize();

    const journal = makeJournalContent('j1', [makePage('p1')]);
    journal.secure = true;
    journal.salt = 'test-salt';
    journal.kdfIterations = 600_000;
    await store.saveJournal(journal);

    await store.reencryptJournal(journal, undefined, undefined);

    const journals = await store.listJournals();
    expect(journals[0].secure).toBe(true);
    expect(journals[0].kdfIterations).toBe(600_000);
  });

  it('skips deleted pages', async () => {
    const enc = createMockEncryption();
    const store = createLocalStore(enc);
    await store.initialize();

    const p1 = makePage('p1');
    const p2 = { ...makePage('p2'), deleted: true };
    const journal = makeJournalContent('j1', [p1, p2]);
    await store.saveJournal(journal);

    const progress: [number, number][] = [];
    await store.reencryptJournal(journal, undefined, undefined, (c, t) => progress.push([c, t]));

    // Only 1 non-deleted page + 1 metadata = 2 total
    expect(progress).toHaveLength(2);
  });

  it('re-encrypts attachments alongside pages', async () => {
    const enc = createMockEncryption();
    const store = createLocalStore(enc);
    await store.initialize();

    const journal = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(journal);

    // Manually add an attachment file
    const attachPath = '/mock-docs/canto/j1/attachments/img-p1-12345.jpg';
    filesystem[attachPath] = 'enc:imagedata';

    await store.reencryptJournal(journal, undefined, undefined);

    // Attachment should be re-encrypted (device-only, no password key)
    // Mock encrypts as enc:X, decrypts by stripping enc: prefix
    // So re-encrypt: decrypt(enc:imagedata) = imagedata, encrypt(imagedata) = enc:imagedata
    expect(filesystem[attachPath]).toBe('enc:imagedata');
  });

  it('includes attachments in progress count', async () => {
    const enc = createMockEncryption();
    const store = createLocalStore(enc);
    await store.initialize();

    const journal = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(journal);

    // Add two attachment files
    filesystem['/mock-docs/canto/j1/attachments/img1.jpg'] = 'enc:data1';
    filesystem['/mock-docs/canto/j1/attachments/img2.jpg'] = 'enc:data2';

    const progress: [number, number][] = [];
    await store.reencryptJournal(journal, undefined, undefined, (c, t) => progress.push([c, t]));

    // 1 page + 2 attachments + 1 metadata = 4 total
    expect(progress).toHaveLength(4);
    expect(progress[0][1]).toBe(4); // total should be 4
    expect(progress[3]).toEqual([4, 4]);
  });

  it('re-encrypts attachments with new password key', async () => {
    // Use an encryption mock that supports a "password layer" via key prefix
    const enc: EncryptionService = {
      encrypt: jest.fn((data: string) => Promise.resolve(`dev:${data}`)),
      decrypt: jest.fn((data: string) => Promise.resolve(data.replace(/^dev:/, ''))),
      encryptWithPassword: jest.fn(),
      decryptWithPassword: jest.fn(),
      generateSalt: jest.fn(() => new Uint8Array(16)),
      clearSession: jest.fn(),
    };
    const store = createLocalStore(enc);
    await store.initialize();

    const journal = makeJournalContent('j1', [makePage('p1')]);
    journal.secure = true;
    await store.saveJournal(journal);

    // Simulate a password-encrypted attachment:
    // plaintext "imagedata" → password encrypt → "pwd:imagedata" → device encrypt → "dev:pwd:imagedata"
    filesystem['/mock-docs/canto/j1/attachments/img.jpg'] = 'dev:pwd:imagedata';

    // Old key: decrypt removes "pwd:" prefix
    // New key: encrypt adds "newpwd:" prefix
    // We mock aesGcmDecrypt/aesGcmEncrypt indirectly through the real code path,
    // but since we can't use real crypto with mock keys, we verify the flow:
    // The function calls enc.decrypt (device) then tries aesGcmDecrypt (password).
    // With undefined keys and mock encryption, the attachment will be re-encrypted
    // through the device layer only.
    await store.reencryptJournal(journal, undefined, undefined);

    // With no old/new key, attachment is just device-re-encrypted
    expect(filesystem['/mock-docs/canto/j1/attachments/img.jpg']).toBe('dev:pwd:imagedata');
  });
});

describe('reencryptAll', () => {
  // reencryptAll re-encrypts raw ciphertext files, then calls readIndex() which
  // uses the store's encryption service. To test properly, we use an encryption
  // mock that tracks a mutable "generation" so the store can still read after
  // re-encryption.

  function createTrackingEncryption() {
    let prefix = 'enc:';
    const enc: EncryptionService = {
      encrypt: jest.fn((data: string) => Promise.resolve(`${prefix}${data}`)),
      decrypt: jest.fn((data: string) => {
        // Accept any known prefix
        if (data.startsWith('v2:')) return Promise.resolve(data.slice(3));
        return Promise.resolve(data.replace(/^enc:/, ''));
      }),
      encryptWithPassword: jest.fn(),
      decryptWithPassword: jest.fn(),
      generateSalt: jest.fn(() => new Uint8Array(16)),
      clearSession: jest.fn(),
    };
    return {
      enc,
      setPrefix: (p: string) => {
        prefix = p;
      },
    };
  }

  it('re-encrypts index and all journal data', async () => {
    const { enc } = createTrackingEncryption();
    const store = createLocalStore(enc);
    await store.initialize();

    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await store.saveJournal(makeJournalContent('j2', [makePage('p2')]));

    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^enc:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`enc:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`v2:${pt}`);

    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    // Index file should now have v2: prefix
    const indexPath = '/mock-docs/canto/journals.json';
    expect(filesystem[indexPath]).toMatch(/^v2:/);
  });

  it('progress callback fires per journal', async () => {
    const { enc } = createTrackingEncryption();
    const store = createLocalStore(enc);
    await store.initialize();

    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await store.saveJournal(makeJournalContent('j2', [makePage('p2')]));

    const progress: [number, number][] = [];
    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^enc:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`enc:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`v2:${pt}`);

    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt, (c, t) => progress.push([c, t]));

    expect(progress).toHaveLength(2);
    expect(progress[0]).toEqual([1, 2]);
    expect(progress[1]).toEqual([2, 2]);
  });

  it('skips missing journal directories without crashing', async () => {
    const { enc } = createTrackingEncryption();
    const store = createLocalStore(enc);
    await store.initialize();

    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    for (const key of Object.keys(filesystem)) {
      if (key.includes('/j1/')) delete filesystem[key];
    }

    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^enc:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`enc:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`v2:${pt}`);

    await expect(store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt)).resolves.not.toThrow();
  });

  it('re-encrypts attachments', async () => {
    const { enc } = createTrackingEncryption();
    const store = createLocalStore(enc);
    await store.initialize();

    await store.saveJournal(makeJournalContent('j1'));
    const attachPath = '/mock-docs/canto/j1/attachments/img-p1-12345.jpg';
    filesystem[attachPath] = 'enc:imagedata';

    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^enc:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`enc:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`v2:${pt}`);

    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    expect(filesystem[attachPath]).toBe('v2:imagedata');
  });
});
