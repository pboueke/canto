import type { PagePreview } from 'canto-data';

export interface MonthWithPages {
  year: number;
  month: number; // 0-11 (UTC)
  daysWithPages: Set<number>; // 1-31 (UTC day-of-month)
}

function parseUtc(date: string): Date | null {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * True if `page.date` is a prior-year same-UTC-month+day match against `today`.
 * Feb-29 entries only match on actual Feb-29 (leap days) — on Feb-28 of
 * non-leap years we intentionally skip them so users see their Feb-29
 * anniversaries only on the real calendar leap day.
 */
export function isAnniversary(page: Pick<PagePreview, 'date'>, today: Date): boolean {
  const d = parseUtc(page.date);
  if (!d) return false;
  if (d.getUTCFullYear() >= today.getUTCFullYear()) return false;
  return d.getUTCMonth() === today.getUTCMonth() && d.getUTCDate() === today.getUTCDate();
}

export function getAnniversaryPages(pages: PagePreview[], today: Date): PagePreview[] {
  return pages.filter((p) => isAnniversary(p, today));
}

export function getMonthsWithPages(
  pages: PagePreview[],
  sort: 'ascending' | 'descending' | 'none' = 'descending',
): MonthWithPages[] {
  const map = new Map<string, MonthWithPages>();
  for (const p of pages) {
    const d = parseUtc(p.date);
    if (!d) continue;
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const day = d.getUTCDate();
    const key = `${year}-${month}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { year, month, daysWithPages: new Set<number>() };
      map.set(key, entry);
    }
    entry.daysWithPages.add(day);
  }
  const entries = Array.from(map.values());
  if (sort === 'none') return entries;
  entries.sort((a, b) => {
    const ay = a.year * 12 + a.month;
    const by = b.year * 12 + b.month;
    return sort === 'ascending' ? ay - by : by - ay;
  });
  return entries;
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  return { start: start.toISOString(), end: end.toISOString() };
}
