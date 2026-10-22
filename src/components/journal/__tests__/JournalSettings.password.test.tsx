import React from 'react';
import { act, render } from '@testing-library/react-native';
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
const mockListDrafts = jest.fn(async (_id: string): Promise<string[]> => []);
const mockVerify = jest.fn();
const mockTryLoadJournal = jest.fn();
const mockReencrypt = jest.fn();
const mockDeriveAndCache = jest.fn();
const mockSetKey = jest.fn();
const mockClearKey = jest.fn();
let mockPasswordProps: {
  onSubmit: (current?: string, next?: string, iterations?: number) => Promise<unknown>;
} | null = null;
jest.mock('@/hooks/useStorage', () => ({
  useDeleteJournal: () => ({ deleteJournal: jest.fn() }),
  useSaveJournal: () => ({ saveJournalMetadata: jest.fn(), saving: false }),
  getEncryptionService: () => ({ generateSalt: () => new Uint8Array(16).fill(1) }),
  getLocalStore: async () => ({ reencryptJournal: mockReencrypt }),
  tryLoadJournal: (...args: unknown[]) => mockTryLoadJournal(...args),
  listDrafts: (id: string) => mockListDrafts(id),
  verifyJournalKey: (...args: unknown[]) => mockVerify(...args),
}));
jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({
    deriveAndCache: mockDeriveAndCache,
    setKey: mockSetKey,
    clearKey: mockClearKey,
    touchActivity: jest.fn(),
  }),
}));
jest.mock('@/contexts/SyncManagerContext', () => ({ useSyncManager: () => ({ manager: null }) }));
jest.mock('@/components/common/IconPicker', () => ({ IconPicker: () => null }));
jest.mock('@/components/home/ThemePickerModal', () => ({ ThemePickerModal: () => null }));
jest.mock('../ConfirmDeleteModal', () => ({ ConfirmDeleteModal: () => null }));
jest.mock('../ChangePasswordModal', () => ({
  ChangePasswordModal: (props: NonNullable<typeof mockPasswordProps>) => {
    mockPasswordProps = props;
    return null;
  },
}));
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
  secure: true,
  salt: 'c2FsdA==',
  kdfIterations: 1000,
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

const t = require('@/i18n/dictionaries').dictionaries.en;
const workingKey = new Uint8Array(32).fill(4);

async function renderSettings() {
  render(
    <JournalSettings
      journal={journal}
      pageCount={1}
      derivedKey={workingKey}
      onClose={jest.fn()}
      onJournalChanged={jest.fn()}
    />,
  );
  await act(async () => {});
}

describe('JournalSettings password change', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDrafts.mockResolvedValue([]);
  });

  // Reviewer finding 6: a wrong current password must never replace the
  // working key, and must read as a wrong password.
  it('verifies the current password with an uncached trial key', async () => {
    mockVerify.mockResolvedValue('invalid');
    await renderSettings();
    await expect(mockPasswordProps!.onSubmit('wrong', 'new-password', 1000)).rejects.toThrow(
      t.home.wrongPassword,
    );
    expect(mockDeriveAndCache).not.toHaveBeenCalled();
    expect(mockSetKey).not.toHaveBeenCalled();
    expect(mockClearKey).not.toHaveBeenCalled();
    const trialKey = mockVerify.mock.calls[0][1] as Uint8Array;
    // The trial key is released after use.
    expect(trialKey.every((byte) => byte === 0)).toBe(true);
    expect(mockReencrypt).not.toHaveBeenCalled();
  });

  it('treats an unverifiable password as wrong', async () => {
    mockVerify.mockResolvedValue('unverifiable');
    await renderSettings();
    await expect(mockPasswordProps!.onSubmit('maybe', undefined)).rejects.toThrow(
      t.home.wrongPassword,
    );
  });

  // Reviewer finding 3: drafts are tied to the current password.
  it('refuses to change the password while encrypted drafts exist', async () => {
    mockListDrafts.mockResolvedValue(['p1']);
    await renderSettings();
    await expect(mockPasswordProps!.onSubmit('current', 'next')).rejects.toThrow(
      t.journalSettings.draftsPending,
    );
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockReencrypt).not.toHaveBeenCalled();
  });

  it('re-encrypts with the new key once the current password verifies', async () => {
    mockVerify.mockResolvedValue('valid');
    mockTryLoadJournal.mockResolvedValue({ ...journal, pages: [] });
    mockDeriveAndCache.mockResolvedValue(new Uint8Array(32).fill(6));
    mockReencrypt.mockResolvedValue({ skippedAttachments: [] });
    await renderSettings();
    await act(async () => {
      await mockPasswordProps!.onSubmit('current', 'next', 1000);
    });
    expect(mockReencrypt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'j1', secure: true }),
      workingKey,
      expect.any(Uint8Array),
      expect.any(Function),
    );
  });
});
