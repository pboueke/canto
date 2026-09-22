import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { JournalContent } from 'canto-data';
import { ExportJournalModal } from '../ExportJournalModal';

const mockGetJournal = jest.fn();
const mockExportJournal = jest.fn();

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
  useI18n: () => ({ t: require('@/i18n/dictionaries').dictionaries.en }),
}));
jest.mock('@/hooks/useStorage', () => ({
  getLocalStore: () => Promise.resolve({ getJournal: mockGetJournal }),
}));
jest.mock('@/lib/backup', () => {
  const { ExportError } = jest.requireActual('@/lib/backup');
  return {
    exportJournal: (...args: unknown[]) => mockExportJournal(...args),
    ExportError,
    isExportError: (err: unknown) => err instanceof ExportError,
  };
});

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

describe('ExportJournalModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads full pages only after Export is confirmed', async () => {
    const fullJournal: JournalContent = { ...metadata, pages: [] };
    mockGetJournal.mockResolvedValue(fullJournal);
    mockExportJournal.mockResolvedValue(undefined);
    const onClose = jest.fn();
    const { getByText } = render(
      <ExportJournalModal visible journal={metadata} onClose={onClose} />,
    );

    expect(mockGetJournal).not.toHaveBeenCalled();
    fireEvent.press(getByText('Export'));

    await waitFor(() => expect(mockGetJournal).toHaveBeenCalledWith('j1', undefined));
    expect(mockExportJournal).toHaveBeenCalledWith(
      fullJournal,
      false,
      undefined,
      expect.any(Function),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a translated error without exposing exporter internals', async () => {
    mockGetJournal.mockResolvedValue({ ...metadata, pages: [] });
    mockExportJournal.mockRejectedValue(new Error('token=secret disk failure'));
    const { getByText, queryByText } = render(
      <ExportJournalModal visible journal={metadata} onClose={jest.fn()} />,
    );

    fireEvent.press(getByText('Export'));

    await waitFor(() => expect(getByText('Export failed')).toBeTruthy());
    expect(queryByText('token=secret disk failure')).toBeNull();
  });

  it('maps unreadable journal data to the localized integrity message', async () => {
    const { ExportError } = jest.requireActual('@/lib/backup');
    mockGetJournal.mockResolvedValue({ ...metadata, pages: [] });
    mockExportJournal.mockRejectedValue(new ExportError('integrity', 'unreadable'));
    const { getByText } = render(
      <ExportJournalModal visible journal={metadata} onClose={jest.fn()} />,
    );

    fireEvent.press(getByText('Export'));

    await waitFor(() =>
      expect(
        getByText('Some journal data could not be read. No files were changed or deleted.'),
      ).toBeTruthy(),
    );
  });

  it('maps archive construction failures to the localized archive message', async () => {
    const { ExportError } = jest.requireActual('@/lib/backup');
    mockGetJournal.mockResolvedValue({ ...metadata, pages: [] });
    mockExportJournal.mockRejectedValue(new ExportError('archive', 'disk full'));
    const { getByText } = render(
      <ExportJournalModal visible journal={metadata} onClose={jest.fn()} />,
    );

    fireEvent.press(getByText('Export'));

    await waitFor(() =>
      expect(
        getByText(
          'The backup archive could not be created. Check available storage and try again.',
        ),
      ).toBeTruthy(),
    );
  });

  it('maps native share failures to the localized share message', async () => {
    const { ExportError } = jest.requireActual('@/lib/backup');
    mockGetJournal.mockResolvedValue({ ...metadata, pages: [] });
    mockExportJournal.mockRejectedValue(new ExportError('share', 'no activity'));
    const { getByText } = render(
      <ExportJournalModal visible journal={metadata} onClose={jest.fn()} />,
    );

    fireEvent.press(getByText('Export'));

    await waitFor(() =>
      expect(
        getByText('The backup was created but could not be shared. Please try again.'),
      ).toBeTruthy(),
    );
  });

  it('maps a storage-integrity journal load failure to the localized integrity message', async () => {
    const { StorageIntegrityError } = jest.requireActual('@/lib/storage/integrity');
    mockGetJournal.mockRejectedValue(new StorageIntegrityError('JOURNAL_UNREADABLE', 'nope'));
    const { getByText } = render(
      <ExportJournalModal visible journal={metadata} onClose={jest.fn()} />,
    );

    fireEvent.press(getByText('Export'));

    await waitFor(() =>
      expect(
        getByText('Some journal data could not be read. No files were changed or deleted.'),
      ).toBeTruthy(),
    );
  });
});
