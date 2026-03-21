import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        text: '#000',
        textSecondary: '#666',
        foreground: '#fff',
        border: '#ccc',
        buttonSubmit: '#007AFF',
        tag: { add: '#eee', text: '#333', background: '#f0f0f0' },
      },
      fonts: { regular: 'System', bold: 'System-Bold' },
      borderWidth: 1,
    },
  }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: {
      page: { addTag: 'Add Tag', newTag: 'New tag...' },
    },
  }),
}));

jest.mock('@/styles/web', () => ({
  webModalContent: {},
}));

import { TagEditor } from '../TagEditor';

describe('TagEditor normalization', () => {
  it('deduplicates mixed-case tags on render', () => {
    const onChange = jest.fn();
    const { queryAllByText } = render(
      <TagEditor
        tags={['Python', 'python']}
        allJournalTags={[]}
        editable={true}
        onChange={onChange}
      />,
    );

    // Should only render one "python" tag (normalized to lowercase)
    const pythonTags = queryAllByText(/python/);
    expect(pythonTags).toHaveLength(1);
  });

  it('normalizes whitespace in tags', () => {
    const onChange = jest.fn();
    const { queryAllByText } = render(
      <TagEditor
        tags={[' react ', 'react']}
        allJournalTags={[]}
        editable={true}
        onChange={onChange}
      />,
    );

    const reactTags = queryAllByText(/react/);
    expect(reactTags).toHaveLength(1);
  });

  it('renders nothing when not editable and tags are empty', () => {
    const onChange = jest.fn();
    const { toJSON } = render(
      <TagEditor tags={[]} allJournalTags={[]} editable={false} onChange={onChange} />,
    );

    expect(toJSON()).toBeNull();
  });
});
