import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { InteractionManager } from 'react-native';
import type { SyncRunOutcome } from '@/lib/sync';

const mockEvents: string[] = [];
const mockRefresh = jest.fn();
const mockCreatePage = jest.fn(async () => 'p-new');
// Mirrors the write-capability seam: false while the journal holds a valid key
// lease, true after an auto-lock revokes it (set per-test).
let mockKeyLeaseLocked = false;
let mockOverviewError: Error | null = null;
let mockOverviewPresent = true;
let mockDraftIds: string[] = [];
let mockDerivedKey: Uint8Array | undefined;
const mockLockListeners: (() => void)[] = [];
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockUseJournal = jest.fn((..._args: unknown[]) => ({
  journal: mockJournal,
  loading: false,
  refresh: mockRefresh,
}));
const mockSyncJournal = jest.fn(() => {
  mockEvents.push('sync-start');
  return Promise.resolve({ kind: 'completed', result: {} } as SyncRunOutcome);
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
    router: {
      replace: (...args: unknown[]) => mockRouterReplace(...args),
      push: (...args: unknown[]) => mockRouterPush(...args),
    },
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
    t: {
      journal: { anniversary: '', filter: '', noPages: '' },
      privacy: { unsavedDraft: 'Unsaved draft' },
      page: { unlockRequired: 'Unlock this journal before saving.' },
      a11y: { pageEntry: 'Page entry' },
    },
  }),
}));

jest.mock('@/hooks/useStorage', () => ({
  useJournal: (...args: unknown[]) => mockUseJournal(...args),
  useJournalOverview: () => {
    const { pages, ...metadata } = mockJournal;
    return {
      overview: mockOverviewPresent ? { metadata, pages, tags: [], latestModified: 1 } : null,
      loading: false,
      error: mockOverviewError,
      refresh: mockRefresh,
    };
  },
  listDrafts: async () => mockDraftIds,
  useCreatePage: () => ({ create: mockCreatePage }),
  useAttachment: () => ({ getAttachment: mockGetAttachment }),
}));

jest.mock('@/hooks/useKeyLease', () => ({
  useKeyLease: () => ({ locked: mockKeyLeaseLocked, lease: null }),
}));

jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({
    getKey: () => mockDerivedKey,
    deriveAndCache: jest.fn(),
    onJournalLocked: (_id: string, listener: () => void) => {
      mockLockListeners.push(listener);
      return () => undefined;
    },
  }),
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

jest.mock('@/components/journal/JournalHeader', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    JournalHeader: ({ onPressSettings, onPressExport, onPressSync }: Record<string, () => void>) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Pressable, { testID: 'open-settings', onPress: onPressSettings }),
        React.createElement(Pressable, { testID: 'open-export', onPress: onPressExport }),
        React.createElement(Pressable, { testID: 'open-sync', onPress: onPressSync }),
      ),
  };
});
jest.mock('@/components/journal/FilterBar', () => ({ FilterBar: () => null }));
jest.mock('@/components/common/LockedPlaceholder', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { LockedPlaceholder: () => React.createElement(Text, { testID: 'journal-locked' }) };
});
jest.mock('@/components/journal/JournalIntegrityPanel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    JournalIntegrityPanel: ({ code }: { code: string }) =>
      React.createElement(Text, { testID: 'journal-integrity' }, code),
  };
});
jest.mock('@/components/journal/JournalSettings', () => ({ JournalSettings: () => null }));
jest.mock('@/components/journal/ExportJournalModal', () => ({ ExportJournalModal: () => null }));
jest.mock('@/components/journal/SyncModal', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SyncModal: ({ visible }: { visible: boolean }) =>
      visible ? React.createElement(Text, { testID: 'sync-modal' }, 'Sync modal') : null,
  };
});
jest.mock('@/components/common/FloatingActionButton', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    FloatingActionButton: ({ onPress }: { onPress: () => void }) =>
      React.createElement(Pressable, { testID: 'new-page', onPress }),
  };
});

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
import { Alert } from 'react-native';
import { StorageIntegrityError } from '@/lib/storage/integrity';

describe('JournalScreen open scheduling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockEvents.length = 0;
    mockRefresh.mockClear();
    mockSyncJournal.mockClear();
    mockGetAttachment.mockClear();
    mockUseJournal.mockClear();
    mockCreatePage.mockClear();
    mockKeyLeaseLocked = false;
    mockOverviewError = null;
    mockOverviewPresent = true;
    mockDraftIds = [];
    mockDerivedKey = undefined;
    mockLockListeners.length = 0;
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
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

  it('starts a visible thumbnail load before automatic sync and refreshes the overview', async () => {
    render(<JournalScreen />);
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(mockEvents).toEqual(['thumbnail-load-start', 'sync-start']);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('cancels a scheduled automatic sync when the journal screen closes', () => {
    const { unmount } = render(<JournalScreen />);
    unmount();
    act(() => jest.runOnlyPendingTimers());

    expect(mockSyncJournal).not.toHaveBeenCalled();
  });

  it('opens sync recovery guidance when auto-sync detects a remote password change', async () => {
    mockSyncJournal.mockResolvedValueOnce({
      kind: 'failed',
      errorCode: 'password-changed-elsewhere',
    });
    const screen = render(<JournalScreen />);

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    expect(screen.getByTestId('sync-modal')).toBeTruthy();
  });

  it('opens settings, sync, and export from the overview without a page scan', () => {
    const { getByTestId, unmount } = render(<JournalScreen />);
    expect(mockUseJournal).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('open-sync'));
    expect(mockUseJournal).not.toHaveBeenCalled();
    unmount();

    mockUseJournal.mockClear();
    const settings = render(<JournalScreen />);
    fireEvent.press(settings.getByTestId('open-settings'));
    expect(mockUseJournal).not.toHaveBeenCalled();
    settings.unmount();

    mockUseJournal.mockClear();
    const exportModal = render(<JournalScreen />);
    fireEvent.press(exportModal.getByTestId('open-export'));
    expect(mockUseJournal).not.toHaveBeenCalled();
  });

  it('creates a new page from the FAB while the key lease is valid', async () => {
    const { getByTestId } = render(<JournalScreen />);
    fireEvent.press(getByTestId('new-page'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockCreatePage).toHaveBeenCalledTimes(1);
  });

  it('blocks the new-page FAB with a localized locked error when the key lease is revoked', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockKeyLeaseLocked = true;
    const { getByTestId } = render(<JournalScreen />);

    fireEvent.press(getByTestId('new-page'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCreatePage).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Unlock this journal before saving.');
    alertSpy.mockRestore();
  });

  it('replaces every page with the locked placeholder once the journal locks', () => {
    const { getByTestId, queryByTestId, rerender } = render(<JournalScreen />);
    expect(queryByTestId('journal-locked')).toBeNull();
    mockKeyLeaseLocked = true;
    act(() => {
      for (const listener of mockLockListeners) listener();
    });
    rerender(<JournalScreen />);
    expect(getByTestId('journal-locked')).toBeTruthy();
    expect(queryByTestId('new-page')).toBeNull();
  });

  it('shows the integrity panel instead of bouncing home for a verified-but-unreadable journal', () => {
    mockDerivedKey = new Uint8Array(32).fill(1);
    mockOverviewPresent = false;
    mockOverviewError = new StorageIntegrityError('LEGACY_ZERO_KEY', 'legacy');
    const { getByTestId } = render(<JournalScreen />);
    expect(getByTestId('journal-integrity').props.children).toBe('LEGACY_ZERO_KEY');
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('still leaves a journal that genuinely no longer exists', () => {
    mockOverviewPresent = false;
    render(<JournalScreen />);
    expect(mockRouterReplace).toHaveBeenCalledWith('/');
  });

  it('lists pages with an unsaved draft and opens them for editing', async () => {
    mockDraftIds = ['p1', 'orphan'];
    const { findByTestId, queryByTestId } = render(<JournalScreen />);
    const row = await findByTestId('draft-row-p1');
    expect(queryByTestId('draft-row-orphan')).toBeNull();
    fireEvent.press(row);
    expect(mockRouterPush).toHaveBeenCalledWith('/page/p1?journalId=j1&edit=true');
  });

  // Regression (web reload): with no key in memory, a password layer that
  // does not open means the journal is locked, not damaged.
  it('sends a keyless password-protected journal home to unlock instead of the integrity panel', () => {
    mockOverviewPresent = false;
    mockOverviewError = new StorageIntegrityError('JOURNAL_UNREADABLE', 'locked', {
      cause: 'PASSWORD_DECRYPT_FAILED',
    });
    const { queryByTestId } = render(<JournalScreen />);
    expect(queryByTestId('journal-integrity')).toBeNull();
    expect(mockRouterReplace).toHaveBeenCalledWith('/');
  });

  it('still shows real damage without a key', () => {
    mockOverviewPresent = false;
    mockOverviewError = new StorageIntegrityError('JOURNAL_UNREADABLE', 'damaged', {
      cause: 'DEVICE_DECRYPT_FAILED',
    });
    const { getByTestId } = render(<JournalScreen />);
    expect(getByTestId('journal-integrity')).toBeTruthy();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
