import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      style,
    }: {
      children: React.ReactNode;
      style: { body: { fontSize: number } };
    }) => (
      <Text testID="markdown" data-fontsize={style?.body?.fontSize}>
        {`fontSize=${style?.body?.fontSize}|${children}`}
      </Text>
    ),
  };
});

const themeWithScale = (scale: number) => ({
  colors: {
    text: '#000',
    textSecondary: '#666',
    foreground: '#fff',
    border: '#ccc',
    primary: '#007AFF',
    markdown: {
      text: '#000',
      codeBackground: '#f5f5f5',
      quote: '#f0f0f0',
    },
  },
  fonts: {
    serif: 'System',
    serifBold: 'System-Bold',
    fontScale: scale,
  },
  borderWidth: 1,
});

const mockScale = { value: 1.0 };
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: themeWithScale(mockScale.value) }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: { page: { placeholder: 'Start writing...' } } }),
}));

import { PageContent } from '../PageContent';

describe('PageContent font scaling', () => {
  it('applies scale=1.0 to markdown body fontSize when viewing', () => {
    mockScale.value = 1.0;
    const { getByTestId } = render(<PageContent content="hi" isEditing={false} />);
    expect(getByTestId('markdown').props.children).toBe('fontSize=14|hi');
    expect(StyleSheet.flatten(getByTestId('page-content-viewer').props.style).minHeight).toBe(
      22 * 4,
    );
  });

  it('applies scale=1.3 to markdown body fontSize when viewing', () => {
    mockScale.value = 1.3;
    const { getByTestId } = render(<PageContent content="hi" isEditing={false} />);
    expect(getByTestId('markdown').props.children).toBe(`fontSize=${14 * 1.3}|hi`);
    expect(
      StyleSheet.flatten(getByTestId('page-content-viewer').props.style).minHeight,
    ).toBeCloseTo(22 * 1.3 * 4);
  });

  it('reconciles TextInput typography and minimum height when scale changes', () => {
    mockScale.value = 1.0;
    const view = render(<PageContent content="" isEditing={true} />);

    mockScale.value = 1.3;
    view.rerender(<PageContent content="" isEditing={true} />);

    const input = view.getByPlaceholderText('Start writing...');
    const style = StyleSheet.flatten(input.props.style);
    expect(style.fontSize).toBeCloseTo(14 * 1.3);
    expect(style.lineHeight).toBeCloseTo(22 * 1.3);
    expect(style.minHeight).toBeCloseTo(22 * 1.3 * 16);
    expect(style.height).toBeCloseTo(22 * 1.3 * 16);
  });
});
