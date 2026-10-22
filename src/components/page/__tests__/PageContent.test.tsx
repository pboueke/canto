import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

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

import { clampEditorHeight, PageContent } from '../PageContent';

describe('PageContent', () => {
  it('clamps measured editor height to the scaled minimum', () => {
    expect(clampEditorHeight(100, 352)).toBe(352);
    expect(clampEditorHeight(352, 352)).toBe(352);
    expect(clampEditorHeight(500, 352)).toBe(500);
  });

  it('renders a top-aligned, non-scrolling multiline editor without autofocus', () => {
    const { getByPlaceholderText } = render(<PageContent content="" isEditing={true} />);
    const input = getByPlaceholderText('Start writing...');

    expect(input.props.multiline).toBe(true);
    expect(input.props.scrollEnabled).toBe(false);
    expect(input.props.textAlignVertical).toBe('top');
    expect(input.props.autoFocus).toBeUndefined();
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({ padding: 0, overflow: 'hidden' });
    expect(StyleSheet.flatten(input.props.style).flex).toBeUndefined();
  });

  it('uses a 16-line editing minimum and a 4-line viewing minimum', () => {
    const view = render(<PageContent content="" isEditing={true} />);
    const inputStyle = StyleSheet.flatten(
      view.getByPlaceholderText('Start writing...').props.style,
    );
    expect(inputStyle.minHeight).toBe(22 * 16);

    view.rerender(<PageContent content="short" isEditing={false} />);
    const viewerStyle = StyleSheet.flatten(view.getByTestId('page-content-viewer').props.style);
    expect(viewerStyle.minHeight).toBe(22 * 4);
  });

  it('grows and shrinks with native content without crossing the minimum', () => {
    const { getByPlaceholderText } = render(<PageContent content="" isEditing={true} />);
    const input = getByPlaceholderText('Start writing...');

    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 300, height: 500 } },
    });
    expect(StyleSheet.flatten(getByPlaceholderText('Start writing...').props.style).height).toBe(
      500,
    );

    fireEvent(getByPlaceholderText('Start writing...'), 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 300, height: 400 } },
    });
    expect(StyleSheet.flatten(getByPlaceholderText('Start writing...').props.style).height).toBe(
      400,
    );

    fireEvent(getByPlaceholderText('Start writing...'), 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 300, height: 100 } },
    });
    expect(StyleSheet.flatten(getByPlaceholderText('Start writing...').props.style).height).toBe(
      352,
    );
  });

  it('resets stale native height for external content without collapsing local edits', () => {
    const onChangeText = jest.fn();
    const view = render(
      <PageContent content="first page" isEditing={true} onChangeText={onChangeText} />,
    );

    fireEvent(view.getByPlaceholderText('Start writing...'), 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 300, height: 500 } },
    });
    view.rerender(
      <PageContent content="replacement page" isEditing={true} onChangeText={onChangeText} />,
    );
    expect(
      StyleSheet.flatten(view.getByPlaceholderText('Start writing...').props.style).height,
    ).toBe(352);

    fireEvent(view.getByPlaceholderText('Start writing...'), 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 300, height: 500 } },
    });
    fireEvent.changeText(view.getByPlaceholderText('Start writing...'), 'local edit');
    view.rerender(
      <PageContent content="local edit" isEditing={true} onChangeText={onChangeText} />,
    );
    expect(
      StyleSheet.flatten(view.getByPlaceholderText('Start writing...').props.style).height,
    ).toBe(500);
  });

  it('keeps only the section border when the editor is focused', () => {
    const { getByPlaceholderText, getByTestId } = render(
      <PageContent content="" isEditing={true} />,
    );
    const input = getByPlaceholderText('Start writing...');
    const expectedSectionBorder = {
      borderColor: '#ccc',
      borderWidth: 1,
    };

    expect(input.props.underlineColorAndroid).toBe('transparent');
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      boxShadow: 'none',
      outlineColor: 'transparent',
      outlineWidth: 0,
    });
    expect(StyleSheet.flatten(getByTestId('page-content-card').props.style)).toMatchObject(
      expectedSectionBorder,
    );

    fireEvent(input, 'focus');
    expect(StyleSheet.flatten(getByTestId('page-content-card').props.style)).toMatchObject(
      expectedSectionBorder,
    );
  });

  it('renders Markdown component when isEditing is false', () => {
    const { getByTestId } = render(<PageContent content="hello world" isEditing={false} />);

    expect(getByTestId('markdown')).toBeTruthy();
  });
});
