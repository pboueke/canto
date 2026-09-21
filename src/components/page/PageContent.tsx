import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';

interface PageContentProps {
  content: string;
  isEditing: boolean;
  onChangeText?: (text: string) => void;
}

export const EDITOR_MIN_LINES = 16;
const VIEWER_MIN_LINES = 4;
const EDITOR_BASE_LINE_HEIGHT = 22;

export function getEditorMinHeight(scale: number): number {
  return EDITOR_BASE_LINE_HEIGHT * scale * EDITOR_MIN_LINES;
}

export function clampEditorHeight(contentHeight: number, minHeight: number): number {
  return Math.max(contentHeight, minHeight);
}

export function PageContent({ content, isEditing, onChangeText }: PageContentProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const scale = theme.fonts.fontScale;
  const lineHeight = EDITOR_BASE_LINE_HEIGHT * scale;
  const minEditorHeight = getEditorMinHeight(scale);
  const minViewerHeight = lineHeight * VIEWER_MIN_LINES;
  const textInputRef = useRef<TextInput>(null);
  const pendingLocalContentRef = useRef<string | null>(null);
  const [editorHeight, setEditorHeight] = useState(minEditorHeight);

  useEffect(() => {
    if (Platform.OS !== 'web') setEditorHeight(minEditorHeight);
  }, [isEditing, minEditorHeight]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (pendingLocalContentRef.current === content) {
      pendingLocalContentRef.current = null;
      return;
    }
    setEditorHeight(minEditorHeight);
  }, [content, minEditorHeight]);

  // react-native-web renders multiline TextInput as a textarea, which needs an
  // explicit height. Release the old height before reading scrollHeight so the
  // editor can shrink as well as grow, then restore the page scroll position.
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !isEditing) return;
    // SAFETY: react-native-web renders this multiline TextInput ref as an HTML textarea.
    const node = textInputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node || node.tagName !== 'TEXTAREA') return;

    const browserWindow = typeof window === 'undefined' ? null : window;
    const scrollX = browserWindow?.scrollX ?? 0;
    const scrollY = browserWindow?.scrollY ?? 0;
    const ancestorScrollPositions: Array<{
      element: HTMLElement;
      scrollLeft: number;
      scrollTop: number;
    }> = [];
    let ancestor = node.parentElement;
    while (ancestor) {
      ancestorScrollPositions.push({
        element: ancestor,
        scrollLeft: ancestor.scrollLeft,
        scrollTop: ancestor.scrollTop,
      });
      ancestor = ancestor.parentElement;
    }
    const selectionStart = node.selectionStart;
    const selectionEnd = node.selectionEnd;

    node.style.height = 'auto';
    const nextHeight = clampEditorHeight(node.scrollHeight, minEditorHeight);
    node.style.height = `${nextHeight}px`;
    setEditorHeight(nextHeight);

    if (selectionStart !== null && selectionEnd !== null) {
      node.setSelectionRange(selectionStart, selectionEnd);
    }
    for (const position of ancestorScrollPositions) {
      position.element.scrollLeft = position.scrollLeft;
      position.element.scrollTop = position.scrollTop;
    }
    browserWindow?.scrollTo(scrollX, scrollY);
  }, [content, isEditing, minEditorHeight]);

  const markdownStyles = {
    body: {
      color: theme.colors.markdown.text,
      fontFamily: theme.fonts.serif,
      fontSize: 14 * scale,
      lineHeight: 22 * scale,
    },
    heading1: {
      fontFamily: theme.fonts.serifBold,
      color: theme.colors.markdown.text,
      fontSize: 24 * scale,
      marginBottom: 8,
    },
    heading2: {
      fontFamily: theme.fonts.serifBold,
      color: theme.colors.markdown.text,
      fontSize: 20 * scale,
      marginBottom: 6,
    },
    heading3: {
      fontFamily: theme.fonts.serifBold,
      color: theme.colors.markdown.text,
      fontSize: 17 * scale,
      marginBottom: 4,
    },
    code_inline: {
      backgroundColor: theme.colors.markdown.codeBackground,
      fontFamily: undefined,
      fontSize: 13 * scale,
      padding: 2,
      borderRadius: 3,
    },
    code_block: {
      backgroundColor: theme.colors.markdown.codeBackground,
      fontFamily: undefined,
      fontSize: 13 * scale,
      padding: 10,
      borderRadius: 5,
    },
    fence: {
      backgroundColor: theme.colors.markdown.codeBackground,
      fontFamily: undefined,
      fontSize: 13 * scale,
      padding: 10,
      borderRadius: 5,
    },
    blockquote: {
      backgroundColor: theme.colors.markdown.quote,
      borderLeftColor: theme.colors.primary,
      borderLeftWidth: 3,
      paddingLeft: 10,
      paddingVertical: 4,
      marginVertical: 4,
    },
    link: {
      color: theme.colors.primary,
    },
    strong: {
      fontFamily: theme.fonts.serifBold,
    },
    em: {
      fontStyle: 'italic' as const,
    },
    list_item: {
      marginBottom: 4,
    },
  };

  return (
    <View
      testID="page-content-card"
      style={[
        styles.container,
        {
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidth,
          backgroundColor: theme.colors.foreground,
        },
      ]}
    >
      {isEditing ? (
        <TextInput
          ref={textInputRef}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              fontFamily: theme.fonts.serif,
              fontSize: 14 * scale,
              lineHeight,
              minHeight: minEditorHeight,
              height: editorHeight,
            },
          ]}
          value={content}
          onChangeText={(text) => {
            pendingLocalContentRef.current = text;
            onChangeText?.(text);
          }}
          onContentSizeChange={({ nativeEvent }) => {
            if (Platform.OS !== 'web') {
              setEditorHeight(clampEditorHeight(nativeEvent.contentSize.height, minEditorHeight));
            }
          }}
          scrollEnabled={false}
          multiline
          underlineColorAndroid="transparent"
          textAlignVertical="top"
          placeholder={t.page.placeholder}
          placeholderTextColor={theme.colors.textSecondary}
        />
      ) : (
        <View testID="page-content-viewer" style={{ minHeight: minViewerHeight }}>
          <Markdown style={markdownStyles}>{content || ' '}</Markdown>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 5,
    padding: 15,
    marginTop: 10,
  },
  input: {
    width: '100%',
    padding: 0,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    boxShadow: 'none',
    outlineColor: 'transparent',
    outlineWidth: 0,
    overflow: 'hidden',
  },
});
