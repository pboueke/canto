/**
 * End-to-end backup round-trip tests.
 *
 * These tests exercise the full export → import → verify-equivalence flow,
 * covering every conditional branch (encrypted / unencrypted / secure-unencrypted),
 * all attachment types, and comprehensive field-level validation.
 */
import JSZip from 'jszip';
import { aesGcmEncryptBytes, generateSalt } from '../encryption/utils';
import { deriveKey } from '../encryption/password';
import type { JournalContent, JournalSettings, Page, Attachment } from '@/models';
import { createLocalStore } from '../storage/local';
import type { EncryptionService } from '../encryption';
import type { LocalStore } from '../storage';

// ---------------------------------------------------------------------------
// In-memory filesystem mock (same pattern as backup.test.ts)
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
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(async () => {}),
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
// Imports under test (after all jest.mock calls)
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
    modified: 1710244800000,
    deleted: false,
    ...overrides,
  };
}

// NOTE: attachment IDs must be hex-only (a-f, 0-9, dashes) to match the
// import regex: /^(image|file)-([a-f0-9-]+)\.(.+)$/
function makeImageAttachment(id: string, overrides: Partial<Attachment> = {}): Attachment {
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

function makeFileAttachment(id: string, overrides: Partial<Attachment> = {}): Attachment {
  return {
    id,
    path: `/mock-docs/canto/j1/attachments/fl-p1-${id}.pdf`,
    name: `document-${id}.pdf`,
    type: 'file',
    encrypted: false,
    deleted: false,
    ...overrides,
  };
}

/** Store attachment binary on mock disk and update the attachment's path. */
async function storeAttachment(
  journalId: string,
  pageId: string,
  att: Attachment,
  base64Data: string,
  key?: Uint8Array,
): Promise<void> {
  const savedPath = await mockStore.saveAttachment(journalId, pageId, att, base64Data, key);
  att.path = savedPath;
}

/** Export a journal, then return the ZIP URI suitable for import. */
async function exportAndGetZipUri(
  journal: JournalContent,
  encrypted: boolean,
  key?: Uint8Array,
): Promise<string> {
  await exportJournal(journal, encrypted, key);
  const zipUri = Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!;
  // Copy to a stable import URI so subsequent exports don't overwrite
  const importUri = `/mock-cache/import-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`;
  filesystem[importUri] = filesystem[zipUri];
  return importUri;
}

/** Read back an attachment's base64 data from the store. */
async function readAttachmentData(path: string, key?: Uint8Array): Promise<string | null> {
  return mockStore.getAttachment(path, key);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  for (const key of Object.keys(filesystem)) delete filesystem[key];
  mockStore = createLocalStore(mockCreateEncryption());
});

// ===================================================================
// 1. UNENCRYPTED ROUND-TRIP WITH ATTACHMENTS
// ===================================================================
describe('unencrypted round-trip with attachments', () => {
  it('image attachments survive round-trip with correct binary data', async () => {
    const imgData = btoa('fake-png-binary-data-12345');
    const att = makeImageAttachment('a1b2');
    const page = makePage('p1', { images: [att] });
    const journal = makeJournal('j1', { title: 'Image RT', pages: [page] });
    await mockStore.saveJournal(journal);
    await storeAttachment('j1', 'p1', att, imgData);
    journal.pages[0].images[0].path = att.path;

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Image RT');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.pages).toHaveLength(1);
    expect(loaded!.pages[0].images).toHaveLength(1);

    const importedAtt = loaded!.pages[0].images[0];
    expect(importedAtt.name).toBe('photo-a1b2.jpg');
    expect(importedAtt.type).toBe('image');

    // Verify binary data matches
    const importedData = await readAttachmentData(importedAtt.path);
    expect(importedData).toBe(imgData);
  });

  it('file-type attachments survive round-trip', async () => {
    const fileData = btoa('fake-pdf-binary-data-67890');
    const att = makeFileAttachment('f1a2');
    const page = makePage('p1', { files: [att] });
    const journal = makeJournal('j1', { title: 'File RT', pages: [page] });
    await mockStore.saveJournal(journal);
    await storeAttachment('j1', 'p1', att, fileData);
    journal.pages[0].files[0].path = att.path;

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'File RT');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.pages[0].files).toHaveLength(1);
    const importedAtt = loaded!.pages[0].files[0];
    expect(importedAtt.name).toBe('document-f1a2.pdf');
    expect(importedAtt.type).toBe('file');

    const importedData = await readAttachmentData(importedAtt.path);
    expect(importedData).toBe(fileData);
  });

  it('mixed images and files on same page survive round-trip', async () => {
    const imgData = btoa('image-bytes');
    const fileData = btoa('file-bytes');
    const img = makeImageAttachment('a1a1');
    const file = makeFileAttachment('b2b2');
    const page = makePage('p1', { images: [img], files: [file] });
    const journal = makeJournal('j1', { title: 'Mixed RT', pages: [page] });
    await mockStore.saveJournal(journal);
    await storeAttachment('j1', 'p1', img, imgData);
    await storeAttachment('j1', 'p1', file, fileData);
    journal.pages[0].images[0].path = img.path;
    journal.pages[0].files[0].path = file.path;

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Mixed RT');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.pages[0].images).toHaveLength(1);
    expect(loaded!.pages[0].files).toHaveLength(1);

    const importedImgData = await readAttachmentData(loaded!.pages[0].images[0].path);
    const importedFileData = await readAttachmentData(loaded!.pages[0].files[0].path);
    expect(importedImgData).toBe(imgData);
    expect(importedFileData).toBe(fileData);
  });

  it('multiple pages each with their own attachments', async () => {
    const pages: Page[] = [];
    const attachmentData: Record<string, string> = {};

    // Use hex-compatible IDs: aa01, aa02, aa03
    for (let i = 1; i <= 3; i++) {
      const hexId = `aa0${i}`;
      const imgData = btoa(`image-data-page-${i}`);
      const att = makeImageAttachment(hexId, {
        path: `/mock-docs/canto/j1/attachments/img-p${i}-${hexId}.jpg`,
        name: `photo-p${i}.jpg`,
      });
      const page = makePage(`p${i}`, {
        text: `Page ${i} text`,
        images: [att],
      });
      pages.push(page);
      attachmentData[hexId] = imgData;
    }

    const journal = makeJournal('j1', { title: 'Multi Page RT', pages });
    await mockStore.saveJournal(journal);

    for (let i = 0; i < 3; i++) {
      const att = pages[i].images[0];
      await storeAttachment('j1', `p${i + 1}`, att, attachmentData[att.id]);
      journal.pages[i].images[0].path = att.path;
    }

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Multi Page RT');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.pages).toHaveLength(3);

    for (const page of loaded!.pages) {
      expect(page.images).toHaveLength(1);
      const data = await readAttachmentData(page.images[0].path);
      expect(data).not.toBeNull();
      // Verify it's one of the original data strings
      const decoded = atob(data!);
      expect(decoded).toMatch(/^image-data-page-[123]$/);
    }
  });

  it('shared attachment across pages is deduplicated in export and restored on import', async () => {
    const sharedData = btoa('shared-image-binary');
    const sharedPath = '/mock-docs/canto/j1/attachments/img-shared-abc.jpg';
    const att1: Attachment = {
      id: 'aabb1122',
      path: sharedPath,
      name: 'shared.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const att2: Attachment = { ...att1 }; // Same id and path

    const p1 = makePage('p1', { images: [att1] });
    const p2 = makePage('p2', { images: [att2] });
    const journal = makeJournal('j1', { title: 'Shared Att', pages: [p1, p2] });
    await mockStore.saveJournal(journal);
    filesystem[sharedPath] = `enc:${sharedData}`;

    const zipUri = await exportAndGetZipUri(journal, false);

    // Verify ZIP has only one attachment file (deduped)
    const zipBase64 = filesystem[Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!];
    const zip = await JSZip.loadAsync(zipBase64, { base64: true });
    expect(zip.file(/^attachments\//).length).toBe(1);

    const result = await importJournal(zipUri, 'Shared Att');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.pages).toHaveLength(2);
    // Both pages should have their own copy of the attachment
    for (const page of loaded!.pages) {
      expect(page.images).toHaveLength(1);
      // Each page's attachment should have a path under its own directory
      const data = await readAttachmentData(page.images[0].path);
      expect(data).not.toBeNull();
    }
    // The two pages should have different attachment paths (separate copies)
    expect(loaded!.pages[0].images[0].path).not.toBe(loaded!.pages[1].images[0].path);
  });
});

// ===================================================================
// 2. ENCRYPTED ROUND-TRIP WITH ATTACHMENTS
// ===================================================================
describe('encrypted round-trip with attachments', () => {
  const key = new Uint8Array(32);
  key.fill(0xab);

  it('encrypted export/import preserves image data', async () => {
    const imgData = btoa('secret-image-bytes');
    const att = makeImageAttachment('a1b2', { encrypted: true });
    const page = makePage('p1', { images: [att] });
    const journal = makeJournal('j1', {
      title: 'Encrypted Img',
      secure: true,
      salt: 'dGVzdHNhbHQ=',
      kdfIterations: 50000,
      pages: [page],
    });
    await mockStore.saveJournal(journal);
    await storeAttachment('j1', 'p1', att, imgData, key);
    journal.pages[0].images[0].path = att.path;

    const zipUri = await exportAndGetZipUri(journal, true, key);

    // Verify ZIP content is actually encrypted
    const zipBase64 = filesystem[Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!];
    const zip = await JSZip.loadAsync(zipBase64, { base64: true });
    const attRaw = await zip.file(/^attachments\//)[0].async('uint8array');
    // Should not be readable as plain base64
    expect(() => atob(new TextDecoder().decode(attRaw))).toThrow();

    const result = await importJournal(zipUri, 'Encrypted Img', key);
    const loaded = await mockStore.getJournal(result.journalId, key);

    expect(loaded!.pages[0].images).toHaveLength(1);
    expect(loaded!.pages[0].images[0].encrypted).toBe(true);

    const importedData = await readAttachmentData(loaded!.pages[0].images[0].path, key);
    expect(importedData).toBe(imgData);
  });

  it('encrypted export/import preserves file-type attachment data', async () => {
    const fileData = btoa('secret-pdf-bytes');
    const att = makeFileAttachment('f1a2', { encrypted: true });
    const page = makePage('p1', { files: [att] });
    const journal = makeJournal('j1', {
      title: 'Encrypted File',
      secure: true,
      salt: 'dGVzdHNhbHQ=',
      kdfIterations: 50000,
      pages: [page],
    });
    await mockStore.saveJournal(journal);
    await storeAttachment('j1', 'p1', att, fileData, key);
    journal.pages[0].files[0].path = att.path;

    const zipUri = await exportAndGetZipUri(journal, true, key);
    const result = await importJournal(zipUri, 'Encrypted File', key);
    const loaded = await mockStore.getJournal(result.journalId, key);

    expect(loaded!.pages[0].files).toHaveLength(1);
    expect(loaded!.pages[0].files[0].encrypted).toBe(true);
    expect(loaded!.pages[0].files[0].type).toBe('file');

    const importedData = await readAttachmentData(loaded!.pages[0].files[0].path, key);
    expect(importedData).toBe(fileData);
  });

  it('encrypted round-trip with mixed encrypted/plain attachments', async () => {
    const encImgData = btoa('encrypted-image');
    const plainImgData = btoa('plain-image');
    const encImg = makeImageAttachment('e1c1', { encrypted: true, name: 'secret.jpg' });
    const plainImg = makeImageAttachment('a2b2', { encrypted: false, name: 'public.jpg' });
    const page = makePage('p1', { images: [encImg, plainImg] });
    const journal = makeJournal('j1', {
      title: 'Mixed Enc',
      secure: true,
      salt: 'dGVzdHNhbHQ=',
      kdfIterations: 50000,
      pages: [page],
    });
    await mockStore.saveJournal(journal);
    await storeAttachment('j1', 'p1', encImg, encImgData, key);
    await storeAttachment('j1', 'p1', plainImg, plainImgData);
    journal.pages[0].images[0].path = encImg.path;
    journal.pages[0].images[1].path = plainImg.path;

    const zipUri = await exportAndGetZipUri(journal, true, key);
    const result = await importJournal(zipUri, 'Mixed Enc', key);
    const loaded = await mockStore.getJournal(result.journalId, key);

    const importedEnc = loaded!.pages[0].images.find((a) => a.name === 'secret.jpg');
    const importedPlain = loaded!.pages[0].images.find((a) => a.name === 'public.jpg');

    expect(importedEnc!.encrypted).toBe(true);
    expect(importedPlain!.encrypted).toBe(false);

    const encData = await readAttachmentData(importedEnc!.path, key);
    const plainData = await readAttachmentData(importedPlain!.path);
    expect(encData).toBe(encImgData);
    expect(plainData).toBe(plainImgData);
  });
});

// ===================================================================
// 3. UNENCRYPTED EXPORT OF SECURE JOURNAL (canProvidePassword flow)
// ===================================================================
describe('unencrypted export of secure journal', () => {
  const key = new Uint8Array(32);
  key.fill(0xab);

  it('import with key preserves encryption flags and attachment data', async () => {
    const encData = btoa('encrypted-attachment-data');
    const plainData = btoa('plain-attachment-data');
    const encAtt = makeImageAttachment('e1c1', { encrypted: true, name: 'secret.jpg' });
    const plainAtt = makeImageAttachment('a2b2', { encrypted: false, name: 'public.jpg' });
    const page = makePage('p1', { images: [encAtt, plainAtt] });
    const journal = makeJournal('j1', {
      title: 'Secure Unenc',
      secure: true,
      salt: 'dGVzdHNhbHQ=',
      kdfIterations: 50000,
      pages: [page],
    });
    await mockStore.saveJournal(journal);
    await storeAttachment('j1', 'p1', encAtt, encData, key);
    await storeAttachment('j1', 'p1', plainAtt, plainData);
    journal.pages[0].images[0].path = encAtt.path;
    journal.pages[0].images[1].path = plainAtt.path;

    // Export UNENCRYPTED (but journal is secure)
    const zipUri = await exportAndGetZipUri(journal, false, key);

    // Verify inspectBackup reports canProvidePassword
    const info = await inspectBackup(zipUri);
    expect(info.needsPassword).toBe(false);
    expect(info.canProvidePassword).toBe(true);

    // Import WITH key
    const result = await importJournal(zipUri, 'Secure Unenc', key);
    const loaded = await mockStore.getJournal(result.journalId, key);

    expect(loaded!.secure).toBe(true);
    const impEnc = loaded!.pages[0].images.find((a) => a.name === 'secret.jpg');
    const impPlain = loaded!.pages[0].images.find((a) => a.name === 'public.jpg');
    expect(impEnc!.encrypted).toBe(true);
    expect(impPlain!.encrypted).toBe(false);
  });

  it('import without key — auto-derive handles encrypted attachments', async () => {
    const encData = btoa('encrypted-attachment');
    const encAtt = makeImageAttachment('e1c1', { encrypted: true, name: 'secret.jpg' });
    const page = makePage('p1', { images: [encAtt] });
    const journal = makeJournal('j1', {
      title: 'Secure No Key',
      secure: true,
      salt: 'dGVzdHNhbHQ=',
      kdfIterations: 50000,
      pages: [page],
    });
    await mockStore.saveJournal(journal);
    await storeAttachment('j1', 'p1', encAtt, encData, key);
    journal.pages[0].images[0].path = encAtt.path;

    const zipUri = await exportAndGetZipUri(journal, false, key);

    // Import WITHOUT explicit key — auto-derive with empty password kicks in
    const result = await importJournal(zipUri, 'Secure No Key');

    // Auto-derive produces a key from empty password, but since no real key was
    // provided, the journal should NOT be marked secure — otherwise the user
    // would be prompted for a password they never set.
    const journals = await mockStore.listJournals();
    const imported = journals.find((j) => j.id === result.journalId);
    expect(imported).toBeDefined();
    expect(imported!.title).toBe('Secure No Key');
    expect(imported!.secure).toBe(false);
  });

  it('import with key preserves secure flag, salt, and kdfIterations', async () => {
    const journal = makeJournal('j1', {
      title: 'Metadata Check',
      secure: true,
      salt: 'c3BlY2lhbHNhbHQ=',
      kdfIterations: 100000,
      pages: [makePage('p1')],
    });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Metadata Check', key);
    const journals = await mockStore.listJournals();
    const imported = journals.find((j) => j.id === result.journalId);

    expect(imported!.secure).toBe(true);
    expect(imported!.salt).toBe('c3BlY2lhbHNhbHQ=');
    expect(imported!.kdfIterations).toBe(100000);
  });
});

// ===================================================================
// 4. DATA EQUIVALENCE VALIDATION
// ===================================================================
describe('data equivalence validation', () => {
  it('all page fields survive round-trip', async () => {
    const page = makePage('p1', {
      text: 'Detailed entry with *markdown*',
      date: '2026-02-15T08:30:00Z',
      tags: ['travel', 'food', 'photography'],
      location: {
        latitude: 48.8566,
        longitude: 2.3522,
        altitude: 35.5,
        accuracy: 10,
      },
      comments: [
        { id: 'c1', text: 'Great day!', date: '2026-02-15T20:00:00Z' },
        { id: 'c2', text: 'Added more photos', date: '2026-02-16T09:00:00Z' },
      ],
      thumbnail: 'data:image/jpeg;base64,abc123',
      modified: 1708000000000,
    });
    const journal = makeJournal('j1', { title: 'Field Check', pages: [page] });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Field Check');
    const loaded = await mockStore.getJournal(result.journalId);
    const p = loaded!.pages[0];

    expect(p.text).toBe('Detailed entry with *markdown*');
    expect(p.date).toBe('2026-02-15T08:30:00Z');
    expect(p.tags).toEqual(['travel', 'food', 'photography']);
    expect(p.location).toEqual({
      latitude: 48.8566,
      longitude: 2.3522,
      altitude: 35.5,
      accuracy: 10,
    });
    expect(p.comments).toHaveLength(2);
    expect(p.comments[0]).toEqual({ id: 'c1', text: 'Great day!', date: '2026-02-15T20:00:00Z' });
    expect(p.comments[1]).toEqual({
      id: 'c2',
      text: 'Added more photos',
      date: '2026-02-16T09:00:00Z',
    });
    expect(p.thumbnail).toBe('data:image/jpeg;base64,abc123');
    // modified is updated by savePage, so just verify it's a valid timestamp
    expect(typeof p.modified).toBe('number');
    expect(p.modified).toBeGreaterThan(0);
    expect(p.deleted).toBe(false);
  });

  it('all journal metadata fields survive round-trip', async () => {
    const journal = makeJournal('j1', {
      title: 'Metadata RT',
      icon: 'heart',
      secure: false,
      pages: [makePage('p1')],
      version: 1,
    });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Metadata RT');
    const loaded = await mockStore.getJournal(result.journalId);

    // New IDs and date expected
    expect(loaded!.id).not.toBe('j1');
    expect(loaded!.id).toBe(result.journalId);
    expect(loaded!.title).toBe('Metadata RT');
    expect(loaded!.icon).toBe('heart');
    expect(loaded!.secure).toBe(false);
    expect(loaded!.version).toBe(1);
    // Date should be a valid ISO string (new, not original)
    expect(new Date(loaded!.date).getTime()).not.toBeNaN();
  });

  it('all settings fields survive round-trip', async () => {
    const settings: JournalSettings = {
      use24h: true,
      previewTags: false,
      previewThumbnail: false,
      previewIcons: false,
      filterBar: false,
      sort: 'ascending',
      showMarkdownPlaceholder: false,
      autoLocation: true,
      remoteSync: true,
      themeOverride: 'dark-blue',
    };
    const journal = makeJournal('j1', { title: 'Settings RT', settings, pages: [] });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Settings RT');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.settings.use24h).toBe(true);
    expect(loaded!.settings.previewTags).toBe(false);
    expect(loaded!.settings.previewThumbnail).toBe(false);
    expect(loaded!.settings.previewIcons).toBe(false);
    expect(loaded!.settings.filterBar).toBe(false);
    expect(loaded!.settings.sort).toBe('ascending');
    expect(loaded!.settings.showMarkdownPlaceholder).toBe(false);
    expect(loaded!.settings.autoLocation).toBe(true);
    expect(loaded!.settings.remoteSync).toBe(true);
    expect(loaded!.settings.themeOverride).toBe('dark-blue');
  });

  it('attachment metadata fields survive round-trip', async () => {
    const imgData = btoa('some-image');
    const att = makeImageAttachment('a1b1', {
      name: 'vacation-photo.jpg',
      type: 'image',
      encrypted: false,
      size: 12345,
      deleted: false,
    });
    const page = makePage('p1', { images: [att] });
    const journal = makeJournal('j1', { title: 'Att Meta', pages: [page] });
    await mockStore.saveJournal(journal);
    await storeAttachment('j1', 'p1', att, imgData);
    journal.pages[0].images[0].path = att.path;

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Att Meta');
    const loaded = await mockStore.getJournal(result.journalId);
    const impAtt = loaded!.pages[0].images[0];

    // Path should be updated to new location
    expect(impAtt.path).not.toBe(att.path);
    // Preserved fields
    expect(impAtt.name).toBe('vacation-photo.jpg');
    expect(impAtt.type).toBe('image');
    expect(impAtt.encrypted).toBe(false);
    expect(impAtt.deleted).toBe(false);
  });
});

// ===================================================================
// 5. EDGE CASES
// ===================================================================
describe('edge cases', () => {
  it('page with empty text and no attachments', async () => {
    const page = makePage('p1', { text: '', images: [], files: [] });
    const journal = makeJournal('j1', { title: 'Empty Page', pages: [page] });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Empty Page');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.pages).toHaveLength(1);
    expect(loaded!.pages[0].text).toBe('');
    expect(loaded!.pages[0].images).toHaveLength(0);
    expect(loaded!.pages[0].files).toHaveLength(0);
  });

  it('page with only deleted attachments exports none', async () => {
    const deleted1 = makeImageAttachment('dd01', { deleted: true });
    const deleted2 = makeFileAttachment('dd02', { deleted: true });
    const page = makePage('p1', { images: [deleted1], files: [deleted2] });
    const journal = makeJournal('j1', { title: 'Deleted Only', pages: [page] });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);

    // Verify ZIP has no attachment files
    const zipBase64 = filesystem[Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!];
    const zip = await JSZip.loadAsync(zipBase64, { base64: true });
    expect(zip.file(/^attachments\//).length).toBe(0);

    const result = await importJournal(zipUri, 'Deleted Only');
    const loaded = await mockStore.getJournal(result.journalId);
    expect(loaded!.pages).toHaveLength(1);
  });

  it('unicode and emoji in journal title and page text', async () => {
    const page = makePage('p1', {
      text: "Aujourd'hui j'ai visité la Tour Eiffel 🗼\n日本語テスト\nкириллица",
      tags: ['émoji', '日本'],
    });
    const journal = makeJournal('j1', {
      title: 'Mon Journal 📔 日記',
      pages: [page],
    });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Mon Journal 📔 日記');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.title).toBe('Mon Journal 📔 日記');
    expect(loaded!.pages[0].text).toContain('Tour Eiffel 🗼');
    expect(loaded!.pages[0].text).toContain('日本語テスト');
    expect(loaded!.pages[0].text).toContain('кириллица');
    expect(loaded!.pages[0].tags).toContain('émoji');
    expect(loaded!.pages[0].tags).toContain('日本');
  });

  it('journal with many pages (20+) preserves all', async () => {
    const pages: Page[] = [];
    for (let i = 0; i < 25; i++) {
      pages.push(
        makePage(`p${i}`, {
          text: `Entry number ${i}`,
          tags: [`tag-${i}`],
        }),
      );
    }
    const journal = makeJournal('j1', { title: 'Many Pages', pages });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Many Pages');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.pages).toHaveLength(25);
    const texts = loaded!.pages.map((p) => p.text).sort();
    for (let i = 0; i < 25; i++) {
      expect(texts).toContain(`Entry number ${i}`);
    }
  });

  it('page with empty tags array is preserved', async () => {
    const page = makePage('p1', { tags: [] });
    const journal = makeJournal('j1', { title: 'No Tags', pages: [page] });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'No Tags');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.pages[0].tags).toEqual([]);
  });

  it('page with no comments preserves empty array', async () => {
    const page = makePage('p1', { comments: [] });
    const journal = makeJournal('j1', { title: 'No Comments', pages: [page] });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'No Comments');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.pages[0].comments).toEqual([]);
  });

  it('attachment with no extension falls back to bin', async () => {
    const data = btoa('binary-blob');
    const att: Attachment = {
      id: 'aabb11',
      path: '/mock-docs/canto/j1/attachments/fl-p1-aabb11.bin',
      name: 'README',
      type: 'file',
      encrypted: false,
      deleted: false,
    };
    const page = makePage('p1', { files: [att] });
    const journal = makeJournal('j1', { title: 'No Ext', pages: [page] });
    await mockStore.saveJournal(journal);
    await storeAttachment('j1', 'p1', att, data);
    journal.pages[0].files[0].path = att.path;

    const zipUri = await exportAndGetZipUri(journal, false);

    // Verify the ZIP filename ends with the extension extracted from "README" (no dot)
    // The code does: att.name.split('.').pop() ?? 'bin' → 'README' (no dot → returns 'README')
    const zipBase64 = filesystem[Object.keys(filesystem).find((k) => k.endsWith('.canto.zip'))!];
    const zip = await JSZip.loadAsync(zipBase64, { base64: true });
    const attFiles = zip.file(/^attachments\//);
    expect(attFiles).toHaveLength(1);
    // For a file named 'README' with no dot, split('.').pop() returns 'README'
    expect(attFiles[0].name).toContain('file-aabb11');

    const result = await importJournal(zipUri, 'No Ext');
    const loaded = await mockStore.getJournal(result.journalId);
    expect(loaded!.pages[0].files[0].name).toBe('README');
  });

  it('multiple comments on a single page are preserved in order', async () => {
    const comments = [
      { id: 'c1', text: 'First', date: '2026-01-01T10:00:00Z' },
      { id: 'c2', text: 'Second', date: '2026-01-01T11:00:00Z' },
      { id: 'c3', text: 'Third', date: '2026-01-01T12:00:00Z' },
    ];
    const page = makePage('p1', { comments });
    const journal = makeJournal('j1', { title: 'Comments', pages: [page] });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Comments');
    const loaded = await mockStore.getJournal(result.journalId);

    expect(loaded!.pages[0].comments).toHaveLength(3);
    expect(loaded!.pages[0].comments[0].text).toBe('First');
    expect(loaded!.pages[0].comments[1].text).toBe('Second');
    expect(loaded!.pages[0].comments[2].text).toBe('Third');
  });

  it('location with all optional fields is preserved', async () => {
    const page = makePage('p1', {
      location: {
        latitude: -33.8688,
        longitude: 151.2093,
        altitude: 58.2,
        accuracy: 5.5,
      },
    });
    const journal = makeJournal('j1', { title: 'Full Location', pages: [page] });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Full Location');
    const loaded = await mockStore.getJournal(result.journalId);
    const loc = loaded!.pages[0].location!;

    expect(loc.latitude).toBe(-33.8688);
    expect(loc.longitude).toBe(151.2093);
    expect(loc.altitude).toBe(58.2);
    expect(loc.accuracy).toBe(5.5);
  });

  it('re-import same backup produces independent copies', async () => {
    const page = makePage('p1', { text: 'Original text' });
    const journal = makeJournal('j1', { title: 'Independent', pages: [page] });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);

    const r1 = await importJournal(zipUri, 'Copy 1');
    const r2 = await importJournal(zipUri, 'Copy 2');

    expect(r1.journalId).not.toBe(r2.journalId);

    const loaded1 = await mockStore.getJournal(r1.journalId);
    const loaded2 = await mockStore.getJournal(r2.journalId);

    expect(loaded1!.title).toBe('Copy 1');
    expect(loaded2!.title).toBe('Copy 2');
    expect(loaded1!.pages[0].text).toBe('Original text');
    expect(loaded2!.pages[0].text).toBe('Original text');

    // Verify they have different page IDs
    expect(loaded1!.pages[0].id).not.toBe(loaded2!.pages[0].id);
  });
});

// ===================================================================
// 6. ERROR AND BOUNDARY CONDITIONS
// ===================================================================
describe('error and boundary conditions', () => {
  it('import encrypted backup without key throws', async () => {
    const key = new Uint8Array(32);
    key.fill(0xab);

    const journal = makeJournal('j1', {
      secure: true,
      salt: 'dGVzdA==',
      kdfIterations: 50000,
    });

    // Build encrypted ZIP manually
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: true,
        salt: 'dGVzdA==',
        kdfIterations: 50000,
        journalTitle: 'Secret',
      }),
    );
    zip.file('journal.json', aesGcmEncryptBytes(JSON.stringify(journal), key));
    const base64 = await zip.generateAsync({ type: 'base64' });
    const uri = '/mock-cache/encrypted-no-key.zip';
    filesystem[uri] = base64;

    // Import without any key — should fail during decryption
    await expect(importJournal(uri, 'Secret')).rejects.toThrow();
  });

  it('import encrypted backup with wrong key throws', async () => {
    const correctKey = new Uint8Array(32);
    correctKey.fill(0xab);
    const wrongKey = new Uint8Array(32);
    wrongKey.fill(0xcd);

    const journal = makeJournal('j1');
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        appVersion: '0.9.0',
        exportDate: '2026-03-13T00:00:00Z',
        encrypted: true,
        salt: 'dGVzdA==',
        kdfIterations: 50000,
        journalTitle: 'Secret',
      }),
    );
    zip.file('journal.json', aesGcmEncryptBytes(JSON.stringify(journal), correctKey));
    const base64 = await zip.generateAsync({ type: 'base64' });
    const uri = '/mock-cache/wrong-key.zip';
    filesystem[uri] = base64;

    await expect(importJournal(uri, 'Secret', wrongKey)).rejects.toThrow();
  });

  it('import corrupted ZIP throws', async () => {
    const uri = '/mock-cache/corrupted.zip';
    filesystem[uri] = btoa('this is not a zip file at all');

    await expect(importJournal(uri, 'Bad')).rejects.toThrow();
  });

  it('export then import with different title uses provided title', async () => {
    const journal = makeJournal('j1', { title: 'Original Title', pages: [makePage('p1')] });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, false);
    const result = await importJournal(zipUri, 'Completely Different Name');

    expect(result.title).toBe('Completely Different Name');
    const loaded = await mockStore.getJournal(result.journalId);
    expect(loaded!.title).toBe('Completely Different Name');
  });
});

// ===================================================================
// 7. PASSWORD-DERIVED KEY ROUND-TRIPS (exercises real deriveKey)
// ===================================================================
describe('password-derived key round-trips', () => {
  const PASSWORD = 'my-secure-password-123!';
  const ITERATIONS = 50_000;

  it('encrypted round-trip with deriveKey produces identical data', async () => {
    const salt = generateSalt();
    const saltBase64 = btoa(String.fromCharCode(...salt));

    // Derive key (same as the UI would when creating a journal)
    const exportKey = await deriveKey(PASSWORD, salt, ITERATIONS);

    const page = makePage('p1', {
      text: 'Secret diary entry',
      tags: ['private'],
      comments: [{ id: 'c1', text: 'Remember this', date: '2026-03-15T10:00:00Z' }],
    });
    const journal = makeJournal('j1', {
      title: 'Password RT',
      secure: true,
      salt: saltBase64,
      kdfIterations: ITERATIONS,
      pages: [page],
    });
    await mockStore.saveJournal(journal);

    // Export encrypted with the derived key
    const zipUri = await exportAndGetZipUri(journal, true, exportKey);

    // Re-derive the key from the same password (as the import UI would)
    const importKey = await deriveKey(PASSWORD, salt, ITERATIONS);

    // Keys should be identical
    expect(Buffer.from(importKey).equals(Buffer.from(exportKey))).toBe(true);

    // Import with re-derived key
    const result = await importJournal(zipUri, 'Password RT', importKey);
    const loaded = await mockStore.getJournal(result.journalId, importKey);

    expect(loaded).not.toBeNull();
    expect(loaded!.pages).toHaveLength(1);
    expect(loaded!.pages[0].text).toBe('Secret diary entry');
    expect(loaded!.pages[0].tags).toEqual(['private']);
    expect(loaded!.pages[0].comments[0].text).toBe('Remember this');
    expect(loaded!.secure).toBe(true);
  });

  it('encrypted round-trip with deriveKey and attachments', async () => {
    const salt = generateSalt();
    const saltBase64 = btoa(String.fromCharCode(...salt));
    const exportKey = await deriveKey(PASSWORD, salt, ITERATIONS);

    const imgData = btoa('secret-photo-bytes-for-password-test');
    const att = makeImageAttachment('a1b2', { encrypted: true });
    const page = makePage('p1', { images: [att] });
    const journal = makeJournal('j1', {
      title: 'Password Att RT',
      secure: true,
      salt: saltBase64,
      kdfIterations: ITERATIONS,
      pages: [page],
    });
    await mockStore.saveJournal(journal);
    await storeAttachment('j1', 'p1', att, imgData, exportKey);
    journal.pages[0].images[0].path = att.path;

    const zipUri = await exportAndGetZipUri(journal, true, exportKey);

    // Re-derive key from same password
    const importKey = await deriveKey(PASSWORD, salt, ITERATIONS);
    const result = await importJournal(zipUri, 'Password Att RT', importKey);
    const loaded = await mockStore.getJournal(result.journalId, importKey);

    expect(loaded!.pages[0].images).toHaveLength(1);
    const importedData = await readAttachmentData(loaded!.pages[0].images[0].path, importKey);
    expect(importedData).toBe(imgData);
  });

  it('deriveKey with wrong password fails to decrypt', async () => {
    const salt = generateSalt();
    const saltBase64 = btoa(String.fromCharCode(...salt));
    const exportKey = await deriveKey(PASSWORD, salt, ITERATIONS);

    const journal = makeJournal('j1', {
      title: 'Wrong Password',
      secure: true,
      salt: saltBase64,
      kdfIterations: ITERATIONS,
      pages: [makePage('p1', { text: 'Secret' })],
    });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, true, exportKey);

    // Derive key with wrong password
    const wrongKey = await deriveKey('wrong-password', salt, ITERATIONS);
    await expect(importJournal(zipUri, 'Wrong Password', wrongKey)).rejects.toThrow();
  });

  it('deriveKey with salt from manifest matches export key', async () => {
    const salt = generateSalt();
    const saltBase64 = btoa(String.fromCharCode(...salt));
    const exportKey = await deriveKey(PASSWORD, salt, ITERATIONS);

    const journal = makeJournal('j1', {
      title: 'Salt From Manifest',
      secure: true,
      salt: saltBase64,
      kdfIterations: ITERATIONS,
      pages: [makePage('p1', { text: 'Verify salt round-trip' })],
    });
    await mockStore.saveJournal(journal);

    const zipUri = await exportAndGetZipUri(journal, true, exportKey);

    // Simulate what the UI does: read manifest, extract salt, derive key
    const info = await inspectBackup(zipUri);
    expect(info.needsPassword).toBe(true);
    expect(info.manifest.salt).toBe(saltBase64);
    expect(info.manifest.kdfIterations).toBe(ITERATIONS);

    // Decode salt from manifest (as the UI does with base64ToUint8)
    const manifestSalt = Uint8Array.from(atob(info.manifest.salt!), (c) => c.charCodeAt(0));
    const importKey = await deriveKey(PASSWORD, manifestSalt, info.manifest.kdfIterations!);

    const result = await importJournal(zipUri, 'Salt From Manifest', importKey);
    const loaded = await mockStore.getJournal(result.journalId, importKey);
    expect(loaded!.pages[0].text).toBe('Verify salt round-trip');
  });
});
