import React from 'react';
import { render } from '@testing-library/react-native';

const mockGetKey = jest.fn();
const mockGetAttachment = jest.fn();
const mockEnqueueThumbnail = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        text: '#000',
        textSecondary: '#666',
        foreground: '#fff',
        border: '#ccc',
        tag: { background: '#eee', text: '#333' },
      },
      fonts: { regular: 'System', bold: 'System-Bold', serif: 'Georgia', light: 'System-Light' },
      borderWidth: 1,
    },
  }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: {
      a11y: { pageEntry: 'Page entry' },
    },
  }),
}));

jest.mock('@/hooks/useStorage', () => ({
  useAttachment: () => ({
    getAttachment: (...args: unknown[]) => mockGetAttachment(...args),
  }),
}));

jest.mock('@/hooks/useImageQueue', () => ({
  enqueueThumbnail: (...args: unknown[]) => mockEnqueueThumbnail(...args),
}));

jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({
    getKey: (...args: unknown[]) => mockGetKey(...args),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { PageListItem } from '../PageListItem';
import type { ListPagePreview } from '@/lib/pagePreview';

function makePagePreview(overrides?: Partial<ListPagePreview>): ListPagePreview {
  return {
    id: 'p1',
    date: '2026-03-15T14:30:00.000Z',
    previewText: 'Hello world preview text',
    searchText: 'hello world preview text',
    tags: ['test'],
    hasAttachment: false,
    hasImage: false,
    hasLocation: false,
    hasComments: false,
    ...overrides,
  };
}

describe('PageListItem', () => {
  beforeEach(() => {
    mockGetKey.mockReset().mockReturnValue(undefined);
    mockGetAttachment.mockReset().mockResolvedValue(null);
    mockEnqueueThumbnail.mockReset().mockReturnValue(jest.fn());
  });

  it('loads a password-protected thumbnail with the journal key', async () => {
    let loadThumbnail: (() => Promise<string | null>) | undefined;
    mockEnqueueThumbnail.mockImplementation((_id, load) => {
      loadThumbnail = load;
      return jest.fn();
    });
    mockGetAttachment.mockResolvedValue('image-data');
    const preview = makePagePreview({
      hasImage: true,
      firstImage: 'canto/j1/attachments/i-image.jpg',
      firstImageEncrypted: true,
      firstImageSize: 1024,
    });
    render(<PageListItem page={preview} journalId="j1" />);

    await loadThumbnail!();
    expect(mockGetAttachment).toHaveBeenCalledWith('canto/j1/attachments/i-image.jpg', true);
  });

  it('does not enqueue a thumbnail read for an unknown-size legacy original', () => {
    render(
      <PageListItem
        page={makePagePreview({
          hasImage: true,
          firstImage: 'canto/j1/attachments/legacy-image.jpg',
        })}
        journalId="j1"
      />,
    );

    expect(mockEnqueueThumbnail).not.toHaveBeenCalled();
  });

  it('does not enqueue a thumbnail read for an oversized legacy original', () => {
    render(
      <PageListItem
        page={makePagePreview({
          hasImage: true,
          firstImage: 'canto/j1/attachments/legacy-image.jpg',
          firstImageSize: 512 * 1024 + 1,
        })}
        journalId="j1"
      />,
    );

    expect(mockEnqueueThumbnail).not.toHaveBeenCalled();
  });

  it('does not enqueue a thumbnail read for a chunked original', () => {
    render(
      <PageListItem
        page={makePagePreview({
          hasImage: true,
          firstImage: 'canto/j1/attachments/chunk-root',
          firstImageChunked: true,
        })}
        journalId="j1"
      />,
    );

    expect(mockEnqueueThumbnail).not.toHaveBeenCalled();
    expect(mockGetAttachment).not.toHaveBeenCalled();
  });

  it('retries thumbnail loading after the journal key becomes available', () => {
    const preview = makePagePreview({
      hasImage: true,
      firstImage: 'canto/j1/attachments/i-image.jpg',
      firstImageSize: 1024,
    });
    const { rerender } = render(<PageListItem page={preview} journalId="j1" />);
    expect(mockEnqueueThumbnail).toHaveBeenCalledTimes(1);

    mockGetKey.mockReturnValue(new Uint8Array(32));
    rerender(<PageListItem page={preview} journalId="j1" />);

    expect(mockEnqueueThumbnail).toHaveBeenCalledTimes(2);
  });

  it('renders date and preview text', () => {
    const page = makePagePreview();
    const { getByText } = render(<PageListItem page={page} journalId="j1" />);

    expect(getByText('Hello world preview text')).toBeTruthy();
  });

  it('renders tags when previewTags is enabled', () => {
    const page = makePagePreview({ tags: ['react', 'native'] });
    const { getByText } = render(
      <PageListItem
        page={page}
        journalId="j1"
        settings={{
          previewTags: true,
          previewThumbnail: false,
          previewIcons: true,
          use24h: false,
          filterBar: true,
          sort: 'descending',
          autoLocation: false,
          remoteSync: false,
          autoSync: false,
        }}
      />,
    );

    expect(getByText(/react/)).toBeTruthy();
    expect(getByText(/native/)).toBeTruthy();
  });

  it('hides tags when previewTags is disabled', () => {
    const page = makePagePreview({ tags: ['hidden'] });
    const { queryByText } = render(
      <PageListItem
        page={page}
        journalId="j1"
        settings={{
          previewTags: false,
          previewThumbnail: false,
          previewIcons: true,
          use24h: false,
          filterBar: true,
          sort: 'descending',
          autoLocation: false,
          remoteSync: false,
          autoSync: false,
        }}
      />,
    );

    expect(queryByText('hidden')).toBeNull();
  });

  it('truncates long preview text to one line', () => {
    const longText = 'A'.repeat(500);
    const page = makePagePreview({ previewText: longText });
    const { getByText } = render(<PageListItem page={page} journalId="j1" />);

    const previewElement = getByText(longText);
    expect(previewElement.props.numberOfLines).toBe(1);
  });

  it('has accessible label with date and preview', () => {
    const page = makePagePreview();
    const { getByLabelText } = render(<PageListItem page={page} journalId="j1" />);

    expect(getByLabelText(/Page entry/)).toBeTruthy();
  });
});
