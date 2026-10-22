import React from 'react';
import { FlatList } from 'react-native';
import { act, render } from '@testing-library/react-native';

const mockUseJournalOverview = jest.fn();
const mockCalendarLockListeners: (() => void)[] = [];

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), dismissAll: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'j1' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useTheme', () => {
  const React = require('react');
  return {
    ThemeContext: React.createContext(null),
    useTheme: () => ({
      theme: {
        isDark: false,
        colors: { background: '#fff', primary: '#000', textSecondary: '#666' },
        fonts: { fontScale: 1 },
      },
      setThemeName: jest.fn(),
    }),
  };
});
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: { calendar: { noPages: 'No pages' } } }),
}));
jest.mock('@/hooks/useStorage', () => ({
  useJournalOverview: (...args: unknown[]) => mockUseJournalOverview(...args),
}));
jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({
    getKey: () => null,
    onJournalLocked: (_id: string, listener: () => void) => {
      mockCalendarLockListeners.push(listener);
      return () => undefined;
    },
  }),
}));
jest.mock('@/contexts/CalendarScrollContext', () => ({
  useCalendarScroll: () => ({ getScrollAnchor: () => null, setScrollAnchor: jest.fn() }),
}));
jest.mock('@/contexts/FontPrefsContext', () => ({ useFontPrefs: () => ({}) }));
jest.mock('@/lib/font', () => ({ applyFontPrefs: (theme: unknown) => theme }));
jest.mock('@/styles/themes', () => ({ themes: {} }));
jest.mock('@/components/journal/CalendarHeader', () => ({ CalendarHeader: () => null }));
jest.mock('@/components/journal/AnniversaryRow', () => ({ AnniversaryRow: () => null }));
jest.mock('@/components/journal/MonthPreview', () => ({ MonthPreview: () => null }));
jest.mock('@/components/common/LockedPlaceholder', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { LockedPlaceholder: () => React.createElement(Text, { testID: 'journal-locked' }) };
});

import JournalCalendarScreen from '../../../../app/journal/[id]/calendar';

describe('JournalCalendarScreen', () => {
  beforeEach(() => {
    mockUseJournalOverview.mockReturnValue({
      overview: {
        metadata: {
          id: 'j1',
          title: 'Journal',
          icon: 'book',
          date: '2026-01-01',
          secure: false,
          salt: 'salt',
          settings: { sort: 'descending' },
        },
        pages: [
          {
            id: 'p1',
            date: '2026-08-01T10:00:00Z',
            modified: 1,
            deleted: false,
            tags: [],
          },
        ],
        tags: [],
        latestModified: 1,
      },
      loading: false,
    });
  });

  it('reads the catalog overview and renders a bounded virtual month list', () => {
    const { UNSAFE_getByType } = render(<JournalCalendarScreen />);

    expect(mockUseJournalOverview).toHaveBeenCalledWith('j1', null);
    const list = UNSAFE_getByType(FlatList);
    expect(list.props).toMatchObject({
      initialNumToRender: 3,
      maxToRenderPerBatch: 4,
      windowSize: 5,
      removeClippedSubviews: true,
    });
  });

  it('replaces the calendar with the locked placeholder once the journal locks', () => {
    const { getByTestId, UNSAFE_queryByType } = render(<JournalCalendarScreen />);
    act(() => {
      for (const listener of mockCalendarLockListeners) listener();
    });
    expect(getByTestId('journal-locked')).toBeTruthy();
    expect(UNSAFE_queryByType(FlatList)).toBeNull();
  });
});
