import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockDeleteRemoteJournal = jest.fn().mockResolvedValue(undefined);
const mockConnectWithToken = jest.fn().mockResolvedValue(undefined);
const mockGetJournal = jest.fn();
const mockSaveJournal = jest.fn();
let mockCachedKey: Uint8Array | null = new Uint8Array(32).fill(42);
const localJournal = {
  id: '4a5f8cc3-877e-4e6b-ba12-44a68654fae6',
  title: 'Remote Journal',
  secure: true,
  settings: { syncProvider: 'gdrive', remoteSync: true, autoSync: true },
  pages: [],
};

jest.mock('@expo/vector-icons', () => ({
  Feather: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`icon-${name}`}>{name}</Text>;
  },
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        primary: '#000',
        foreground: '#fff',
        border: '#ddd',
        text: '#111',
        textSecondary: '#666',
        highlight: '#eee',
        surface: '#fff',
        error: '#d00',
      },
      fonts: { regular: 'System', bold: 'System' },
      borderWidth: 1,
    },
  }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: {
      sync: {
        loggedInWith: 'Logged in with {provider}',
        signedInAs: 'Signed in as',
        manageJournals: 'Manage journals',
        signOut: 'Sign out',
        sessionRetention: 'Session',
        retentionOneDay: '1 day',
        retentionOneWeek: '1 week',
        retentionOneMonth: '1 month',
        retentionNever: 'Never',
        noCloudJournals: 'No journals',
        journalAlreadyLocal: 'Local',
        deleteRemoteJournal: 'Delete remote journal',
        deleteRemoteConfirm: 'Delete it?',
      },
      common: { close: 'Close', cancel: 'Cancel', delete: 'Delete' },
    },
  }),
}));

jest.mock('@/hooks/useStorage', () => ({
  useJournals: () => ({
    journals: [localJournal],
  }),
  getLocalStore: jest.fn(async () => ({
    getJournal: mockGetJournal,
    saveJournal: mockSaveJournal,
  })),
}));

jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({ getKey: () => mockCachedKey }),
}));

jest.mock('@/contexts/GoogleAuthContext', () => ({
  useGoogleAuth: () => ({
    user: { name: 'Test User', email: 'test@example.com' },
    isSignedIn: true,
    isLoading: false,
    accessToken: 'token',
    signIn: jest.fn(),
    signOut: jest.fn(),
    retentionDays: 7,
    setRetentionDays: jest.fn(),
  }),
}));

jest.mock('@/contexts/SyncManagerContext', () => ({
  useSyncManager: () => ({
    provider: 'gdrive',
    manager: {
      connectWithToken: mockConnectWithToken,
      getRemoteStore: () => ({
        deleteJournal: mockDeleteRemoteJournal,
        listRemoteJournals: jest.fn().mockResolvedValue([
          {
            id: '4a5f8cc3-877e-4e6b-ba12-44a68654fae6',
            title: 'Remote Journal',
            encrypted: true,
          },
        ]),
      }),
    },
  }),
}));

jest.mock('@/components/home/SyncProviderModal', () => ({ SyncProviderModal: () => null }));

import { AccountButton } from '../AccountButton';

describe('AccountButton remote deletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCachedKey = new Uint8Array(32).fill(42);
    mockGetJournal.mockResolvedValue({ ...localJournal, settings: { ...localJournal.settings } });
  });

  it('uses the cached journal key to disable local sync after deleting the remote journal', async () => {
    const screen = render(<AccountButton />);

    fireEvent.press(screen.getByText('Logged in with Google'));
    fireEvent.press(screen.getByText('Manage journals'));
    await screen.findByText('Remote Journal');
    fireEvent.press(screen.getByTestId('icon-trash-2'));
    fireEvent.press(screen.getByText('Delete'));

    await waitFor(() =>
      expect(mockDeleteRemoteJournal).toHaveBeenCalledWith('4a5f8cc3-877e-4e6b-ba12-44a68654fae6'),
    );
    await waitFor(() =>
      expect(mockGetJournal).toHaveBeenCalledWith(localJournal.id, mockCachedKey),
    );
    expect(mockSaveJournal).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          syncProvider: undefined,
          remoteSync: false,
          autoSync: false,
        }),
      }),
      mockCachedKey,
    );
    expect(screen.queryByText(/Invalid JSON in journal:4a5f8cc3/)).toBeNull();
  });

  it('keeps a locked local copy untouched when its cached key is unavailable', async () => {
    mockCachedKey = null;
    const screen = render(<AccountButton />);

    fireEvent.press(screen.getByText('Logged in with Google'));
    fireEvent.press(screen.getByText('Manage journals'));
    await screen.findByText('Remote Journal');
    fireEvent.press(screen.getByTestId('icon-trash-2'));
    fireEvent.press(screen.getByText('Delete'));

    await waitFor(() =>
      expect(mockDeleteRemoteJournal).toHaveBeenCalledWith('4a5f8cc3-877e-4e6b-ba12-44a68654fae6'),
    );
    expect(mockGetJournal).not.toHaveBeenCalled();
    expect(mockSaveJournal).not.toHaveBeenCalled();
    expect(screen.queryByText(/Invalid JSON in journal:4a5f8cc3/)).toBeNull();
  });
});
