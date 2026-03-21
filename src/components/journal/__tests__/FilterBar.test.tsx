import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
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
        filterRow: '#f5f5f5',
        error: '#ff0000',
        tag: { active: '#007AFF' },
      },
      fonts: { regular: 'System', bold: 'System-Bold', light: 'System-Light' },
    },
  }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: {
      filterBar: { searchPlaceholder: 'Search...', from: 'From', to: 'To' },
      a11y: {
        searchPages: 'Search pages',
        clearSearch: 'Clear search',
        filterButton: 'Filter',
      },
    },
  }),
}));

jest.mock('@/styles/web', () => ({
  webModalContent: {},
}));

jest.mock('../FilterModal', () => ({
  FilterModal: () => null,
}));

import { FilterBar } from '../FilterBar';
import type { Filter } from '@/data';

function makeFilter(overrides?: Partial<Filter>): Filter {
  return {
    query: '',
    dateStart: undefined,
    dateEnd: undefined,
    properties: {
      hasFile: false,
      hasImage: false,
      hasComments: false,
      hasLocation: false,
      tags: [],
    },
    ...overrides,
  };
}

const defaultProps = {
  filter: makeFilter(),
  isActive: false,
  availableTags: [],
  onSetQuery: jest.fn(),
  onSetDateStart: jest.fn(),
  onSetDateEnd: jest.fn(),
  onToggleProperty: jest.fn(),
  onToggleTag: jest.fn(),
  onClearFilters: jest.fn(),
};

describe('FilterBar debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it('debounces query changes (not immediate)', () => {
    const onSetQuery = jest.fn();
    const { getByLabelText } = render(<FilterBar {...defaultProps} onSetQuery={onSetQuery} />);

    fireEvent.changeText(getByLabelText('Search pages'), 'hello');

    // Should not fire immediately
    expect(onSetQuery).not.toHaveBeenCalled();

    // After debounce delay
    act(() => jest.advanceTimersByTime(200));
    expect(onSetQuery).toHaveBeenCalledWith('hello');
  });

  it('fast typing fires only one update after debounce settles', () => {
    const onSetQuery = jest.fn();
    const { getByLabelText } = render(<FilterBar {...defaultProps} onSetQuery={onSetQuery} />);

    const input = getByLabelText('Search pages');
    fireEvent.changeText(input, 'h');
    fireEvent.changeText(input, 'he');
    fireEvent.changeText(input, 'hel');
    fireEvent.changeText(input, 'help');

    act(() => jest.advanceTimersByTime(200));

    expect(onSetQuery).toHaveBeenCalledTimes(1);
    expect(onSetQuery).toHaveBeenCalledWith('help');
  });

  it('clearing input fires immediately (no debounce)', () => {
    const onSetQuery = jest.fn();
    const filter = makeFilter({ query: 'test' });
    const { getByLabelText } = render(
      <FilterBar {...defaultProps} filter={filter} onSetQuery={onSetQuery} />,
    );

    fireEvent.press(getByLabelText('Clear search'));

    // Should fire immediately without waiting for debounce
    expect(onSetQuery).toHaveBeenCalledWith('');
  });

  it('syncs local query when external filter.query changes', () => {
    const { getByLabelText, rerender } = render(<FilterBar {...defaultProps} />);

    // Re-render with external query change
    rerender(<FilterBar {...defaultProps} filter={makeFilter({ query: 'external' })} />);

    const input = getByLabelText('Search pages');
    expect(input.props.value).toBe('external');
  });
});
