import { renderHook, act } from '@testing-library/react-native';
import { CalendarScrollProvider, useCalendarScroll } from '../CalendarScrollContext';
import { useRef } from 'react';

function wrapper({ children }: { children: React.ReactNode }) {
  return <CalendarScrollProvider>{children}</CalendarScrollProvider>;
}

describe('CalendarScrollContext', () => {
  it('getOffset returns 0 for unset ids', () => {
    const { result } = renderHook(() => useCalendarScroll(), { wrapper });
    expect(result.current.getOffset('journal-a')).toBe(0);
  });

  it('setOffset then getOffset returns the stored value', () => {
    const { result } = renderHook(() => useCalendarScroll(), { wrapper });
    act(() => result.current.setOffset('journal-a', 123));
    expect(result.current.getOffset('journal-a')).toBe(123);
  });

  it('stores a stable month anchor independently of the pixel offset', () => {
    const { result } = renderHook(() => useCalendarScroll(), { wrapper });
    act(() => result.current.setMonthAnchor('journal-a', '2026-8'));
    expect(result.current.getMonthAnchor('journal-a')).toBe('2026-8');
    expect(result.current.getOffset('journal-a')).toBe(0);
  });

  it('stores a month anchor with a relative offset for virtual-list restoration', () => {
    const { result } = renderHook(() => useCalendarScroll(), { wrapper });
    act(() =>
      result.current.setScrollAnchor('journal-a', {
        monthKey: '2026-8',
        relativeOffset: 42,
      }),
    );
    expect(result.current.getScrollAnchor('journal-a')).toEqual({
      monthKey: '2026-8',
      relativeOffset: 42,
    });
    expect(result.current.getMonthAnchor('journal-a')).toBe('2026-8');
  });

  it('offsets are isolated per journal id', () => {
    const { result } = renderHook(() => useCalendarScroll(), { wrapper });
    act(() => {
      result.current.setOffset('a', 100);
      result.current.setOffset('b', 200);
    });
    expect(result.current.getOffset('a')).toBe(100);
    expect(result.current.getOffset('b')).toBe(200);
  });

  it('provider unmount clears refs — remount returns 0', () => {
    const first = renderHook(() => useCalendarScroll(), { wrapper });
    act(() => first.result.current.setOffset('a', 50));
    expect(first.result.current.getOffset('a')).toBe(50);
    first.unmount();
    const second = renderHook(() => useCalendarScroll(), { wrapper });
    expect(second.result.current.getOffset('a')).toBe(0);
  });

  it('setOffset does not cause consumers to re-render', () => {
    const { result } = renderHook(
      () => {
        const renders = useRef(0);
        renders.current += 1;
        const ctx = useCalendarScroll();
        return { ctx, renders: renders.current };
      },
      { wrapper },
    );
    const initial = result.current.renders;
    act(() => result.current.ctx.setOffset('a', 999));
    expect(result.current.renders).toBe(initial);
  });

  it('throws when used outside provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useCalendarScroll())).toThrow(/CalendarScrollProvider/);
    spy.mockRestore();
  });
});
