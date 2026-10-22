import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { JournalContent } from 'canto-data';
import { JournalSettings } from '../JournalSettings';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@/styles/web', () => ({ webModalContent: {} }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#fff',
        surface: '#fff',
        border: '#ccc',
        text: '#111',
        textSecondary: '#666',
        primary: '#000',
        error: '#d00',
        buttonCancel: '#eee',
        buttonSubmit: '#000',
      },
      fonts: { regular: 'System', bold: 'System' },
    },
  }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: require('@/i18n/dictionaries').dictionaries.en }),
}));
jest.mock('@/hooks/useStorage', () => ({
  useDeleteJournal: () => ({ deleteJournal: jest.fn() }),
  useSaveJournal: () => ({ saveJournalMetadata: jest.fn(), saving: false }),
  getEncryptionService: jest.fn(),
  getLocalStore: jest.fn(),
  tryLoadJournal: jest.fn(),
}));
jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({
    deriveAndCache: jest.fn(),
    setKey: jest.fn(),
    clearKey: jest.fn(),
    touchActivity: jest.fn(),
  }),
}));
jest.mock('@/contexts/SyncManagerContext', () => ({ useSyncManager: () => ({ manager: null }) }));
jest.mock('@/components/common/IconPicker', () => ({ IconPicker: () => null }));
jest.mock('@/components/home/ThemePickerModal', () => ({ ThemePickerModal: () => null }));
jest.mock('../ConfirmDeleteModal', () => ({ ConfirmDeleteModal: () => null }));
jest.mock('../ChangePasswordModal', () => ({ ChangePasswordModal: () => null }));
jest.mock('@/lib/biometric', () => ({ isBiometricAvailable: () => Promise.resolve(false) }));
jest.mock('../RecoverPagesModal', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    RecoverPagesModal: ({ visible }: { visible: boolean }) =>
      visible ? React.createElement(Text, { testID: 'recover-modal' }, 'recover') : null,
  };
});

const journal: Omit<JournalContent, 'pages'> = {
  id: 'j1',
  title: 'Journal',
  icon: 'book',
  date: '2026-01-01T00:00:00.000Z',
  secure: false,
  salt: 'c2FsdA==',
  settings: {
    use24h: false,
    previewTags: true,
    previewThumbnail: true,
    previewIcons: true,
    filterBar: true,
    sort: 'descending',
    autoLocation: false,
    remoteSync: false,
    autoSync: false,
  },
  version: 1,
};

describe('JournalSettings recovery entry point', () => {
  it('opens the read-only recovery modal from the "Recover local pages" row', async () => {
    const { getByText, queryByTestId } = render(
      <JournalSettings
        journal={journal}
        pageCount={2}
        derivedKey={null}
        onClose={jest.fn()}
        onJournalChanged={jest.fn()}
      />,
    );
    await act(async () => {});

    // The modal stays closed until the user opens the tool.
    expect(queryByTestId('recover-modal')).toBeNull();

    fireEvent.press(getByText('Recover local pages'));

    expect(getByText('recover')).toBeTruthy();
  });
});
