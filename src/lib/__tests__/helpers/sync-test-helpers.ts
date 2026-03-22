/**
 * Shared test helpers for sync e2e tests.
 */
import type { Page, Attachment, JournalContent } from 'canto-data';
import type { LocalStore } from '../../storage/types';

// ---------- factories ----------

export const makePage = (
  id: string,
  modified: number,
  deleted = false,
  images: Attachment[] = [],
  text?: string,
): Page => ({
  id,
  text: text ?? `Page ${id} content`,
  date: '2026-03-12T10:00:00Z',
  tags: ['test'],
  files: [],
  images,
  comments: [],
  modified,
  deleted,
});

export const makeAttachment = (id: string, path: string): Attachment => ({
  id,
  path,
  name: `${id}.png`,
  type: 'image',
  encrypted: false,
  deleted: false,
});

export const makeJournal = (
  pages: Page[],
  secure = false,
  salt?: string,
  overrides?: Partial<JournalContent>,
): JournalContent => ({
  id: 'j1',
  title: 'My Journal',
  icon: 'book',
  date: '2026-01-01T00:00:00Z',
  secure,
  salt: salt ?? 'dGVzdHNhbHQ=',
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
    syncProvider: 'gdrive',
    autoSync: false,
  },
  version: 1,
  ...overrides,
});

// ---------- mock local store ----------

export function createMockLocalStore(journal: JournalContent | null): LocalStore {
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

// ---------- assertions ----------

/**
 * Deep equality check for pages, ignoring platform-specific attachment path formats.
 * Compares all fields except attachment paths (which differ between native/web).
 */
export function assertPagesEqual(a: Page, b: Page): void {
  expect(a.id).toBe(b.id);
  expect(a.text).toBe(b.text);
  expect(a.date).toBe(b.date);
  expect(a.tags).toEqual(b.tags);
  expect(a.modified).toBe(b.modified);
  expect(a.deleted).toBe(b.deleted);
  expect(a.comments).toEqual(b.comments);
  // Check attachment count and content (but not paths)
  expect(a.images.length).toBe(b.images.length);
  for (let i = 0; i < a.images.length; i++) {
    expect(a.images[i].id).toBe(b.images[i].id);
    expect(a.images[i].name).toBe(b.images[i].name);
    expect(a.images[i].type).toBe(b.images[i].type);
    expect(a.images[i].encrypted).toBe(b.images[i].encrypted);
    expect(a.images[i].deleted).toBe(b.images[i].deleted);
  }
  expect(a.files.length).toBe(b.files.length);
  for (let i = 0; i < a.files.length; i++) {
    expect(a.files[i].id).toBe(b.files[i].id);
    expect(a.files[i].name).toBe(b.files[i].name);
    expect(a.files[i].type).toBe(b.files[i].type);
  }
}

/**
 * Check journal content equality ignoring attachment paths and page order.
 */
export function assertJournalContentEqual(a: JournalContent, b: JournalContent): void {
  expect(a.id).toBe(b.id);
  expect(a.title).toBe(b.title);
  expect(a.icon).toBe(b.icon);
  expect(a.secure).toBe(b.secure);
  expect(a.salt).toBe(b.salt);
  expect(a.settings).toEqual(b.settings);
  expect(a.version).toBe(b.version);

  const sortedA = [...a.pages].sort((x, y) => x.id.localeCompare(y.id));
  const sortedB = [...b.pages].sort((x, y) => x.id.localeCompare(y.id));
  expect(sortedA.length).toBe(sortedB.length);
  for (let i = 0; i < sortedA.length; i++) {
    assertPagesEqual(sortedA[i], sortedB[i]);
  }
}
