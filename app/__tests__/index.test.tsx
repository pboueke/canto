import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StorageIntegrityError } from '@/lib/storage/integrity';
import { dictionaries } from '@/i18n/dictionaries';

const mockRefresh = jest.fn();
const mockUseJournals = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#fff',
        foreground: '#f5f5f5',
        border: '#ddd',
        text: '#111',
        textSecondary: '#666',
        highlight: '#eee',
        primary: '#000',
        error: '#d00',
        surface: '#fff',
      },
      fonts: { regular: 'System', bold: 'System' },
      borderWidth: 1,
    },
  }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: require('@/i18n/dictionaries').dictionaries.en }),
}));
jest.mock('@/hooks/useStorage', () => ({
  useJournals: () => mockUseJournals(),
  useCreateJournal: () => ({ create: jest.fn() }),
  tryLoadJournalOverview: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({
    deriveAndCache: jest.fn(),
    getKey: () => null,
    clearKey: jest.fn(),
    clearAll: jest.fn(),
  }),
}));
jest.mock('@/lib/biometric', () => ({ authenticateBiometric: jest.fn().mockResolvedValue(true) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../onboarding', () => ({
  ONBOARDING_KEY: 'canto:onboardingDone',
  isOnboardingDone: () => true,
  markOnboardingDone: jest.fn(),
}));
jest.mock('@/components/common/Logo', () => ({ Logo: () => null }));
jest.mock('@/components/home/InfoBox', () => ({ InfoBox: () => null }));
jest.mock('@/components/home/JournalCard', () => ({ JournalCard: () => null }));
jest.mock('@/components/home/NewJournalModal', () => ({ NewJournalModal: () => null }));
jest.mock('@/components/home/JournalAccessModal', () => ({ JournalAccessModal: () => null }));
jest.mock('@/components/home/AccountButton', () => ({ AccountButton: () => null }));
jest.mock('@/components/home/NewJournalCard', () => {
  const { Text } = require('react-native');
  return { NewJournalCard: () => <Text testID="new-journal-card">new journal</Text> };
});

const HomeScreen = require('../index').default;
const t = dictionaries.en;

function renderHome() {
  return render(<HomeScreen />);
}

describe('HomeScreen integrity recovery states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseJournals.mockReturnValue({
      journals: [],
      loading: false,
      error: null,
      refresh: mockRefresh,
    });
  });

  it('renders the device-key recovery state instead of an empty library', async () => {
    mockUseJournals.mockReturnValue({
      journals: [],
      loading: false,
      error: new StorageIntegrityError('DEVICE_KEY_UNAVAILABLE', 'missing device key'),
      refresh: mockRefresh,
    });

    const { getByText, queryByTestId, queryByText } = renderHome();

    await waitFor(() => expect(getByText(t.recovery.title)).toBeTruthy());
    expect(getByText(t.recovery.message)).toBeTruthy();
    expect(getByText(t.recovery.deviceKeyDetail)).toBeTruthy();
    expect(getByText(t.recovery.instructions)).toBeTruthy();
    // The library must never be presented as empty or reduced.
    expect(queryByText(t.home.noJournals)).toBeNull();
    expect(queryByTestId('new-journal-card')).toBeNull();
  });

  it('renders the index recovery state for an unreadable index', async () => {
    mockUseJournals.mockReturnValue({
      journals: [],
      loading: false,
      error: new StorageIntegrityError('INDEX_UNREADABLE', 'index unreadable', {
        cause: 'JSON_PARSE_FAILED',
      }),
      refresh: mockRefresh,
    });

    const { getByText, queryByTestId, queryByText } = renderHome();

    await waitFor(() => expect(getByText(t.recovery.title)).toBeTruthy());
    expect(getByText(t.recovery.indexDetail)).toBeTruthy();
    expect(queryByText(t.recovery.deviceKeyDetail)).toBeNull();
    expect(queryByText(t.home.noJournals)).toBeNull();
    expect(queryByTestId('new-journal-card')).toBeNull();
  });

  it('retry re-runs the library load through refresh', async () => {
    mockUseJournals.mockReturnValue({
      journals: [],
      loading: false,
      error: new StorageIntegrityError('INDEX_UNREADABLE', 'index unreadable'),
      refresh: mockRefresh,
    });

    const { getByText } = renderHome();
    await waitFor(() => expect(getByText(t.recovery.title)).toBeTruthy());

    fireEvent.press(getByText(t.dataIntegrity.retry));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('an ordinary error does not masquerade as a recovery state', async () => {
    // Pins the current contract: only the two typed integrity codes render the
    // recovery card. A generic (e.g. transient) failure still falls through to
    // the empty-library branch. Residual risk: an untyped transaction-recovery
    // throw would also land here, so callers should keep wrapping recovery
    // failures in StorageIntegrityError.
    mockUseJournals.mockReturnValue({
      journals: [],
      loading: false,
      error: new Error('transient failure'),
      refresh: mockRefresh,
    });

    const { getByText, queryByText } = renderHome();

    await waitFor(() => expect(getByText(t.home.noJournals)).toBeTruthy());
    expect(queryByText(t.recovery.title)).toBeNull();
  });
});
