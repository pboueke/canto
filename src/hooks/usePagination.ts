import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

export function usePagination<T>(items: T[], pageSize = 15) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const prevRef = useRef(items);

  useEffect(() => {
    if (prevRef.current !== items) {
      prevRef.current = items;
      setVisibleCount(pageSize);
    }
  }, [items, pageSize]);

  const visiblePages = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  const hasMore = visibleCount < items.length;

  const loadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount((prev) => prev + pageSize);
    }
  }, [hasMore, pageSize]);

  const reset = useCallback(() => {
    setVisibleCount(pageSize);
  }, [pageSize]);

  return { visiblePages, loadMore, hasMore, reset };
}
