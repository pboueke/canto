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
        primary: '#007AFF',
        surface: '#fff',
        border: '#ccc',
      },
      fonts: { regular: 'System', bold: 'System-Bold' },
    },
  }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ lang: 'en' }),
}));

import { MonthPreview } from '../MonthPreview';

describe('MonthPreview', () => {
  it('renders the localized month label', () => {
    const { getByText } = render(
      <MonthPreview year={2025} month={3} daysWithPages={new Set()} onPress={jest.fn()} />,
    );
    expect(getByText(/April 2025/)).toBeTruthy();
  });

  it('renders days 1..N for the month (April = 30)', () => {
    const { getByText } = render(
      <MonthPreview year={2026} month={3} daysWithPages={new Set()} onPress={jest.fn()} />,
    );
    expect(getByText('1')).toBeTruthy();
    expect(getByText('30')).toBeTruthy();
  });

  it('February leap year (2024) renders 29 day cells', () => {
    const { getByText, queryByText } = render(
      <MonthPreview year={2024} month={1} daysWithPages={new Set()} onPress={jest.fn()} />,
    );
    expect(getByText('29')).toBeTruthy();
    expect(queryByText('30')).toBeNull();
  });

  it('highlights days in daysWithPages and not others', () => {
    const { getByTestId, queryByTestId } = render(
      <MonthPreview year={2026} month={3} daysWithPages={new Set([5, 14])} onPress={jest.fn()} />,
    );
    expect(getByTestId('month-cell-2026-3-5-highlight')).toBeTruthy();
    expect(getByTestId('month-cell-2026-3-14-highlight')).toBeTruthy();
    expect(queryByTestId('month-cell-2026-3-6-highlight')).toBeNull();
    expect(getByTestId('month-cell-2026-3-6')).toBeTruthy();
  });

  it('onPress fires with {year, month} payload', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <MonthPreview year={2026} month={3} daysWithPages={new Set()} onPress={onPress} />,
    );
    fireEvent.press(getByTestId('month-preview-2026-3'));
    expect(onPress).toHaveBeenCalledWith({ year: 2026, month: 3 });
  });

  it('April 2026 starts on Wednesday (3 leading blanks)', () => {
    const { getByTestId } = render(
      <MonthPreview year={2026} month={3} daysWithPages={new Set()} onPress={jest.fn()} />,
    );
    expect(getByTestId('month-cell-2026-3-blank-0')).toBeTruthy();
    expect(getByTestId('month-cell-2026-3-blank-1')).toBeTruthy();
    expect(getByTestId('month-cell-2026-3-blank-2')).toBeTruthy();
  });
});
