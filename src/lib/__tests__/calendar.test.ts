import { getAnniversaryPages, getMonthsWithPages, monthRange } from '../calendar';
import type { PagePreview } from 'canto-data';

function makePreview(overrides: Partial<PagePreview> & { id: string; date: string }): PagePreview {
  return {
    previewText: overrides.previewText ?? '',
    searchText: overrides.searchText ?? '',
    tags: overrides.tags ?? [],
    hasImage: false,
    hasAttachment: false,
    hasLocation: false,
    hasComments: false,
    ...overrides,
  };
}

describe('getAnniversaryPages', () => {
  it('returns prior-year pages with same UTC month and day', () => {
    const today = new Date('2026-04-14T12:00:00Z');
    const pages = [
      makePreview({ id: 'a', date: '2025-04-14T08:00:00Z' }),
      makePreview({ id: 'b', date: '2024-04-14T22:00:00Z' }),
      makePreview({ id: 'c', date: '2025-04-13T08:00:00Z' }),
      makePreview({ id: 'd', date: '2025-05-14T08:00:00Z' }),
    ];
    const result = getAnniversaryPages(pages, today);
    expect(result.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('excludes current-year matches (no self-anniversary)', () => {
    const today = new Date('2026-04-14T12:00:00Z');
    const pages = [
      makePreview({ id: 'self', date: '2026-04-14T00:00:01Z' }),
      makePreview({ id: 'old', date: '2025-04-14T00:00:01Z' }),
    ];
    const result = getAnniversaryPages(pages, today);
    expect(result.map((p) => p.id)).toEqual(['old']);
  });

  it('compares by UTC day, not timestamp — 23:59:59 still matches the UTC day', () => {
    const today = new Date('2026-04-14T00:00:01Z');
    const pages = [makePreview({ id: 'late', date: '2025-04-14T23:59:59Z' })];
    const result = getAnniversaryPages(pages, today);
    expect(result.map((p) => p.id)).toEqual(['late']);
  });

  it('Feb-29 edge: surfaces only on Feb-29 leap days', () => {
    const leap = new Date('2024-02-29T12:00:00Z');
    const pages = [
      makePreview({ id: 'leap', date: '2020-02-29T10:00:00Z' }),
      makePreview({ id: 'feb28', date: '2023-02-28T10:00:00Z' }),
    ];
    expect(getAnniversaryPages(pages, leap).map((p) => p.id)).toEqual(['leap']);

    const nonLeap = new Date('2025-02-28T12:00:00Z');
    expect(getAnniversaryPages(pages, nonLeap).map((p) => p.id)).toEqual(['feb28']);
  });

  it('timezone-offset page date is interpreted as its UTC-day', () => {
    // 2025-04-14T00:30:00+05:00 === 2025-04-13T19:30:00Z (UTC day 13)
    const today = new Date('2026-04-13T12:00:00Z');
    const pages = [makePreview({ id: 'tz', date: '2025-04-14T00:30:00+05:00' })];
    const result = getAnniversaryPages(pages, today);
    expect(result.map((p) => p.id)).toEqual(['tz']);
  });

  it('empty input returns []', () => {
    expect(getAnniversaryPages([], new Date('2026-04-14T00:00:00Z'))).toEqual([]);
  });

  it('ignores pages with malformed dates and does not throw', () => {
    const today = new Date('2026-04-14T12:00:00Z');
    const pages = [
      makePreview({ id: 'bad', date: 'not-a-date' }),
      makePreview({ id: 'good', date: '2025-04-14T00:00:00Z' }),
    ];
    expect(getAnniversaryPages(pages, today).map((p) => p.id)).toEqual(['good']);
  });
});

describe('getMonthsWithPages', () => {
  const pages = [
    makePreview({ id: 'a', date: '2025-01-05T10:00:00Z' }),
    makePreview({ id: 'b', date: '2025-01-20T10:00:00Z' }),
    makePreview({ id: 'b2', date: '2025-01-20T23:00:00Z' }),
    makePreview({ id: 'c', date: '2024-12-31T10:00:00Z' }),
    makePreview({ id: 'd', date: '2025-04-14T10:00:00Z' }),
  ];

  it('returns one entry per (year, month) with pages', () => {
    const result = getMonthsWithPages(pages);
    expect(result).toHaveLength(3);
  });

  it('collapses multiple pages on the same day into a single day entry', () => {
    const result = getMonthsWithPages(pages);
    const jan = result.find((m) => m.year === 2025 && m.month === 0)!;
    expect(jan.daysWithPages.has(20)).toBe(true);
    expect(jan.daysWithPages.has(5)).toBe(true);
    expect(jan.daysWithPages.size).toBe(2);
  });

  it('descending is the default sort — newest month first', () => {
    const result = getMonthsWithPages(pages);
    expect(result.map((m) => `${m.year}-${m.month}`)).toEqual(['2025-3', '2025-0', '2024-11']);
  });

  it('ascending sort returns oldest month first', () => {
    const result = getMonthsWithPages(pages, 'ascending');
    expect(result.map((m) => `${m.year}-${m.month}`)).toEqual(['2024-11', '2025-0', '2025-3']);
  });

  it("sort: 'none' preserves insertion order (encounter order from input)", () => {
    const result = getMonthsWithPages(pages, 'none');
    expect(result.map((m) => `${m.year}-${m.month}`)).toEqual(['2025-0', '2024-11', '2025-3']);
  });

  it('cross-year months are distinct entries', () => {
    const result = getMonthsWithPages(pages);
    const dec = result.find((m) => m.year === 2024 && m.month === 11);
    const jan = result.find((m) => m.year === 2025 && m.month === 0);
    expect(dec).toBeDefined();
    expect(jan).toBeDefined();
  });

  it('ignores malformed dates', () => {
    const bad = [...pages, makePreview({ id: 'bad', date: 'garbage' })];
    const result = getMonthsWithPages(bad);
    expect(result).toHaveLength(3);
  });

  it('empty input returns []', () => {
    expect(getMonthsWithPages([])).toEqual([]);
  });
});

describe('monthRange', () => {
  it('January: full-month UTC range', () => {
    const r = monthRange(2026, 0);
    expect(r.start).toBe('2026-01-01T00:00:00.000Z');
    expect(r.end).toBe('2026-01-31T23:59:59.999Z');
  });

  it('December: full-month UTC range', () => {
    const r = monthRange(2026, 11);
    expect(r.start).toBe('2026-12-01T00:00:00.000Z');
    expect(r.end).toBe('2026-12-31T23:59:59.999Z');
  });

  it('February leap year ends on the 29th', () => {
    const r = monthRange(2024, 1);
    expect(r.end).toBe('2024-02-29T23:59:59.999Z');
  });

  it('February non-leap year ends on the 28th', () => {
    const r = monthRange(2025, 1);
    expect(r.end).toBe('2025-02-28T23:59:59.999Z');
  });

  it('30-day month (April) ends on the 30th', () => {
    const r = monthRange(2026, 3);
    expect(r.end).toBe('2026-04-30T23:59:59.999Z');
  });

  it('end round-trips through new Date() without drift', () => {
    const r = monthRange(2026, 7);
    const d = new Date(r.end);
    expect(d.getUTCMonth()).toBe(7);
    expect(d.getUTCFullYear()).toBe(2026);
  });
});
