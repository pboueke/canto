import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => (
      <Text testID="markdown">{children}</Text>
    ),
  };
});

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
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
        fontScale: 1.0,
      },
      borderWidth: 1,
    },
  }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: {
      page: { placeholder: 'Start writing...' },
    },
  }),
}));

import { PageContent } from '../PageContent';

describe('PageContent', () => {
  it('renders the TextInput when isEditing is true', () => {
    const { getByPlaceholderText } = render(<PageContent content="" isEditing={true} />);

    expect(getByPlaceholderText('Start writing...')).toBeTruthy();
  });

  it('renders Markdown component when isEditing is false', () => {
    const { getByTestId } = render(<PageContent content="hello world" isEditing={false} />);

    expect(getByTestId('markdown')).toBeTruthy();
  });
});
