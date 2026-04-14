import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        text: '#000',
        textSecondary: '#666',
        primary: '#007AFF',
        surface: '#f5f5f5',
        border: '#ccc',
      },
      fonts: { regular: 'System', bold: 'System-Bold' },
    },
  }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: {
      calendar: {
        anniversaryRow: '{count} pages celebrating an anniversary today',
        anniversaryRowOne: '1 page celebrating an anniversary today',
        anniversaryRowZero: 'No anniversaries today',
      },
    },
  }),
}));

jest.mock('@/styles/themes', () => ({
  getContrastText: () => '#fff',
}));

import { AnniversaryRow } from '../AnniversaryRow';

describe('AnniversaryRow', () => {
  it('renders count-aware copy when count > 1', () => {
    const { getByText } = render(<AnniversaryRow count={3} onPress={jest.fn()} />);
    expect(getByText('3 pages celebrating an anniversary today')).toBeTruthy();
  });

  it('renders singular copy when count === 1', () => {
    const { getByText } = render(<AnniversaryRow count={1} onPress={jest.fn()} />);
    expect(getByText('1 page celebrating an anniversary today')).toBeTruthy();
  });

  it('renders zero copy when count === 0', () => {
    const { getByText } = render(<AnniversaryRow count={0} onPress={jest.fn()} />);
    expect(getByText('No anniversaries today')).toBeTruthy();
  });

  it('fires onPress when count > 0', () => {
    const onPress = jest.fn();
    const { getByText } = render(<AnniversaryRow count={3} onPress={onPress} />);
    fireEvent.press(getByText('3 pages celebrating an anniversary today'));
    expect(onPress).toHaveBeenCalled();
  });

  it('does not fire onPress when count === 0 (disabled)', () => {
    const onPress = jest.fn();
    const { getByText } = render(<AnniversaryRow count={0} onPress={onPress} />);
    fireEvent.press(getByText('No anniversaries today'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
