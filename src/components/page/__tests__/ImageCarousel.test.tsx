import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ImageCarousel } from '../ImageCarousel';
import type { Attachment } from 'canto-data';

jest.mock('@/hooks/useImageQueue', () => ({
  useImageQueue: () => ({
    loadedImages: { 'img-1': 'data:image/jpeg;base64,abc' },
    loadingImages: {},
    enqueue: jest.fn(),
    cancelAll: jest.fn(),
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
  encrypted: false,
  deleted: false,
});

const defaultProps = {
  images: [makeImage('img-1')],
  editable: false,
  loadImage: jest.fn().mockResolvedValue('data:image/jpeg;base64,abc'),
};

describe('ImageCarousel', () => {
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
