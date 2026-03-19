import { renderHook, act } from '@testing-library/react-native';
import { usePagination } from '../usePagination';

const makeItems = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('usePagination', () => {
  it('returns first pageSize items initially', () => {
    const items = makeItems(50);
    const { result } = renderHook(() => usePagination(items, 15));
    expect(result.current.visiblePages).toHaveLength(15);
    expect(result.current.hasMore).toBe(true);
  });

  it('loadMore adds another page of items', () => {
    const items = makeItems(50);
    const { result } = renderHook(() => usePagination(items, 15));

    act(() => result.current.loadMore());
    expect(result.current.visiblePages).toHaveLength(30);
    expect(result.current.hasMore).toBe(true);
  });

  it('hasMore is false when all items are visible', () => {
    const items = makeItems(10);
    const { result } = renderHook(() => usePagination(items, 15));
    expect(result.current.visiblePages).toHaveLength(10);
    expect(result.current.hasMore).toBe(false);
  });

  it('reset returns to initial page size', () => {
    const items = makeItems(50);
    const { result } = renderHook(() => usePagination(items, 15));

    act(() => result.current.loadMore());
    act(() => result.current.loadMore());
    expect(result.current.visiblePages).toHaveLength(45);

    act(() => result.current.reset());
    expect(result.current.visiblePages).toHaveLength(15);
  });

  it('resets when items array reference changes', () => {
    let items = makeItems(50);
    const { result, rerender } = renderHook(({ data }) => usePagination(data, 15), {
      initialProps: { data: items },
    });

    act(() => result.current.loadMore());
    expect(result.current.visiblePages).toHaveLength(30);

    // New array reference (e.g. new filter applied)
    items = makeItems(40);
    rerender({ data: items });
    expect(result.current.visiblePages).toHaveLength(15);
  });
});
