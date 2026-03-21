import { useState, useMemo, useCallback } from 'react';
import type { Filter, PagePreview } from '@/data';

const EMPTY_FILTER: Filter = {
  query: '',
  properties: {
    tags: [],
    hasFile: false,
    hasImage: false,
    hasComments: false,
    hasLocation: false,
  },
};

function matchesFilter(page: PagePreview, filter: Filter): boolean {
  if (filter.query) {
    const q = filter.query.toLowerCase();
    const inText = page.searchText.includes(q);
    if (!inText) return false;
  }

  if (filter.properties.hasImage && !page.hasImage) return false;
  if (filter.properties.hasFile && !page.hasAttachment) return false;
  if (filter.properties.hasLocation && !page.hasLocation) return false;
  if (filter.properties.hasComments && !page.hasComments) return false;

  if (filter.properties.tags.length > 0) {
    const pageTags = new Set(page.tags.map((t) => t.toLowerCase()));
    for (const tag of filter.properties.tags) {
      if (!pageTags.has(tag.toLowerCase())) return false;
    }
  }

  if (filter.dateStart) {
    const start = new Date(filter.dateStart);
    start.setUTCHours(0, 0, 0, 0);
    if (new Date(page.date) < start) return false;
  }

  if (filter.dateEnd) {
    const end = new Date(filter.dateEnd);
    end.setUTCHours(23, 59, 59, 999);
    if (new Date(page.date) > end) return false;
  }

  return true;
}

export function useFilter(pages: PagePreview[]) {
  const [filter, setFilter] = useState<Filter>({ ...EMPTY_FILTER });

  const isActive =
    filter.query !== '' ||
    filter.properties.hasFile ||
    filter.properties.hasImage ||
    filter.properties.hasComments ||
    filter.properties.hasLocation ||
    filter.properties.tags.length > 0 ||
    !!filter.dateStart ||
    !!filter.dateEnd;

  const filteredPages = useMemo(() => {
    if (!isActive) return pages;
    return pages.filter((p) => matchesFilter(p, filter));
  }, [pages, filter, isActive]);

  const setQuery = useCallback((query: string) => {
    setFilter((prev) => ({ ...prev, query }));
  }, []);

  const setDateStart = useCallback((dateStart: string | undefined) => {
    setFilter((prev) => ({ ...prev, dateStart }));
  }, []);

  const setDateEnd = useCallback((dateEnd: string | undefined) => {
    setFilter((prev) => ({ ...prev, dateEnd }));
  }, []);

  const toggleProperty = useCallback(
    (prop: 'hasFile' | 'hasImage' | 'hasComments' | 'hasLocation') => {
      setFilter((prev) => ({
        ...prev,
        properties: { ...prev.properties, [prop]: !prev.properties[prop] },
      }));
    },
    [],
  );

  const toggleTag = useCallback((tag: string) => {
    setFilter((prev) => {
      const lower = tag.toLowerCase();
      const tags = prev.properties.tags.includes(lower)
        ? prev.properties.tags.filter((t) => t !== lower)
        : [...prev.properties.tags, lower];
      return { ...prev, properties: { ...prev.properties, tags } };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilter({
      query: '',
      properties: {
        tags: [],
        hasFile: false,
        hasImage: false,
        hasComments: false,
        hasLocation: false,
      },
    });
  }, []);

  return {
    filter,
    filteredPages,
    isActive,
    setQuery,
    setDateStart,
    setDateEnd,
    toggleProperty,
    toggleTag,
    clearFilters,
  };
}
