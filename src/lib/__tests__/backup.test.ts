import JSZip from 'jszip';
import { aesGcmEncryptBytes, aesGcmDecryptBytes } from '../encryption/utils';
import { hasNameConflict, resolveNameConflict } from '../backup/conflicts';
import type { ExportManifest } from '../backup/export';
import type { JournalContent, Page, Attachment } from '@/models';
import { createLocalStore } from '../storage/local';
import type { EncryptionService } from '../encryption';
import type { LocalStore } from '../storage';

// ---------------------------------------------------------------------------
// In-memory filesystem mock (same pattern as localStorage.test.ts)
// ---------------------------------------------------------------------------
const filesystem: Record<string, string> = {};

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      const segments = parts.map((p) => (typeof p === 'string' ? p : p.uri));
      this.uri = segments.join('/');
    }
    get name() {
      return this.uri.split('/').pop() ?? '';
    }
    get parentDirectory() {
      const parent = this.uri.split('/').slice(0, -1).join('/');
      return new MockDirectory(parent);
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
    bytes() {
      // Mock filesystem stores ZIP data as base64; decode to Uint8Array
      const base64 = filesystem[this.uri] ?? '';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return Promise.resolve(bytes);
    }
    delete() {
      delete filesystem[this.uri];
    }
    move(target: MockFile) {
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
      /* no-op */
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
    Paths: {
      document: { uri: '/mock-docs' },
      cache: { uri: '/mock-cache' },
    },
    File: MockFile,
    Directory: MockDirectory,
  };
});

// ---------------------------------------------------------------------------
// Mock expo-sharing
// ---------------------------------------------------------------------------
const sharedFiles: string[] = [];
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(async (uri: string) => {
    sharedFiles.push(uri);
  }),
}));

// ---------------------------------------------------------------------------
// Mock useStorage — wire up a real LocalStore with passthrough encryption
// ---------------------------------------------------------------------------
function mockCreateEncryption(): EncryptionService {
  return {
    encrypt: jest.fn((data: string) => Promise.resolve(`enc:${data}`)),
    decrypt: jest.fn((data: string) => Promise.resolve(data.replace(/^enc:/, ''))),
    encryptWithPassword: jest.fn(),
    decryptWithPassword: jest.fn(),
    generateSalt: jest.fn(() => new Uint8Array(16)),
    clearSession: jest.fn(),
  };
}

let mockStore: LocalStore;

jest.mock('@/hooks/useStorage', () => ({
  getLocalStore: jest.fn(async () => mockStore),
  getEncryptionService: jest.fn(() => mockCreateEncryption()),
}));

// ---------------------------------------------------------------------------
// Now import the modules under test (after all jest.mock calls)
// ---------------------------------------------------------------------------
import { exportJournal } from '../backup/export';
import { inspectBackup, importJournal } from '../backup/import';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeJournal(id: string, overrides: Partial<JournalContent> = {}): JournalContent {
  return {
    id,
    title: `Journal ${id}`,
    icon: 'book',
    date: '2026-01-01T00:00:00Z',
    secure: false,
    pages: [],
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
    ...overrides,
  };
}

function makePage(id: string, overrides: Partial<Page> = {}): Page {
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
    ...overrides,
  };
}

function makeAttachment(id: string, overrides: Partial<Attachment> = {}): Attachment {
  return {
    id,
    path: `/mock-docs/canto/j1/attachments/img-p1-${id}.jpg`,
    name: `photo-${id}.jpg`,
    type: 'image',
    encrypted: false,
    deleted: false,
    ...overrides,
  };
}

/**
 * Build a minimal valid .canto.zip as base64 string, stored in the mock filesystem.
 * Returns the URI.
 */
async function buildZip(opts: {
  manifest: ExportManifest;
  journalJson: string | Uint8Array;
  settingsJson?: string | Uint8Array;
  pages?: { id: string; json: string | Uint8Array }[];
  attachments?: { filename: string; data: string | Uint8Array }[];
}): Promise<string> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(opts.manifest));
  zip.file('journal.json', opts.journalJson);
  if (opts.settingsJson) {
    zip.file('settings.json', opts.settingsJson);
  }
  for (const p of opts.pages ?? []) {
    zip.file(`pages/${p.id}.json`, p.json);
  }
  for (const a of opts.attachments ?? []) {
    zip.file(`attachments/${a.filename}`, a.data);
  }
  const base64 = await zip.generateAsync({ type: 'base64' });
  const uri = '/mock-cache/test-import.zip';
  filesystem[uri] = base64;
  return uri;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  for (const key of Object.keys(filesystem)) delete filesystem[key];
  sharedFiles.length = 0;
  mockStore = createLocalStore(mockCreateEncryption());
});

// ===================================================================
// CONFLICT UTILITIES
// ===================================================================
describe('name conflict utilities', () => {
  const existing = ['My Journal', 'Travel Notes', 'Daily Log'];

  describe('hasNameConflict', () => {
    it('detects exact match', () => {
      expect(hasNameConflict('My Journal', existing)).toBe(true);
    });

    it('detects case-insensitive match', () => {
      expect(hasNameConflict('my journal', existing)).toBe(true);
      expect(hasNameConflict('MY JOURNAL', existing)).toBe(true);
    });

    it('trims whitespace', () => {
      expect(hasNameConflict('  My Journal  ', existing)).toBe(true);
    });

    it('returns false for unique name', () => {
      expect(hasNameConflict('New Journal', existing)).toBe(false);
    });

    it('returns false for empty list', () => {
      expect(hasNameConflict('Any Name', [])).toBe(false);
    });

    it('returns false for empty name against non-empty list', () => {
      expect(hasNameConflict('', existing)).toBe(false);
    });
  });

  describe('resolveNameConflict', () => {
    it('returns original name when no conflict', () => {
      expect(resolveNameConflict('Unique', existing)).toBe('Unique');
    });

    it('appends (copy) for first conflict', () => {
      expect(resolveNameConflict('My Journal', existing)).toBe('My Journal (copy)');
    });

    it('appends (copy 2) when (copy) also exists', () => {
      const withCopy = [...existing, 'My Journal (copy)'];
      expect(resolveNameConflict('My Journal', withCopy)).toBe('My Journal (copy 2)');
    });

    it('increments number when multiple copies exist', () => {
      const withCopies = [...existing, 'My Journal (copy)', 'My Journal (copy 2)'];
      expect(resolveNameConflict('My Journal', withCopies)).toBe('My Journal (copy 3)');
    });

    it('handles case-insensitive conflict in copies', () => {
      const withCopy = [...existing, 'my journal (copy)'];
      expect(resolveNameConflict('My Journal', withCopy)).toBe('My Journal (copy 2)');
    });
  });
});

// ===================================================================
// EXPORT
// ===================================================================
describe('exportJournal', () => {
  it('creates a valid ZIP with manifest, journal, settings and pages', async () => {
    const page = makePage('p1');
    const journal = makeJournal('j1', { title: 'Test Export', pages: [page] });
    await mockStore.saveJournal(journal);

    await exportJournal(journal, false);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'));
    expect(zipUri).toBeDefined();

    const zipBase64 = filesystem[zipUri!];
    const zip = await JSZip.loadAsync(zipBase64, { base64: true });

    // Manifest
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as ExportManifest;
    expect(manifest.version).toBe(1);
    expect(manifest.encrypted).toBe(false);
    expect(manifest.journalTitle).toBe('Test Export');

    // Journal metadata
    const journalMeta = JSON.parse(await zip.file('journal.json')!.async('string'));
    expect(journalMeta.title).toBe('Test Export');
    expect(journalMeta.pages).toBeUndefined();

    // Settings
    const settings = JSON.parse(await zip.file('settings.json')!.async('string'));
    expect(settings.sort).toBe('descending');

    // Pages
    const pageFiles = zip.file(/^pages\//);
    expect(pageFiles).toHaveLength(1);
    const pageData = JSON.parse(await pageFiles[0].async('string'));
    expect(pageData.text).toBe('Page p1 content');
  });

  it('excludes deleted pages from export', async () => {
    const active = makePage('p1');
    const deleted = makePage('p2', { deleted: true });
    const journal = makeJournal('j1', { pages: [active, deleted] });
    await mockStore.saveJournal(journal);

    await exportJournal(journal, false);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    const zip = await JSZip.loadAsync(filesystem[zipUri], { base64: true });
    const pageFiles = zip.file(/^pages\//);
    expect(pageFiles).toHaveLength(1);
    const data = JSON.parse(await pageFiles[0].async('string'));
    expect(data.id).toBe('p1');
  });

  it('includes attachments in export and rewrites paths', async () => {
    const att = makeAttachment('att1');
    const page = makePage('p1', { images: [att] });
    const journal = makeJournal('j1', { pages: [page] });

    await mockStore.saveJournal(journal);
    // Save attachment and update the path to match what was stored on disk
    // Use valid base64 data (PNG header bytes)
    const validBase64 = btoa('fake-image-binary-data');
    const savedUri = await mockStore.saveAttachment('j1', 'p1', att, validBase64);
    att.path = savedUri;
    page.images[0].path = savedUri;

    await exportJournal(journal, false);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    const zip = await JSZip.loadAsync(filesystem[zipUri], { base64: true });

    const attFiles = zip.file(/^attachments\//);
    expect(attFiles).toHaveLength(1);
    expect(attFiles[0].name).toContain('image-att1');

    const pageFiles = zip.file(/^pages\//);
    const pageData = JSON.parse(await pageFiles[0].async('string'));
    expect(pageData.images[0].path).toMatch(/^image-att1/);
  });

  it('excludes deleted attachments', async () => {
    const att = makeAttachment('att1', { deleted: true });
    const page = makePage('p1', { images: [att] });
    const journal = makeJournal('j1', { pages: [page] });
    await mockStore.saveJournal(journal);

    await exportJournal(journal, false);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    const zip = await JSZip.loadAsync(filesystem[zipUri], { base64: true });
    const attFiles = zip.file(/^attachments\//);
    expect(attFiles).toHaveLength(0);
  });

  it('encrypts content when encrypted=true and derivedKey provided', async () => {
    const key = new Uint8Array(32);
    key.fill(0xab);

    const page = makePage('p1');
    const journal = makeJournal('j1', {
      title: 'Secure Journal',
      secure: true,
      salt: 'dGVzdHNhbHQ=',
      kdfIterations: 50000,
      pages: [page],
    });
    await mockStore.saveJournal(journal);

    await exportJournal(journal, true, key);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    const zip = await JSZip.loadAsync(filesystem[zipUri], { base64: true });

    // Manifest should be plaintext and indicate encryption
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as ExportManifest;
    expect(manifest.encrypted).toBe(true);
    expect(manifest.salt).toBe('dGVzdHNhbHQ=');
    expect(manifest.kdfIterations).toBe(50000);

    // Journal.json should be encrypted binary (not valid JSON directly)
    const journalRaw = await zip.file('journal.json')!.async('uint8array');
    expect(() => JSON.parse(new TextDecoder().decode(journalRaw))).toThrow();

    // But should be decryptable with the key
    const decrypted = await aesGcmDecryptBytes(journalRaw, key);
    const journalData = JSON.parse(decrypted);
    expect(journalData.title).toBe('Secure Journal');

    // Page should also be encrypted binary
    const pageRaw = await zip.file(/^pages\//)[0].async('uint8array');
    expect(() => JSON.parse(new TextDecoder().decode(pageRaw))).toThrow();
    const pageDecrypted = JSON.parse(await aesGcmDecryptBytes(pageRaw, key));
    expect(pageDecrypted.text).toBe('Page p1 content');
  });

  it('includes salt/kdfIterations in manifest even when export is unencrypted', async () => {
    const journal = makeJournal('j1', {
      secure: true,
      salt: 'somesalt',
      kdfIterations: 100000,
      pages: [],
    });
    await mockStore.saveJournal(journal);

    await exportJournal(journal, false);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    const zip = await JSZip.loadAsync(filesystem[zipUri], { base64: true });
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as ExportManifest;
    expect(manifest.encrypted).toBe(false);
    expect(manifest.salt).toBe('somesalt');
    expect(manifest.kdfIterations).toBe(100000);
  });

  it('calls expo-sharing shareAsync with the ZIP URI', async () => {
    const journal = makeJournal('j1', { pages: [] });
    await mockStore.saveJournal(journal);

    await exportJournal(journal, false);

    expect(sharedFiles).toHaveLength(1);
    expect(sharedFiles[0]).toContain('.canto.zip');
  });

  it('reports progress during export', async () => {
    const pages = [makePage('p1'), makePage('p2'), makePage('p3')];
    const journal = makeJournal('j1', { pages });
    await mockStore.saveJournal(journal);

    const progressCalls: { current: number; total: number; phase: string }[] = [];
    await exportJournal(journal, false, undefined, (p) => progressCalls.push(p));

    expect(progressCalls.length).toBeGreaterThanOrEqual(3);
    expect(progressCalls.some((p) => p.phase === 'pages')).toBe(true);
    expect(progressCalls.some((p) => p.phase === 'zipping')).toBe(true);
    const last = progressCalls[progressCalls.length - 1];
    expect(last.current).toBe(last.total);
  });

  it('sanitizes special characters in filename', async () => {
    const journal = makeJournal('j1', { title: 'My Journal / <Test> "2026"', pages: [] });
    await mockStore.saveJournal(journal);

    await exportJournal(journal, false);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    expect(zipUri).not.toContain('/My Journal');
    expect(zipUri).toContain('My_Journal');
  });

  it('deduplicates attachments shared across pages', async () => {
    const sharedPath = '/mock-docs/canto/j1/attachments/img-shared-123.jpg';
    const att1: Attachment = {
      id: 'att1',
      path: sharedPath,
      name: 'shared.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const att2: Attachment = {
      id: 'att1',
      path: sharedPath,
      name: 'shared.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const p1 = makePage('p1', { images: [att1] });
    const p2 = makePage('p2', { images: [att2] });
    const journal = makeJournal('j1', { pages: [p1, p2] });
    await mockStore.saveJournal(journal);
    // Store valid base64 data (mock encryption prefixes with 'enc:')
    const validBase64 = btoa('fake-shared-image-data');
    filesystem[sharedPath] = `enc:${validBase64}`;

    await exportJournal(journal, false);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    const zip = await JSZip.loadAsync(filesystem[zipUri], { base64: true });
    const attFiles = zip.file(/^attachments\//);
    expect(attFiles).toHaveLength(1);
  });

  it('handles journal with no pages', async () => {
    const journal = makeJournal('j1', { title: 'Empty', pages: [] });
    await mockStore.saveJournal(journal);

    await exportJournal(journal, false);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    const zip = await JSZip.loadAsync(filesystem[zipUri], { base64: true });
    expect(zip.file(/^pages\//).length).toBe(0);
    expect(zip.file('manifest.json')).not.toBeNull();
    expect(zip.file('journal.json')).not.toBeNull();
  });
});

// ===================================================================
// INSPECT BACKUP
// ===================================================================
describe('inspectBackup', () => {
  it('reads manifest from a valid unencrypted backup', async () => {
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'My Journal',
      },
      journalJson: JSON.stringify({ title: 'My Journal' }),
    });

    const info = await inspectBackup(uri);
    expect(info.manifest.journalTitle).toBe('My Journal');
    expect(info.needsPassword).toBe(false);
  });

  it('detects encrypted backup needs password', async () => {
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: true,
        salt: 'dGVzdA==',
        kdfIterations: 50000,
        journalTitle: 'Encrypted',
      },
      journalJson: 'encrypted-blob',
    });

    const info = await inspectBackup(uri);
    expect(info.needsPassword).toBe(true);
    expect(info.manifest.salt).toBe('dGVzdA==');
    expect(info.manifest.kdfIterations).toBe(50000);
  });

  it('unencrypted backup of secure journal has optional password', async () => {
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        salt: 'dGVzdA==',
        kdfIterations: 50000,
        journalTitle: 'Secure Unencrypted',
      },
      journalJson: JSON.stringify({ title: 'Secure Unencrypted', secure: true }),
    });

    const info = await inspectBackup(uri);
    expect(info.manifest.encrypted).toBe(false);
    expect(info.needsPassword).toBe(false);
    expect(info.canProvidePassword).toBe(true);
  });

  it('legacy secure journal (salt but no kdfIterations) has optional password', async () => {
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        salt: 'dGVzdA==',
        journalTitle: 'Legacy Secure',
      },
      journalJson: JSON.stringify({ title: 'Legacy Secure', secure: true }),
    });

    const info = await inspectBackup(uri);
    expect(info.needsPassword).toBe(false);
    expect(info.canProvidePassword).toBe(true);
  });

  it('throws on missing manifest.json', async () => {
    const zip = new JSZip();
    zip.file('journal.json', '{}');
    const base64 = await zip.generateAsync({ type: 'base64' });
    const uri = '/mock-cache/no-manifest.zip';
    filesystem[uri] = base64;

    await expect(inspectBackup(uri)).rejects.toThrow('missing manifest.json');
  });

  it('throws on unsupported version', async () => {
    const uri = await buildZip({
      manifest: {
        version: 99 as 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'Future',
      },
      journalJson: '{}',
    });

    await expect(inspectBackup(uri)).rejects.toThrow('Unsupported backup version');
  });
});

// ===================================================================
// IMPORT
// ===================================================================
describe('importJournal', () => {
  it('imports an unencrypted backup and creates a new journal', async () => {
    const page = makePage('orig-p1');
    const journal = makeJournal('orig-j1', { title: 'Original', pages: [page] });

    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'Original',
      },
      journalJson: JSON.stringify({ ...journal, pages: undefined }),
      settingsJson: JSON.stringify(journal.settings),
      pages: [{ id: 'orig-p1', json: JSON.stringify(page) }],
    });

    const result = await importJournal(uri, 'Original');

    expect(result.title).toBe('Original');
    expect(result.journalId).not.toBe('orig-j1');

    const journals = await mockStore.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].title).toBe('Original');

    const loaded = await mockStore.getJournal(result.journalId);
    expect(loaded).not.toBeNull();
    expect(loaded!.pages.length).toBeGreaterThanOrEqual(1);
  });

  it('generates new UUIDs for imported journal and pages', async () => {
    const page = makePage('old-page-id');
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'Test',
      },
      journalJson: JSON.stringify(makeJournal('old-journal-id')),
      pages: [{ id: 'old-page-id', json: JSON.stringify(page) }],
    });

    const result = await importJournal(uri, 'Test');

    expect(result.journalId).not.toBe('old-journal-id');

    const loaded = await mockStore.getJournal(result.journalId);
    expect(loaded).not.toBeNull();
    for (const p of loaded!.pages) {
      expect(p.id).not.toBe('old-page-id');
    }
  });

  it('allows re-importing the same backup multiple times', async () => {
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'Repeated',
      },
      journalJson: JSON.stringify(makeJournal('j1')),
      pages: [{ id: 'p1', json: JSON.stringify(makePage('p1')) }],
    });

    const r1 = await importJournal(uri, 'Repeated');
    const r2 = await importJournal(uri, 'Repeated (copy)');
    const r3 = await importJournal(uri, 'Repeated (copy 2)');

    expect(r1.journalId).not.toBe(r2.journalId);
    expect(r2.journalId).not.toBe(r3.journalId);

    const journals = await mockStore.listJournals();
    expect(journals).toHaveLength(3);
  });

  it('uses the provided title (handles rename)', async () => {
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'Original Name',
      },
      journalJson: JSON.stringify(makeJournal('j1', { title: 'Original Name' })),
    });

    const result = await importJournal(uri, 'Renamed Journal');

    expect(result.title).toBe('Renamed Journal');
    const journals = await mockStore.listJournals();
    expect(journals[0].title).toBe('Renamed Journal');
  });

  it('preserves page content during import', async () => {
    const page = makePage('p1', {
      text: 'Hello from export!',
      tags: ['travel', 'food'],
      location: { latitude: 40.7, longitude: -74.0 },
      comments: [{ id: 'c1', text: 'Nice!', date: '2026-03-12T12:00:00Z' }],
    });

    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'Rich Content',
      },
      journalJson: JSON.stringify(makeJournal('j1')),
      pages: [{ id: 'p1', json: JSON.stringify(page) }],
    });

    const result = await importJournal(uri, 'Rich Content');
    const loaded = await mockStore.getJournal(result.journalId);
    const importedPage = loaded!.pages[0];

    expect(importedPage.text).toBe('Hello from export!');
    expect(importedPage.tags).toEqual(['travel', 'food']);
    expect(importedPage.location?.latitude).toBe(40.7);
    expect(importedPage.comments).toHaveLength(1);
    expect(importedPage.comments[0].text).toBe('Nice!');
  });

  it('preserves journal settings during import', async () => {
    const settings = {
      use24h: true,
      previewTags: false,
      previewThumbnail: true,
      previewIcons: false,
      filterBar: true,
      sort: 'ascending' as const,
      showMarkdownPlaceholder: false,
      autoLocation: true,
      remoteSync: false,
      autoSync: false,
    };

    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'Settings Test',
      },
      journalJson: JSON.stringify(makeJournal('j1')),
      settingsJson: JSON.stringify(settings),
    });

    const result = await importJournal(uri, 'Settings Test');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.settings.use24h).toBe(true);
    expect(loaded!.settings.sort).toBe('ascending');
    expect(loaded!.settings.autoLocation).toBe(true);
    expect(loaded!.settings.previewTags).toBe(false);
  });

  it('uses default settings when settings.json is missing', async () => {
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'No Settings',
      },
      journalJson: JSON.stringify(makeJournal('j1')),
    });

    const result = await importJournal(uri, 'No Settings');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.settings.sort).toBe('descending');
    expect(loaded!.settings.previewTags).toBe(true);
  });

  it('imports encrypted backup with correct key', async () => {
    const key = new Uint8Array(32);
    key.fill(0xab);

    const page = makePage('p1', { text: 'Secret page content' });
    const journal = makeJournal('j1', { title: 'Secret Journal' });

    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: true,
        salt: 'dGVzdA==',
        kdfIterations: 50000,
        journalTitle: 'Secret Journal',
      },
      journalJson: await aesGcmEncryptBytes(JSON.stringify(journal), key),
      settingsJson: await aesGcmEncryptBytes(JSON.stringify(journal.settings), key),
      pages: [{ id: 'p1', json: await aesGcmEncryptBytes(JSON.stringify(page), key) }],
    });

    const result = await importJournal(uri, 'Secret Journal', key);

    const loaded = await mockStore.getJournal(result.journalId, key);
    expect(loaded).not.toBeNull();
    expect(loaded!.pages).toHaveLength(1);
    expect(loaded!.pages[0].text).toBe('Secret page content');
  });

  it('fails to import encrypted backup with wrong key', async () => {
    const correctKey = new Uint8Array(32);
    correctKey.fill(0xab);
    const wrongKey = new Uint8Array(32);
    wrongKey.fill(0xcd);

    const journal = makeJournal('j1');
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: true,
        salt: 'dGVzdA==',
        kdfIterations: 50000,
        journalTitle: 'Secret',
      },
      journalJson: await aesGcmEncryptBytes(JSON.stringify(journal), correctKey),
    });

    await expect(importJournal(uri, 'Secret', wrongKey)).rejects.toThrow();
  });

  it('throws on missing journal.json in backup', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'Bad',
      }),
    );
    const base64 = await zip.generateAsync({ type: 'base64' });
    const uri = '/mock-cache/bad-backup.zip';
    filesystem[uri] = base64;

    await expect(importJournal(uri, 'Bad')).rejects.toThrow('missing journal.json');
  });

  it('encrypted import preserves password protection', async () => {
    const key = new Uint8Array(32);
    key.fill(0xab);

    const journal = makeJournal('j1', { secure: true, salt: 'abc', kdfIterations: 50000 });
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: true,
        salt: 'abc',
        kdfIterations: 50000,
        journalTitle: 'Was Secure',
      },
      journalJson: await aesGcmEncryptBytes(JSON.stringify(journal), key),
    });

    const result = await importJournal(uri, 'Was Secure', key);
    const journals = await mockStore.listJournals();
    const imported = journals.find((j) => j.id === result.journalId);
    expect(imported!.secure).toBe(true);
  });

  it('unencrypted import has no password protection', async () => {
    const journal = makeJournal('j1', { secure: false });
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'No Password',
      },
      journalJson: JSON.stringify(journal),
    });

    const result = await importJournal(uri, 'No Password');
    const journals = await mockStore.listJournals();
    const imported = journals.find((j) => j.id === result.journalId);
    expect(imported!.secure).toBe(false);
  });

  it('unencrypted export of secure journal preserves encryption on import with key', async () => {
    const key = new Uint8Array(32);
    key.fill(0xab);

    // Page has one encrypted and one unencrypted image
    const encAtt = makeAttachment('enc1', { encrypted: true, name: 'secret.jpg' });
    const plainAtt = makeAttachment('plain1', { encrypted: false, name: 'photo.jpg' });
    const page = makePage('p1', { images: [encAtt, plainAtt] });

    // Journal metadata says secure
    const journal = makeJournal('j1', {
      secure: true,
      salt: 'dGVzdA==',
      kdfIterations: 50000,
    });

    // Build an UNENCRYPTED backup (ZIP content is plaintext, but salt/kdf present)
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: journal.title,
        salt: 'dGVzdA==',
        kdfIterations: 50000,
      },
      journalJson: JSON.stringify(journal),
      pages: [{ id: 'p1', json: JSON.stringify(page) }],
      attachments: [
        { filename: 'image-enc1.jpg', data: btoa('encrypted-image-data') },
        { filename: 'image-plain1.jpg', data: btoa('plain-image-data') },
      ],
    });

    const result = await importJournal(uri, 'Preserved', key);
    const loaded = await mockStore.getJournal(result.journalId, key);

    // Journal should be secure
    expect(loaded!.secure).toBe(true);

    // Originally encrypted attachment should still be encrypted
    const importedEnc = loaded!.pages[0].images.find((a) => a.name === 'secret.jpg');
    expect(importedEnc!.encrypted).toBe(true);

    // Originally plain attachment should remain plain
    const importedPlain = loaded!.pages[0].images.find((a) => a.name === 'photo.jpg');
    expect(importedPlain!.encrypted).toBe(false);
  });

  it('reports progress during import', async () => {
    const pages = [makePage('p1'), makePage('p2')];
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'Progress Test',
      },
      journalJson: JSON.stringify(makeJournal('j1')),
      pages: pages.map((p) => ({ id: p.id, json: JSON.stringify(p) })),
    });

    const progressCalls: { current: number; total: number; phase: string }[] = [];
    await importJournal(uri, 'Progress Test', undefined, (p) => progressCalls.push(p));

    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    expect(progressCalls.some((p) => p.phase === 'pages')).toBe(true);
  });

  it('imports multiple pages correctly', async () => {
    const pages = [
      makePage('p1', { text: 'First entry' }),
      makePage('p2', { text: 'Second entry' }),
      makePage('p3', { text: 'Third entry' }),
    ];

    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'Multi Page',
      },
      journalJson: JSON.stringify(makeJournal('j1')),
      pages: pages.map((p) => ({ id: p.id, json: JSON.stringify(p) })),
    });

    const result = await importJournal(uri, 'Multi Page');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.pages).toHaveLength(3);
    const texts = loaded!.pages.map((p) => p.text).sort();
    expect(texts).toEqual(['First entry', 'Second entry', 'Third entry']);
  });

  it('preserves icon from original journal', async () => {
    const journal = makeJournal('j1', { icon: 'heart' });
    const uri = await buildZip({
      manifest: {
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: false,
        journalTitle: 'Icon Test',
      },
      journalJson: JSON.stringify(journal),
    });

    const result = await importJournal(uri, 'Icon Test');
    const journals = await mockStore.listJournals();
    const imported = journals.find((j) => j.id === result.journalId);
    expect(imported!.icon).toBe('heart');
  });
});

// ===================================================================
// EXPORT → IMPORT ROUND-TRIP
// ===================================================================
describe('export → import round-trip', () => {
  it('round-trips an unencrypted journal with pages', async () => {
    const pages = [
      makePage('p1', { text: 'Entry one', tags: ['daily'] }),
      makePage('p2', { text: 'Entry two', tags: ['travel', 'food'] }),
    ];
    const journal = makeJournal('j1', {
      title: 'Round Trip',
      icon: 'star',
      pages,
      settings: {
        use24h: true,
        previewTags: false,
        previewThumbnail: true,
        previewIcons: true,
        filterBar: false,
        sort: 'ascending',
        showMarkdownPlaceholder: false,
        autoLocation: true,
        remoteSync: false,
        autoSync: false,
      },
    });
    await mockStore.saveJournal(journal);

    await exportJournal(journal, false);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    const importUri = '/mock-cache/roundtrip.zip';
    filesystem[importUri] = filesystem[zipUri];

    const result = await importJournal(importUri, 'Round Trip Imported');

    const loaded = await mockStore.getJournal(result.journalId);
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe('Round Trip Imported');
    expect(loaded!.icon).toBe('star');
    expect(loaded!.pages).toHaveLength(2);
    expect(loaded!.settings.use24h).toBe(true);
    expect(loaded!.settings.sort).toBe('ascending');

    const texts = loaded!.pages.map((p) => p.text).sort();
    expect(texts).toEqual(['Entry one', 'Entry two']);

    const allTags = loaded!.pages.flatMap((p) => p.tags);
    expect(allTags).toContain('daily');
    expect(allTags).toContain('travel');
  });

  it('round-trips an encrypted journal', async () => {
    const key = new Uint8Array(32);
    key.fill(0xab);

    const page = makePage('p1', { text: 'Top secret stuff' });
    const journal = makeJournal('j1', {
      title: 'Encrypted RT',
      secure: true,
      salt: 'dGVzdHNhbHQ=',
      kdfIterations: 50000,
      pages: [page],
    });
    await mockStore.saveJournal(journal);

    await exportJournal(journal, true, key);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    const importUri = '/mock-cache/encrypted-rt.zip';
    filesystem[importUri] = filesystem[zipUri];

    const result = await importJournal(importUri, 'Decrypted Copy', key);

    const loaded = await mockStore.getJournal(result.journalId, key);
    expect(loaded).not.toBeNull();
    expect(loaded!.pages).toHaveLength(1);
    expect(loaded!.pages[0].text).toBe('Top secret stuff');
    expect(loaded!.secure).toBe(true);
  });

  it('round-trip preserves page comments and location', async () => {
    const page = makePage('p1', {
      text: 'With metadata',
      location: { latitude: 48.8566, longitude: 2.3522, altitude: 35 },
      comments: [
        { id: 'c1', text: 'First comment', date: '2026-03-12T10:00:00Z' },
        { id: 'c2', text: 'Second comment', date: '2026-03-12T11:00:00Z' },
      ],
    });
    const journal = makeJournal('j1', { pages: [page] });
    await mockStore.saveJournal(journal);

    await exportJournal(journal, false);

    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    const importUri = '/mock-cache/metadata-rt.zip';
    filesystem[importUri] = filesystem[zipUri];

    const result = await importJournal(importUri, 'Metadata RT');
    const loaded = await mockStore.getJournal(result.journalId);
    const p = loaded!.pages[0];

    expect(p.location?.latitude).toBe(48.8566);
    expect(p.location?.longitude).toBe(2.3522);
    expect(p.location?.altitude).toBe(35);
    expect(p.comments).toHaveLength(2);
    expect(p.comments[0].text).toBe('First comment');
    expect(p.comments[1].text).toBe('Second comment');
  });

  it('unencrypted round-trip of secure journal preserves attachment encryption flags', async () => {
    const key = new Uint8Array(32);
    key.fill(0xab);

    // Create attachments: one encrypted, one plain
    const encAtt = makeAttachment('enc1', { encrypted: true, name: 'secret.jpg' });
    const plainAtt = makeAttachment('plain1', { encrypted: false, name: 'photo.jpg' });
    const page = makePage('p1', { images: [encAtt, plainAtt] });

    const journal = makeJournal('j1', {
      title: 'Mixed Attachments',
      secure: true,
      salt: 'dGVzdA==',
      kdfIterations: 50000,
      pages: [page],
    });
    await mockStore.saveJournal(journal);

    // Save attachment data
    const encData = btoa('encrypted-image-binary');
    const plainData = btoa('plain-image-binary');
    const encPath = await mockStore.saveAttachment('j1', 'p1', encAtt, encData, key);
    const plainPath = await mockStore.saveAttachment('j1', 'p1', plainAtt, plainData);
    encAtt.path = encPath;
    plainAtt.path = plainPath;
    journal.pages[0].images[0].path = encPath;
    journal.pages[0].images[1].path = plainPath;

    // Export UNENCRYPTED
    await exportJournal(journal, false, key);

    // Inspect the ZIP to verify page data has encrypted: true
    const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
    const zip = await JSZip.loadAsync(filesystem[zipUri], { base64: true });
    const pageInZip = JSON.parse(await zip.file(/^pages\//)[0].async('string'));
    const encInZip = pageInZip.images.find((a: Attachment) => a.name === 'secret.jpg');
    const plainInZip = pageInZip.images.find((a: Attachment) => a.name === 'photo.jpg');
    expect(encInZip.encrypted).toBe(true);
    expect(plainInZip.encrypted).toBe(false);

    // Import with key
    const importUri = '/mock-cache/mixed-rt.zip';
    filesystem[importUri] = filesystem[zipUri];
    const result = await importJournal(importUri, 'Imported Mixed', key);

    const loaded = await mockStore.getJournal(result.journalId, key);
    expect(loaded).not.toBeNull();
    expect(loaded!.secure).toBe(true);

    const importedEnc = loaded!.pages[0].images.find((a) => a.name === 'secret.jpg');
    const importedPlain = loaded!.pages[0].images.find((a) => a.name === 'photo.jpg');
    expect(importedEnc).toBeDefined();
    expect(importedPlain).toBeDefined();
    expect(importedEnc!.encrypted).toBe(true);
    expect(importedPlain!.encrypted).toBe(false);
  });
});
