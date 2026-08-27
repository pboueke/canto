import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';

export interface CalendarScrollAnchor {
  monthKey: string;
  /** Distance from the top of the anchored month, in content pixels. */
  relativeOffset: number;
}

interface CalendarScrollContextValue {
  getOffset: (journalId: string) => number;
  setOffset: (journalId: string, y: number) => void;
  getMonthAnchor: (journalId: string) => string | null;
  setMonthAnchor: (journalId: string, anchor: string) => void;
  getScrollAnchor: (journalId: string) => CalendarScrollAnchor | null;
  setScrollAnchor: (journalId: string, anchor: CalendarScrollAnchor) => void;
}

const CalendarScrollContext = createContext<CalendarScrollContextValue | null>(null);

export function CalendarScrollProvider({ children }: { children: ReactNode }) {
  const offsets = useRef(new Map<string, number>());
  const monthAnchors = useRef(new Map<string, string>());
  const scrollAnchors = useRef(new Map<string, CalendarScrollAnchor>());

  const getOffset = useCallback((journalId: string) => {
    return offsets.current.get(journalId) ?? 0;
  }, []);

  const setOffset = useCallback((journalId: string, y: number) => {
    offsets.current.set(journalId, y);
  }, []);

  const getMonthAnchor = useCallback((journalId: string) => {
    return monthAnchors.current.get(journalId) ?? null;
  }, []);

  const setMonthAnchor = useCallback((journalId: string, anchor: string) => {
    monthAnchors.current.set(journalId, anchor);
    scrollAnchors.current.set(journalId, {
      monthKey: anchor,
      relativeOffset: scrollAnchors.current.get(journalId)?.relativeOffset ?? 0,
    });
  }, []);

  const getScrollAnchor = useCallback((journalId: string) => {
    return scrollAnchors.current.get(journalId) ?? null;
  }, []);

  const setScrollAnchor = useCallback((journalId: string, anchor: CalendarScrollAnchor) => {
    monthAnchors.current.set(journalId, anchor.monthKey);
    scrollAnchors.current.set(journalId, anchor);
  }, []);

  const value = useMemo(
    () => ({
      getOffset,
      setOffset,
      getMonthAnchor,
      setMonthAnchor,
      getScrollAnchor,
      setScrollAnchor,
    }),
    [getOffset, setOffset, getMonthAnchor, setMonthAnchor, getScrollAnchor, setScrollAnchor],
  );

  return <CalendarScrollContext.Provider value={value}>{children}</CalendarScrollContext.Provider>;
}

export function useCalendarScroll(): CalendarScrollContextValue {
  const ctx = useContext(CalendarScrollContext);
  if (!ctx) {
    throw new Error('useCalendarScroll must be used within a CalendarScrollProvider');
  }
  return ctx;
}
