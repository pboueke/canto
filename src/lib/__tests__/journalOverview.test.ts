import { createPageCatalog, isPageCatalogV1 } from '../journal-overview';
import type { Page } from 'canto-data';

function makePage(id: string, tags: string[] = []): Page {
  return {
    id,
    text: 'entry',
    date: '2026-08-25T00:00:00Z',
    tags,
    files: [],
    images: [],
    comments: [],
    modified: 10,
    deleted: false,
  };
}

describe('PageCatalogV1 validation', () => {
  it('accepts a catalog derived from its page previews', () => {
    const catalog = createPageCatalog('journal-1', [makePage('p1', ['work'])]);
    expect(isPageCatalogV1(catalog, 'journal-1')).toBe(true);
  });

  it('rejects a digest, tag union, or modification summary inconsistent with previews', () => {
    const catalog = createPageCatalog('journal-1', [makePage('p1', ['work'])]);
    expect(isPageCatalogV1({ ...catalog, digest: 'stale' }, 'journal-1')).toBe(false);
    expect(isPageCatalogV1({ ...catalog, tags: ['wrong'] }, 'journal-1')).toBe(false);
    expect(isPageCatalogV1({ ...catalog, latestModified: 999 }, 'journal-1')).toBe(false);
  });

  it('rejects non-catalog values and incomplete catalog shapes before using previews', () => {
    expect(isPageCatalogV1(null, 'journal-1')).toBe(false);
    expect(isPageCatalogV1('not a catalog', 'journal-1')).toBe(false);
    expect(isPageCatalogV1({ version: 1, journalId: 'journal-1' }, 'journal-1')).toBe(false);
  });
});
