import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Image } from 'react-native';
import { ImageCarousel } from '../ImageCarousel';
import type { Attachment } from 'canto-data';

const mockEnqueue = jest.fn();
const mockCancelAll = jest.fn();
const mockRetry = jest.fn();
const mockOnAutoLock = jest.fn();
let mockAutoLockCallback: (() => void) | undefined;
let mockLoadedImages: Record<string, string> = { 'img-1': 'data:image/jpeg;base64,abc' };
let mockFailedImages: Record<string, boolean> = {};

jest.mock('@/hooks/useImageQueue', () => ({
  useImageQueue: () => ({
    loadedImages: mockLoadedImages,
    loadingImages: {},
    failedImages: mockFailedImages,
    enqueue: mockEnqueue,
    cancelAll: mockCancelAll,
    prioritize: jest.fn(),
    retry: mockRetry,
  }),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        text: '#000',
        textSecondary: '#666',
        primary: '#007AFF',
        surface: '#fff',
        border: '#ccc',
        deleteAction: '#ff0000',
      },
      fonts: { regular: 'System' },
    },
  }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: {
      page: { decrypting: 'Decrypting...' },
      dataIntegrity: { retry: 'Retry' },
      a11y: {
        imageNofM: 'Image {n} of {m}',
        downloadImage: 'Download image',
        deleteImage: 'Delete image',
        moveLeft: 'Move left',
        moveRight: 'Move right',
      },
    },
  }),
}));

jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({ onAutoLock: mockOnAutoLock }),
}));

jest.mock('../ImageViewing', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="image-viewing-mock" />,
  };
});

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

const makeImage = (id: string): Attachment => ({
  id,
  path: `/images/${id}.jpg`,
  name: `${id}.jpg`,
  type: 'image',
  size: 512 * 1024,
  encrypted: false,
  deleted: false,
});

const defaultProps = {
  images: [makeImage('img-1')],
  editable: false,
  loadImage: jest.fn().mockResolvedValue('data:image/jpeg;base64,abc'),
};

describe('ImageCarousel', () => {
  beforeEach(() => {
    mockLoadedImages = { 'img-1': 'data:image/jpeg;base64,abc' };
    mockFailedImages = {};
    mockEnqueue.mockClear();
    mockCancelAll.mockClear();
    mockRetry.mockClear();
    mockOnAutoLock.mockImplementation((callback: () => void) => {
      mockAutoLockCallback = callback;
      return jest.fn();
    });
  });

  it('automatically queues a chunked original through the display materializer', () => {
    const image = {
      ...makeImage('chunked-image'),
      content: {
        format: 'canto-chunked-v1' as const,
        byteLength: 1,
        chunkSize: 512 * 1024,
        chunkCount: 1,
        generation: 'generation-1',
      },
    };

    render(<ImageCarousel {...defaultProps} images={[image]} />);

    expect(mockEnqueue).toHaveBeenCalledWith([image]);
  });

  it('renders a persisted import thumbnail while automatically loading a chunked original', () => {
    const image = {
      ...makeImage('chunked-preview'),
      content: {
        format: 'canto-chunked-v1' as const,
        byteLength: 1,
        chunkSize: 512 * 1024,
        chunkCount: 1,
        generation: 'generation-1',
      },
    };
    mockLoadedImages = {};

    const { UNSAFE_getAllByType, getByTestId } = render(
      <ImageCarousel {...defaultProps} images={[image]} thumbnail="dGh1bWJuYWls" />,
    );

    expect(mockEnqueue).toHaveBeenCalledWith([image]);
    expect(UNSAFE_getAllByType(Image)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          props: expect.objectContaining({
            source: { uri: 'data:image/jpeg;base64,dGh1bWJuYWls' },
          }),
        }),
      ]),
    );
    expect(getByTestId('carousel-image-chunked-preview')).toBeTruthy();
  });

  it('automatically queues unknown and oversized legacy originals', () => {
    const unknown = { ...makeImage('unknown'), size: undefined };
    const large = { ...makeImage('large'), size: 512 * 1024 + 1 };

    render(<ImageCarousel {...defaultProps} images={[unknown, large]} />);

    expect(mockEnqueue).toHaveBeenCalledWith([unknown, large]);
  });

  it('requeues when the attachment generation changes', () => {
    const first = {
      ...makeImage('same-id'),
      content: {
        format: 'canto-chunked-v1' as const,
        byteLength: 1,
        chunkSize: 1,
        chunkCount: 1,
        generation: 'old',
      },
    };
    const { rerender } = render(<ImageCarousel {...defaultProps} images={[first]} />);
    mockEnqueue.mockClear();

    rerender(
      <ImageCarousel
        {...defaultProps}
        images={[{ ...first, content: { ...first.content, generation: 'new' } }]}
      />,
    );

    expect(mockCancelAll).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it('cancels image materialization on auto-lock', () => {
    render(<ImageCarousel {...defaultProps} />);

    mockAutoLockCallback?.();

    expect(mockCancelAll).toHaveBeenCalled();
  });

  it('shows retry only for a materialization failure', () => {
    mockLoadedImages = {};
    mockFailedImages = { 'img-1': true };
    const { getByTestId, getByLabelText } = render(<ImageCarousel {...defaultProps} />);

    expect(getByTestId('carousel-retry-img-1')).toBeTruthy();
    fireEvent.press(getByLabelText('Retry'));
    expect(mockRetry).toHaveBeenCalledWith(defaultProps.images[0]);
  });

  it('renders download button when not editing and onDownload is provided', () => {
    const onDownload = jest.fn();
    const { getByLabelText } = render(<ImageCarousel {...defaultProps} onDownload={onDownload} />);

    expect(getByLabelText('Download image')).toBeTruthy();
  });

  it('hides download button when editing', () => {
    const onDownload = jest.fn();
    const { queryByLabelText } = render(
      <ImageCarousel {...defaultProps} editable={true} onDownload={onDownload} />,
    );

    expect(queryByLabelText('Download image')).toBeNull();
  });

  it('calls onDownload with the image when download button is pressed', () => {
    const onDownload = jest.fn();
    const { getByLabelText } = render(<ImageCarousel {...defaultProps} onDownload={onDownload} />);

    fireEvent.press(getByLabelText('Download image'));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledWith(defaultProps.images[0]);
  });

  it('shows delete button when editable', () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(
      <ImageCarousel {...defaultProps} editable={true} onRemove={onRemove} />,
    );

    expect(getByLabelText('Delete image')).toBeTruthy();
  });

  it('calls onRemove when delete button is pressed', () => {
    const onRemove = jest.fn();
    const { getByLabelText } = render(
      <ImageCarousel {...defaultProps} editable={true} onRemove={onRemove} />,
    );

    fireEvent.press(getByLabelText('Delete image'));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('img-1');
  });

  it('hides delete button when not editable', () => {
    const { queryByLabelText } = render(<ImageCarousel {...defaultProps} editable={false} />);

    expect(queryByLabelText('Delete image')).toBeNull();
  });

  it('filters out deleted images', () => {
    const images = [makeImage('img-1'), { ...makeImage('img-2'), deleted: true }];
    const { queryAllByLabelText } = render(<ImageCarousel {...defaultProps} images={images} />);

    // Only non-deleted images should have the image label
    const imageLabels = queryAllByLabelText(/Image \d+ of \d+/);
    expect(imageLabels).toHaveLength(1);
  });
});
