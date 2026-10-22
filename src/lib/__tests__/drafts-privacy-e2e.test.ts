/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * End-to-end: encrypted unsaved drafts never leave the device.
 *
 * A real native LocalStore holds a saved page and an unsaved draft. The draft
 * must be absent from a full export archive, from a journal imported from that
 * archive, and from every file a Google Drive sync uploads. Password changes
 * refuse while a draft exists instead of losing it.
 */
import JSZip from 'jszip';
import type { JournalContent, Page } from 'canto-data';
import type { EncryptionService } from '../encryption';
import type { LocalStore } from '../storage';
import { createLocalStore } from '../storage/local';
import { DraftsPendingError } from '../storage/integrity';

const filesystem: Record<string, string> = {};

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').pop() ?? '';
    }
    get exists() {
      return this.uri in filesystem;
    }
    get size() {
      return Buffer.byteLength(filesystem[this.uri] ?? '', 'utf8');
    }
    create() {
      if (!(this.uri in filesystem)) filesystem[this.uri] = '';
    }
    write(content: string | Uint8Array) {
      filesystem[this.uri] =
        content instanceof Uint8Array ? Buffer.from(content).toString('base64') : content;
    }
    text() {
      return Promise.resolve(filesystem[this.uri] ?? '');
    }
    bytes() {
      return Promise.resolve(new Uint8Array(Buffer.from(filesystem[this.uri] ?? '', 'base64')));
    }
    delete() {
      delete filesystem[this.uri];
    }
    move(target: any) {
      filesystem[target.uri] = filesystem[this.uri];
      delete filesystem[this.uri];
    }
  }
  class MockDirectory {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').pop() ?? '';
    }
    get exists() {
      return Object.keys(filesystem).some((key) => key.startsWith(`${this.uri}/`));
    }
    create() {}
    list() {
      const prefix = `${this.uri}/`;
      const out: any[] = [];
      const seen = new Set<string>();
      for (const key of Object.keys(filesystem)) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest.includes('/')) out.push(new MockFile(key));
        else {
          const dir = prefix + rest.split('/')[0];
          if (!seen.has(dir)) {
            seen.add(dir);
            out.push(new MockDirectory(dir));
          }
        }
      }
      return out;
    }
    delete() {
      for (const key of Object.keys(filesystem)) {
        if (key.startsWith(`${this.uri}/`)) delete filesystem[key];
      }
    }
  }
  return {
    Paths: { document: { uri: '/mock-docs' }, cache: { uri: '/mock-cache' } },
    File: MockFile,
    Directory: MockDirectory,
  };
});

jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => {}) }));
jest.mock('../sync/gdrive/api');
// Readable payloads: the assertions search every stored and uploaded byte for
// draft text, so the password layer is a passthrough in this suite.
jest.mock('../encryption/utils', () => ({
  ...jest.requireActual('../encryption/utils'),
  aesGcmEncrypt: jest.fn((plaintext: string) => Promise.resolve(plaintext)),
  aesGcmDecrypt: jest.fn((ciphertext: string) => Promise.resolve(ciphertext)),
}));

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

import { exportJournal } from '../backup/export';
import { importJournal } from '../backup/import';
import { SyncEngine } from '../sync/engine';
import { GDriveRemoteStore } from '../sync/gdrive/store';
import * as api from '../sync/gdrive/api';
import { InMemoryDrive } from './helpers/in-memory-drive';

const DRAFT_TEXT = 'DRAFT-ONLY unsent words';
const SAVED_TEXT = 'saved and shareable words';

function journal(id: string, pages: Page[]): JournalContent {
  return {
    id,
    title: `Journal ${id}`,
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
      syncProvider: 'gdrive',
    },
    version: 1,
  } as JournalContent;
}

function page(id: string, text: string, modified = 1000): Page {
  return {
    id,
    text,
    date: '2026-03-12T10:00:00Z',
    tags: [],
    files: [],
    images: [],
    comments: [],
    modified,
    deleted: false,
  };
}

async function seedJournalWithDraft(): Promise<void> {
  await mockStore.saveJournal(journal('j1', [page('p1', SAVED_TEXT)]));
  await mockStore.saveDraft!('j1', page('p1', DRAFT_TEXT));
  // The draft is really on disk, beside the saved page.
  expect(Object.values(filesystem).some((value) => value.includes(DRAFT_TEXT))).toBe(true);
}

beforeEach(() => {
  for (const key of Object.keys(filesystem)) delete filesystem[key];
  mockStore = createLocalStore(mockCreateEncryption());
});

describe('drafts never leave the device (e2e)', () => {
  it('a full export archive and the journal imported from it contain no draft', async () => {
    await seedJournalWithDraft();

    await exportJournal((await mockStore.getJournal('j1'))!, false);
    const zipUri = Object.keys(filesystem).find((key) => key.endsWith('.canto.zip'))!;
    const zip = await JSZip.loadAsync(Buffer.from(filesystem[zipUri], 'base64'));
    const entries = await Promise.all(
      Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map((entry) => entry.async('string')),
    );
    expect(entries.some((content) => content.includes(SAVED_TEXT))).toBe(true);
    expect(entries.some((content) => content.includes(DRAFT_TEXT))).toBe(false);
    expect(Object.keys(zip.files).some((name) => name.includes('draft'))).toBe(false);

    const importUri = '/mock-cache/import.canto.zip';
    filesystem[importUri] = filesystem[zipUri];
    const imported = await importJournal(importUri, 'Imported');
    expect(await mockStore.listDrafts!(imported.journalId)).toEqual([]);
    const importedPages = (await mockStore.getJournal(imported.journalId))!.pages;
    expect(importedPages.map((entry) => entry.text)).toEqual([SAVED_TEXT]);
  });

  it('a Google Drive sync uploads the saved page and never the draft', async () => {
    const mockedApi = api as jest.Mocked<typeof api>;
    const drive = new InMemoryDrive(mockedApi);
    drive.setup();
    const remote = new GDriveRemoteStore();
    await remote.connect({ accessToken: 'test-token' });
    await seedJournalWithDraft();

    const result = await new SyncEngine(mockStore, remote).sync('j1', new Uint8Array(32).fill(1));

    expect(result.uploaded).toEqual(['p1']);
    const uploaded = [...(drive as any).files.values()].map((file: any) =>
      typeof file.content === 'string' ? file.content : JSON.stringify(file.content ?? ''),
    );
    expect(uploaded.some((content: string) => content.includes(SAVED_TEXT))).toBe(true);
    expect(uploaded.some((content: string) => content.includes(DRAFT_TEXT))).toBe(false);
    // The draft is still waiting locally for the user.
    expect((await mockStore.getDraft!('j1', 'p1'))!.text).toBe(DRAFT_TEXT);
  });

  it('a password change refuses while a draft exists, then proceeds once it is resolved', async () => {
    await seedJournalWithDraft();
    const before = { ...filesystem };
    const full = (await mockStore.getJournal('j1'))!;
    const newKey = new Uint8Array(32).fill(3);

    await expect(mockStore.reencryptJournal(full, undefined, newKey)).rejects.toBeInstanceOf(
      DraftsPendingError,
    );
    expect(filesystem).toEqual(before);

    await mockStore.deleteDraft!('j1', 'p1');
    await mockStore.reencryptJournal({ ...full, secure: true }, undefined, newKey);
    expect((await mockStore.getJournal('j1', newKey))!.pages[0].text).toBe(SAVED_TEXT);
  });

  it('a deletion synced from another device keeps the local unsaved draft', async () => {
    await seedJournalWithDraft();
    // What SyncEngine does for a page deleted remotely.
    await mockStore.deletePage('j1', 'p1');
    expect((await mockStore.getDraft!('j1', 'p1'))!.text).toBe(DRAFT_TEXT);
    expect(await mockStore.listDrafts!('j1')).toEqual(['p1']);
  });
});
