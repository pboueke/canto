/**
 * Accessibility audit: verify key interactive components have accessibility labels.
 * Tests components that can share the same mock setup.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/styles/web', () => ({
  webModalContent: {},
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
        primary: '#007AFF',
        surface: '#fff',
        foreground: '#fff',
        border: '#ccc',
        buttonSubmit: '#007AFF',
        filterRow: '#f5f5f5',
        error: '#ff0000',
        deleteAction: '#ff0000',
        tag: { add: '#eee', text: '#333', background: '#f0f0f0', active: '#007AFF' },
      },
      fonts: { regular: 'System', bold: 'System-Bold', serif: 'Georgia', light: 'System-Light' },
      borderWidth: 1,
    },
  }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: {
      page: { addTag: 'Add Tag', newTag: 'New tag...', decrypting: 'Decrypting...' },
      filterBar: { searchPlaceholder: 'Search...', from: 'From', to: 'To' },
      a11y: {
        imageNofM: 'Image {n} of {m}',
        downloadImage: 'Download image',
        deleteImage: 'Delete image',
        moveLeft: 'Move left',
        moveRight: 'Move right',
        searchPages: 'Search pages',
        clearSearch: 'Clear search',
        filterButton: 'Filter',
        fileAttachment: 'File attachment',
        deleteFile: 'Delete file',
        pageEntry: 'Page entry',
      },
    },
  }),
}));

jest.mock('@/hooks/useStorage', () => ({
  useAttachment: () => ({ getAttachment: jest.fn().mockResolvedValue(null) }),
}));

jest.mock('@/hooks/useImageQueue', () => ({
  useImageQueue: () => ({
    loadedImages: {},
    loadingImages: {},
    enqueue: jest.fn(),
    cancelAll: jest.fn(),
  }),
  enqueueThumbnail: jest.fn(),
}));

jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({ getKey: jest.fn().mockReturnValue(undefined) }),
}));

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/journal/FilterModal', () => ({
  FilterModal: () => null,
}));

jest.mock('@/components/page/ImageViewing', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View /> };
});

import { FloatingActionButton } from '@/components/common/FloatingActionButton';
import { FilterBar } from '@/components/journal/FilterBar';
import { PageListItem } from '@/components/journal/PageListItem';

describe('Accessibility labels', () => {
  describe('FloatingActionButton', () => {
    it('renders without crashing (documents missing accessibilityLabel)', () => {
      const { UNSAFE_root } = render(
        <FloatingActionButton
          featherIcon="plus"
          onPress={() => {}}
          backgroundColor="#007AFF"
          color="#fff"
        />,
      );
      // FAB currently lacks accessibilityLabel — this test documents the gap
      expect(UNSAFE_root).toBeTruthy();
    });
  });

  describe('FilterBar', () => {
    it('search input has accessibilityLabel', () => {
      const { getByLabelText } = render(
        <FilterBar
          filter={{
            query: '',
            properties: {
              hasFile: false,
              hasImage: false,
              hasComments: false,
              hasLocation: false,
              tags: [],
            },
          }}
          isActive={false}
          availableTags={[]}
          onSetQuery={() => {}}
          onSetDateStart={() => {}}
          onSetDateEnd={() => {}}
          onToggleProperty={() => {}}
          onToggleTag={() => {}}
          onClearFilters={() => {}}
        />,
      );

      expect(getByLabelText('Search pages')).toBeTruthy();
    });

    it('filter button has accessibilityLabel and role', () => {
      const { getByLabelText } = render(
        <FilterBar
          filter={{
            query: '',
            properties: {
              hasFile: false,
              hasImage: false,
              hasComments: false,
              hasLocation: false,
              tags: [],
            },
          }}
          isActive={false}
          availableTags={[]}
          onSetQuery={() => {}}
          onSetDateStart={() => {}}
          onSetDateEnd={() => {}}
          onToggleProperty={() => {}}
          onToggleTag={() => {}}
          onClearFilters={() => {}}
        />,
      );

      const filterBtn = getByLabelText('Filter');
      expect(filterBtn).toBeTruthy();
      expect(filterBtn.props.accessibilityRole).toBe('button');
    });
  });

  describe('PageListItem', () => {
    it('card has accessible label with page info', () => {
      const { getByLabelText } = render(
        <PageListItem
          page={{
            id: 'p1',
            date: '2026-03-15T14:30:00.000Z',
            previewText: 'Test text',
            searchText: 'test text',
            tags: [],
            hasAttachment: false,
            hasImage: false,
            hasLocation: false,
            hasComments: false,
          }}
          journalId="j1"
        />,
      );

      expect(getByLabelText(/Page entry/)).toBeTruthy();
    });
  });
});
