import React from 'react';
import { render } from '@testing-library/react-native';

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
  });

  it('applies scale=1.3 to markdown body fontSize when viewing', () => {
    mockScale.value = 1.3;
    const { getByTestId } = render(<PageContent content="hi" isEditing={false} />);
    expect(getByTestId('markdown').props.children).toBe(`fontSize=${14 * 1.3}|hi`);
  });

  it('applies scale to TextInput fontSize when editing', () => {
    mockScale.value = 1.3;
    const { getByPlaceholderText } = render(<PageContent content="" isEditing={true} />);
    const input = getByPlaceholderText('Start writing...');
    const style = Array.isArray(input.props.style)
      ? Object.assign({}, ...input.props.style)
      : input.props.style;
    expect(style.fontSize).toBe(14 * 1.3);
    expect(style.lineHeight).toBe(22 * 1.3);
  });
});
