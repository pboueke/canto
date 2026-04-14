import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';

interface CalendarScrollContextValue {
  getOffset: (journalId: string) => number;
  setOffset: (journalId: string, y: number) => void;
}

const CalendarScrollContext = createContext<CalendarScrollContextValue | null>(null);

export function CalendarScrollProvider({ children }: { children: ReactNode }) {
  const offsets = useRef(new Map<string, number>());

  const getOffset = useCallback((journalId: string) => {
    return offsets.current.get(journalId) ?? 0;
  }, []);

  const setOffset = useCallback((journalId: string, y: number) => {
    offsets.current.set(journalId, y);
  }, []);

  const value = useMemo(() => ({ getOffset, setOffset }), [getOffset, setOffset]);

  return <CalendarScrollContext.Provider value={value}>{children}</CalendarScrollContext.Provider>;
}

export function useCalendarScroll(): CalendarScrollContextValue {
  const ctx = useContext(CalendarScrollContext);
  if (!ctx) {
    throw new Error('useCalendarScroll must be used within a CalendarScrollProvider');
  }
  return ctx;
}
