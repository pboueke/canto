import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

function haveSameItems<T>(
  previous: T[],
  next: T[],
  getItemKey?: (item: T) => string | number,
): boolean {
  return (
    previous.length === next.length &&
    previous.every((item, index) =>
      getItemKey ? getItemKey(item) === getItemKey(next[index]) : item === next[index],
    )
  );
}

export function usePagination<T>(
  items: T[],
  pageSize = 15,
  getItemKey?: (item: T) => string | number,
) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const prevRef = useRef(items);

  useEffect(() => {
    if (!haveSameItems(prevRef.current, items, getItemKey)) {
      setVisibleCount(pageSize);
    }
    prevRef.current = items;
  }, [items, pageSize, getItemKey]);

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
