import { renderHook, act } from '@testing-library/react-native';
import { useFilter } from '../useFilter';
import type { PagePreview } from '@/data';

function makePreview(overrides: Partial<PagePreview> = {}): PagePreview {
  return {
    id: 'p1',
    date: '2026-03-12T10:00:00Z',
    previewText: 'Hello world',
    tags: [],
    hasImage: false,
    hasAttachment: false,
    hasLocation: false,
    hasComments: false,
    ...overrides,
  };
}

const PAGES: PagePreview[] = [
  makePreview({
    id: 'p1',
    previewText: 'Morning run',
    tags: ['fitness', 'health'],
    hasImage: true,
    date: '2026-03-10T08:00:00Z',
  }),
  makePreview({
    id: 'p2',
    previewText: 'Work meeting notes',
    tags: ['work'],
    hasAttachment: true,
    date: '2026-03-11T14:00:00Z',
  }),
  makePreview({
    id: 'p3',
    previewText: 'Evening walk',
    tags: ['fitness'],
    hasLocation: true,
    date: '2026-03-12T18:00:00Z',
  }),
  makePreview({
    id: 'p4',
    previewText: 'Recipe for pasta',
    tags: ['cooking'],
    hasComments: true,
    date: '2026-03-13T12:00:00Z',
  }),
];

describe('useFilter', () => {
  it('returns all pages when no filters active', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    expect(result.current.filteredPages).toHaveLength(4);
    expect(result.current.isActive).toBe(false);
  });

  it('filters by text query', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => result.current.setQuery('morning'));
    expect(result.current.filteredPages).toHaveLength(1);
    expect(result.current.filteredPages[0].id).toBe('p1');
    expect(result.current.isActive).toBe(true);
  });

  it('text query is case-insensitive', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => result.current.setQuery('WORK'));
    expect(result.current.filteredPages).toHaveLength(1);
    expect(result.current.filteredPages[0].id).toBe('p2');
  });

  it('filters by hasImage property', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => result.current.toggleProperty('hasImage'));
    expect(result.current.filteredPages).toHaveLength(1);
    expect(result.current.filteredPages[0].id).toBe('p1');
  });

  it('filters by hasAttachment property', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => result.current.toggleProperty('hasFile'));
    expect(result.current.filteredPages).toHaveLength(1);
    expect(result.current.filteredPages[0].id).toBe('p2');
  });

  it('filters by hasLocation property', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => result.current.toggleProperty('hasLocation'));
    expect(result.current.filteredPages).toHaveLength(1);
    expect(result.current.filteredPages[0].id).toBe('p3');
  });

  it('filters by hasComments property', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => result.current.toggleProperty('hasComments'));
    expect(result.current.filteredPages).toHaveLength(1);
    expect(result.current.filteredPages[0].id).toBe('p4');
  });

  it('filters by single tag', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => result.current.toggleTag('fitness'));
    expect(result.current.filteredPages).toHaveLength(2);
    expect(result.current.filteredPages.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('filters by multiple tags (AND logic)', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => {
      result.current.toggleTag('fitness');
      result.current.toggleTag('health');
    });
    expect(result.current.filteredPages).toHaveLength(1);
    expect(result.current.filteredPages[0].id).toBe('p1');
  });

  it('toggle tag off removes it from filter', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => result.current.toggleTag('fitness'));
    expect(result.current.filteredPages).toHaveLength(2);
    act(() => result.current.toggleTag('fitness'));
    expect(result.current.filteredPages).toHaveLength(4);
    expect(result.current.isActive).toBe(false);
  });

  it('filters by date range start', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => result.current.setDateStart('2026-03-12T00:00:00Z'));
    expect(result.current.filteredPages).toHaveLength(2);
    expect(result.current.filteredPages.map((p) => p.id)).toEqual(['p3', 'p4']);
  });

  it('filters by date range end (inclusive of entire day)', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    // dateEnd on March 11 should include everything up to end of March 11 UTC
    act(() => result.current.setDateEnd('2026-03-11T00:00:00Z'));
    expect(result.current.filteredPages.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('filters by date range start and end', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => {
      // March 11 to March 12 inclusive
      result.current.setDateStart('2026-03-11T00:00:00Z');
      result.current.setDateEnd('2026-03-12T00:00:00Z');
    });
    expect(result.current.filteredPages.map((p) => p.id)).toEqual(['p2', 'p3']);
  });

  it('combines multiple filter types with AND logic', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => {
      result.current.toggleTag('fitness');
      result.current.setQuery('evening');
    });
    expect(result.current.filteredPages).toHaveLength(1);
    expect(result.current.filteredPages[0].id).toBe('p3');
  });

  it('clearFilters resets all filters', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => {
      result.current.setQuery('morning');
      result.current.toggleProperty('hasImage');
      result.current.toggleTag('fitness');
      result.current.setDateStart('2026-03-10T00:00:00Z');
    });
    expect(result.current.isActive).toBe(true);
    act(() => result.current.clearFilters());
    expect(result.current.isActive).toBe(false);
    expect(result.current.filteredPages).toHaveLength(4);
  });

  it('returns empty array when no pages match', () => {
    const { result } = renderHook(() => useFilter(PAGES));
    act(() => result.current.setQuery('nonexistent'));
    expect(result.current.filteredPages).toHaveLength(0);
  });
});
