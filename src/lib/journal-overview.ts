import type { JournalContent, Page } from 'canto-data';
import { pageToListPreview, type ListPagePreview } from './pagePreview';

export interface PageCatalogV1 {
  version: 1;
  journalId: string;
  pages: ListPagePreview[];
  tags: string[];
  latestModified: number;
  pageCount: number;
  digest: string;
}

export interface JournalOverview {
  metadata: Omit<JournalContent, 'pages'>;
  pages: ListPagePreview[];
  tags: string[];
  latestModified: number;
}

export function catalogDigest(pages: readonly Page[]): string {
  return pages
    .map((page) => `${page.id}:${page.modified}:${page.deleted ? 1 : 0}`)
    .sort()
    .join('|');
}

export function createPageCatalog(journalId: string, pages: readonly Page[]): PageCatalogV1 {
  return createPageCatalogFromPreviews(journalId, pages.map(pageToListPreview));
}

export function createPageCatalogFromPreviews(
  journalId: string,
  previews: readonly ListPagePreview[],
): PageCatalogV1 {
  const tags = [
    ...new Set(previews.filter((page) => !page.deleted).flatMap((page) => page.tags)),
  ].sort();
  return {
    version: 1,
    journalId,
    pages: [...previews],
    tags,
    latestModified: previews.reduce((latest, page) => Math.max(latest, page.modified ?? 0), 0),
    pageCount: previews.length,
    digest: previews
      .map((page) => `${page.id}:${page.modified ?? 0}:${page.deleted ? 1 : 0}`)
      .sort()
      .join('|'),
  };
}

/** Replace exactly one catalog projection without opening unrelated page files. */
export function withCatalogPage(catalog: PageCatalogV1, page: Page): PageCatalogV1 {
  const preview = pageToListPreview(page);
  const index = catalog.pages.findIndex((candidate) => candidate.id === page.id);
  const pages = [...catalog.pages];
  if (index >= 0) pages[index] = preview;
  else pages.push(preview);
  return createPageCatalogFromPreviews(catalog.journalId, pages);
}

export function catalogToOverview(
  metadata: Omit<JournalContent, 'pages'>,
  catalog: PageCatalogV1,
): JournalOverview {
  return {
    metadata,
    pages: catalog.pages,
    tags: catalog.tags,
    latestModified: catalog.latestModified,
  };
}

export function isPageCatalogV1(value: unknown, journalId: string): value is PageCatalogV1 {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<PageCatalogV1>;
  const hasShape =
    catalog.version === 1 &&
    catalog.journalId === journalId &&
    Array.isArray(catalog.pages) &&
    Array.isArray(catalog.tags) &&
    typeof catalog.latestModified === 'number' &&
    typeof catalog.pageCount === 'number' &&
    typeof catalog.digest === 'string';
  if (!hasShape) return false;

  // The catalog is rebuildable but must never be trusted as a source of
  // previews/tags if its own revision digest is inconsistent. This validates
  // corruption without reading every authoritative page file.
  const pages = catalog.pages as ListPagePreview[];
  const tags = catalog.tags as string[];
  const rebuilt = createPageCatalogFromPreviews(journalId, pages);
  return (
    catalog.pageCount === rebuilt.pageCount &&
    catalog.digest === rebuilt.digest &&
    catalog.latestModified === rebuilt.latestModified &&
    tags.length === rebuilt.tags.length &&
    tags.every((tag, index) => tag === rebuilt.tags[index])
  );
}
