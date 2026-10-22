import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { JournalContent, Page } from 'canto-data';
import { RecoverPagesModal } from '../RecoverPagesModal';
import { StorageIntegrityError } from '@/lib/storage/integrity';

const mockScan = jest.fn();
const mockRestore = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@/styles/web', () => ({ webModalContent: {} }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#fff',
        surface: '#fff',
        text: '#111',
        textSecondary: '#666',
        border: '#ccc',
        primary: '#000',
        error: '#d00',
        buttonCancel: '#eee',
        buttonDisabled: '#ddd',
      },
      fonts: { regular: 'System', bold: 'System' },
      borderWidth: 1,
    },
  }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: require('@/i18n/dictionaries').dictionaries.en }),
}));
jest.mock('@/styles/themes', () => ({ getContrastText: () => '#fff' }));
jest.mock('@/hooks/useStorage', () => ({
  getLocalStore: () =>
    Promise.resolve({ scanJournalPages: mockScan, restoreJournalCatalog: mockRestore }),
}));

const dictionaries = require('@/i18n/dictionaries').dictionaries;

const metadata: Omit<JournalContent, 'pages'> = {
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

const pages: Page[] = [
  {
    id: 'p1',
    text: 'content',
    date: '2026-03-12T10:00:00Z',
    tags: [],
    files: [],
    images: [],
    comments: [],
    modified: 1,
    deleted: false,
  },
];

describe('RecoverPagesModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scans read-only, shows the recoverable count, then restores only after confirmation', async () => {
    mockScan.mockResolvedValue({ journalId: 'j1', pageCount: 3, pages });
    mockRestore.mockResolvedValue(undefined);
    const onClose = jest.fn();
    const onRecovered = jest.fn();
    const { getByText } = render(
      <RecoverPagesModal visible journal={metadata} onClose={onClose} onRecovered={onRecovered} />,
    );

    await waitFor(() => expect(getByText('Recoverable pages found: 3')).toBeTruthy());
    // Opening the modal only scans; nothing is published before confirmation.
    expect(mockScan).toHaveBeenCalledWith('j1', undefined);
    expect(mockRestore).not.toHaveBeenCalled();
    expect(onRecovered).not.toHaveBeenCalled();

    fireEvent.press(getByText(dictionaries.en.journalSettings.recoverConfirm));

    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith('j1', undefined));
    expect(onRecovered).toHaveBeenCalledTimes(1);
    expect(getByText(dictionaries.en.journalSettings.recoverSuccess)).toBeTruthy();
  });

  it('shows a localized failure and never restores when the scan is incomplete', async () => {
    mockScan.mockRejectedValue(new StorageIntegrityError('CATALOG_UNREADABLE', 'unreadable'));
    const { getByText, queryByText } = render(
      <RecoverPagesModal visible journal={metadata} onClose={jest.fn()} onRecovered={jest.fn()} />,
    );

    await waitFor(() =>
      expect(getByText(dictionaries.en.journalSettings.recoverIncomplete)).toBeTruthy(),
    );
    expect(queryByText('unreadable')).toBeNull();
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('maps a locked journal to the localized unlock message', async () => {
    mockScan.mockRejectedValue(new StorageIntegrityError('JOURNAL_LOCKED', 'locked'));
    const { getByText } = render(
      <RecoverPagesModal visible journal={metadata} onClose={jest.fn()} onRecovered={jest.fn()} />,
    );

    await waitFor(() =>
      expect(getByText(dictionaries.en.journalSettings.recoverLocked)).toBeTruthy(),
    );
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('cancels without restoring', async () => {
    mockScan.mockResolvedValue({ journalId: 'j1', pageCount: 1, pages });
    const onClose = jest.fn();
    const { getByText } = render(
      <RecoverPagesModal visible journal={metadata} onClose={onClose} onRecovered={jest.fn()} />,
    );

    await waitFor(() => expect(getByText('Recoverable pages found: 1')).toBeTruthy());
    fireEvent.press(getByText(dictionaries.en.common.cancel));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockRestore).not.toHaveBeenCalled();
  });
});
