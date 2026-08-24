import React from 'react';
import { act, render } from '@testing-library/react-native';
import { InteractionManager } from 'react-native';

const mockEvents: string[] = [];
const mockRefresh = jest.fn();
const mockSyncJournal = jest.fn(() => {
  mockEvents.push('sync-start');
  return Promise.resolve(null);
});
const mockGetAttachment = jest.fn(async () => {
  mockEvents.push('thumbnail-load-start');
  return 'thumbnail-data';
});

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useLocalSearchParams: () => ({ id: 'j1' }),
    useRouter: () => ({ push: jest.fn() }),
    router: { replace: jest.fn(), push: jest.fn() },
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
  };
});

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
        colors: {
          background: '#fff',
          primary: '#000',
          text: '#111',
          textSecondary: '#666',
          popAction: { new: { background: '#000', text: '#fff' } },
        },
        fonts: { fontScale: 1 },
      },
      setThemeName: jest.fn(),
    }),
  };
});

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: { journal: { anniversary: '', filter: '', noPages: '' }, a11y: { pageEntry: 'Page entry' } },
  }),
}));

jest.mock('@/hooks/useStorage', () => ({
  useJournal: () => ({ journal: mockJournal, loading: false, refresh: mockRefresh }),
  useCreatePage: () => ({ create: jest.fn() }),
  useAttachment: () => ({ getAttachment: mockGetAttachment }),
}));

jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({ getKey: () => undefined, deriveAndCache: jest.fn() }),
}));

jest.mock('@/hooks/useFilter', () => ({
  useFilter: (pages: unknown[]) => ({
    filter: {},
    anniversary: false,
    filteredPages: pages,
    isActive: false,
    setQuery: jest.fn(),
    setDateStart: jest.fn(),
    setDateEnd: jest.fn(),
    toggleProperty: jest.fn(),
    toggleTag: jest.fn(),
    clearFilters: jest.fn(),
  }),
}));

jest.mock('@/hooks/usePagination', () => ({
  usePagination: (pages: unknown[]) => ({
    visiblePages: pages,
    loadMore: jest.fn(),
    hasMore: false,
  }),
}));

jest.mock('@/contexts/GoogleAuthContext', () => ({ useGoogleAuth: () => ({ isSignedIn: true }) }));
jest.mock('@/contexts/SyncManagerContext', () => ({
  useSyncManager: () => ({ syncJournal: mockSyncJournal }),
  useSyncState: () => ({ status: 'idle', lastSynced: null }),
}));

jest.mock('@/lib/pagePreview', () => ({
  pageToListPreview: (page: unknown) => page,
}));
jest.mock('@/lib/calendar', () => ({ getAnniversaryPages: () => [] }));
jest.mock('@/contexts/FontPrefsContext', () => ({ useFontPrefs: () => ({}) }));
jest.mock('@/lib/font', () => ({ applyFontPrefs: (theme: unknown) => theme }));
jest.mock('@/styles/themes', () => ({ themes: {} }));

jest.mock('@/components/journal/JournalHeader', () => ({ JournalHeader: () => null }));
jest.mock('@/components/journal/FilterBar', () => ({ FilterBar: () => null }));
jest.mock('@/components/journal/JournalSettings', () => ({ JournalSettings: () => null }));
jest.mock('@/components/journal/ExportJournalModal', () => ({ ExportJournalModal: () => null }));
jest.mock('@/components/journal/SyncModal', () => ({ SyncModal: () => null }));
jest.mock('@/components/common/FloatingActionButton', () => ({ FloatingActionButton: () => null }));

// Mirrors the actual queue's deferred InteractionManager scheduling: the thumbnail
// work only starts after the screen's effects have committed.
jest.mock('@/hooks/useImageQueue', () => ({
  enqueueThumbnail: (_id: string, load: () => Promise<string | null>) => {
    setTimeout(() => void load(), 0);
    return jest.fn();
  },
}));

const mockJournal = {
  id: 'j1',
  title: 'Journal',
  icon: 'book',
  date: '2026-01-01',
  secure: false,
  salt: 'salt',
  settings: {
    autoSync: true,
    remoteSync: true,
    syncProvider: 'gdrive',
    sort: 'descending',
    filterBar: false,
    previewThumbnail: true,
  },
  pages: [
    {
      id: 'p1',
      date: '2026-01-01',
      modified: 1,
      deleted: false,
      thumbnail: undefined,
      firstImage: 'canto/j1/attachments/photo.jpg',
      firstImageEncrypted: false,
      firstImageSize: 16,
      previewText: '',
      searchText: '',
      tags: [],
      hasAttachment: true,
      hasImage: true,
      hasLocation: false,
      hasComments: false,
    },
  ],
};

import JournalScreen from '../../../../app/journal/[id]/index';

describe('JournalScreen open scheduling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockEvents.length = 0;
    mockRefresh.mockClear();
    mockSyncJournal.mockClear();
    mockGetAttachment.mockClear();
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((task) => {
      if (typeof task === 'function') {
        task();
      } else {
        task?.gen();
      }
      return {
        then: () => Promise.resolve(),
        done: jest.fn(),
        cancel: jest.fn(),
      } as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('starts a visible thumbnail load before automatic sync on journal open', async () => {
    render(<JournalScreen />);
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(mockEvents).toEqual(['thumbnail-load-start', 'sync-start']);
  });

  it('cancels a scheduled automatic sync when the journal screen closes', () => {
    const { unmount } = render(<JournalScreen />);
    unmount();
    act(() => jest.runOnlyPendingTimers());

    expect(mockSyncJournal).not.toHaveBeenCalled();
  });
});
