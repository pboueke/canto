import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StorageIntegrityError } from '@/lib/storage/integrity';
import { dictionaries } from '@/i18n/dictionaries';

const mockRefresh = jest.fn();
const mockUseJournals = jest.fn();
const mockVerifyJournalKey = jest.fn();
const mockDeriveAndCache = jest.fn(async () => new Uint8Array(32).fill(1));
const mockClearKey = jest.fn();
const mockMarkReadOnly = jest.fn();
const mockPush = jest.fn();
const mockCopyDiagnostics = jest.fn(async (..._args: unknown[]) => ({
  copied: true,
  report: '{"format":"report"}',
}));
let mockAccessProps: {
  visible: boolean;
  error?: string | null;
  onUnlock: (password: string) => Promise<void>;
} | null = null;

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
  verifyJournalKey: (...args: unknown[]) => mockVerifyJournalKey(...args),
}));
jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({
    deriveAndCache: mockDeriveAndCache,
    getKey: () => null,
    clearKey: mockClearKey,
    clearAll: jest.fn(),
    markReadOnly: mockMarkReadOnly,
  }),
}));
jest.mock('@/lib/diagnostics', () => ({
  copyDiagnosticsReport: (...args: unknown[]) => mockCopyDiagnostics(...args),
}));
jest.mock('@/lib/biometric', () => ({ authenticateBiometric: jest.fn().mockResolvedValue(true) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush }),
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
jest.mock('@/components/home/JournalCard', () => {
  const { Pressable, Text } = require('react-native');
  return {
    JournalCard: ({ journal, onPress }: { journal: { id: string }; onPress: () => void }) => (
      <Pressable testID={`journal-${journal.id}`} onPress={onPress}>
        <Text>{journal.id}</Text>
      </Pressable>
    ),
  };
});
jest.mock('@/components/home/NewJournalModal', () => ({ NewJournalModal: () => null }));
jest.mock('@/components/home/JournalAccessModal', () => ({
  JournalAccessModal: (props: NonNullable<typeof mockAccessProps>) => {
    mockAccessProps = props;
    return null;
  },
}));
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

describe('HomeScreen password unlock', () => {
  const secureJournal = {
    id: 's1',
    title: 'Secret',
    icon: 'book',
    date: '2026-01-01',
    secure: true,
    salt: 'c2FsdA==',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccessProps = null;
    mockUseJournals.mockReturnValue({
      journals: [secureJournal],
      loading: false,
      error: null,
      refresh: mockRefresh,
    });
  });

  async function openAccess() {
    const utils = renderHome();
    await waitFor(() => expect(utils.getByTestId('journal-s1')).toBeTruthy());
    await act(async () => {
      fireEvent.press(utils.getByTestId('journal-s1'));
    });
    await waitFor(() => expect(mockAccessProps?.visible).toBe(true));
    return utils;
  }

  it('opens the journal when the password verifies', async () => {
    mockVerifyJournalKey.mockResolvedValue('valid');
    await openAccess();
    await act(async () => {
      await mockAccessProps!.onUnlock('correct');
    });
    expect(mockPush).toHaveBeenCalledWith('/journal/s1');
    expect(mockClearKey).not.toHaveBeenCalled();
  });

  it('reports a wrong password only when verification rejects the key', async () => {
    mockVerifyJournalKey.mockResolvedValue('invalid');
    await openAccess();
    await act(async () => {
      await expect(mockAccessProps!.onUnlock('nope')).rejects.toThrow('Wrong password');
    });
    expect(mockClearKey).toHaveBeenCalledWith('s1');
    expect(mockAccessProps!.error).toBe(t.home.wrongPassword);
    expect(mockPush).not.toHaveBeenCalled();
  });

  // Repro D: a correct password over legacy zero-key records used to be
  // reported as "Wrong password".
  it('routes integrity problems to the journal screen instead of "Wrong password"', async () => {
    mockVerifyJournalKey.mockRejectedValue(
      new StorageIntegrityError('JOURNAL_UNREADABLE', 'metadata unreadable'),
    );
    await openAccess();
    await act(async () => {
      await mockAccessProps!.onUnlock('correct');
    });
    expect(mockPush).toHaveBeenCalledWith('/journal/s1');
    // Reviewer finding 5: a key that could not be verified is never kept.
    expect(mockClearKey).toHaveBeenCalledWith('s1');
  });

  // Reviewer finding 4: only zero-key records exist, so nothing can confirm
  // the password; it is not reported as wrong, and recovery will refuse.
  it('opens a journal whose password cannot be verified either way', async () => {
    mockVerifyJournalKey.mockResolvedValue('unverifiable');
    await openAccess();
    await act(async () => {
      await mockAccessProps!.onUnlock('maybe');
    });
    expect(mockPush).toHaveBeenCalledWith('/journal/s1');
    expect(mockAccessProps!.error).not.toBe(t.home.wrongPassword);
    // Data-loss review: nothing may be written under a key no record confirms.
    expect(mockMarkReadOnly).toHaveBeenCalledWith('s1');
  });

  it('shows a non-password message for unexpected failures', async () => {
    mockVerifyJournalKey.mockRejectedValue(new Error('disk on fire'));
    await openAccess();
    await act(async () => {
      await expect(mockAccessProps!.onUnlock('correct')).rejects.toThrow('disk on fire');
    });
    expect(mockAccessProps!.error).toBe(t.journalIntegrity.unreadableMessage);
    expect(mockAccessProps!.error).not.toBe(t.home.wrongPassword);
  });
});

describe('HomeScreen diagnostics', () => {
  it('copies a counts-only report from the recovery card', async () => {
    mockUseJournals.mockReturnValue({
      journals: [],
      loading: false,
      error: new StorageIntegrityError('INDEX_UNREADABLE', 'index unreadable'),
      refresh: mockRefresh,
    });
    const { getByText } = renderHome();
    await waitFor(() => expect(getByText(t.journalIntegrity.copyDiagnostics)).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByText(t.journalIntegrity.copyDiagnostics));
    });
    expect(mockCopyDiagnostics).toHaveBeenCalledWith('INDEX_UNREADABLE', undefined, undefined);
    expect(getByText(t.journalIntegrity.diagnosticsCopied)).toBeTruthy();
  });
});
