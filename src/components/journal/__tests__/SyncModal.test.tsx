import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { JournalContent } from 'canto-data';
import { SyncModal } from '../SyncModal';
import type { SyncState } from '@/lib/sync/manager';

const mockSyncJournal = jest.fn();
const mockCancelSync = jest.fn();
const mockSaveJournal = jest.fn();
let mockManager: object | null = {};
let mockState: SyncState = { status: 'idle', lastSynced: null };

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@/styles/web', () => ({ webModalContent: {} }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        border: '#ccc',
        foreground: '#fff',
        primary: '#000',
        text: '#111',
        textSecondary: '#666',
        highlight: '#eee',
        error: '#d00',
      },
      borderWidth: 1,
      fonts: { regular: 'System', bold: 'System' },
    },
  }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: require('@/i18n/dictionaries').dictionaries.en, lang: 'en' }),
}));
jest.mock('@/contexts/GoogleAuthContext', () => ({
  useGoogleAuth: () => ({ isSignedIn: true, signIn: jest.fn() }),
}));
jest.mock('@/contexts/SyncManagerContext', () => ({
  useSyncManager: () => ({
    syncJournal: mockSyncJournal,
    cancelSync: mockCancelSync,
    manager: mockManager,
  }),
  useSyncState: () => mockState,
}));
jest.mock('@/hooks/useStorage', () => ({
  useSaveJournal: () => ({ saveJournal: mockSaveJournal, saveJournalMetadata: mockSaveJournal }),
}));

const journal: JournalContent = {
  id: 'journal-1',
  title: 'Journal',
  icon: 'book',
  date: '2026-01-01T00:00:00.000Z',
  secure: false,
  salt: 'c2FsdA==',
  pages: [],
  settings: {
    use24h: false,
    previewTags: true,
    previewThumbnail: true,
    previewIcons: true,
    filterBar: true,
    sort: 'descending',
    autoLocation: false,
    remoteSync: true,
    autoSync: false,
    syncProvider: 'gdrive',
  },
  version: 1,
};

function renderModal(onClose = jest.fn()) {
  return render(
    <SyncModal
      visible
      journal={journal}
      derivedKey={null}
      onClose={onClose}
      onJournalChanged={jest.fn()}
    />,
  );
}

describe('SyncModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockManager = {};
    mockState = { status: 'idle', lastSynced: null };
  });

  it('blocks Sync now with visible loading feedback while the manager initializes', () => {
    mockManager = null;
    const { getByTestId, getByText } = renderModal();

    expect(getByText('Loading...')).toBeTruthy();
    expect(getByTestId('sync-now-button').props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(getByTestId('sync-now-button'));
    expect(mockSyncJournal).not.toHaveBeenCalled();
  });

  it('keeps the modal open and displays a localized generic failure', async () => {
    const onClose = jest.fn();
    mockState = { status: 'error', lastSynced: null, error: 'token=secret response body' };
    mockSyncJournal.mockResolvedValue({ kind: 'failed' });
    const { getByText, queryByText } = renderModal(onClose);

    fireEvent.press(getByText('Sync now'));

    await waitFor(() => expect(getByText('Sync failed')).toBeTruthy());
    expect(queryByText('token=secret response body')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    [
      'completed',
      { kind: 'completed', result: { warnings: [], requiresFreshRenderer: false } },
      'Sync complete',
    ],
    [
      'checkpointed',
      { kind: 'checkpointed' },
      'Sync paused to protect memory. Fully close this tab, reopen Canto, then sync again.',
    ],
    ['authentication-required', { kind: 'authentication-required' }, 'Sign in to Google'],
  ] as const)('shows stable feedback for a %s outcome', async (_kind, outcome, expected) => {
    const onClose = jest.fn();
    mockSyncJournal.mockResolvedValue(outcome);
    const { getByText } = renderModal(onClose);

    fireEvent.press(getByText('Sync now'));

    await waitFor(() => expect(getByText(expected)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps Sync now usable after a distinct cancellation outcome', async () => {
    mockSyncJournal.mockResolvedValue({ kind: 'cancelled' });
    const { getByTestId } = renderModal();

    fireEvent.press(getByTestId('sync-now-button'));

    await waitFor(() => expect(mockSyncJournal).toHaveBeenCalledTimes(1));
    expect(getByTestId('sync-now-button').props.accessibilityState).toEqual({ disabled: false });
  });

  it('blocks checkpointed work and retains the recovery explanation', () => {
    mockState = { status: 'checkpointed', lastSynced: null, requiresFreshRenderer: true };
    const { getByTestId, getByText } = renderModal();

    expect(
      getByText(
        'Sync paused to protect memory. Fully close this tab, reopen Canto, then sync again.',
      ),
    ).toBeTruthy();
    expect(getByTestId('sync-now-button').props.accessibilityState).toEqual({ disabled: true });
  });
});
