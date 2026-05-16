import { useLayoutEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';

interface PageContentProps {
  content: string;
  isEditing: boolean;
  onChangeText?: (text: string) => void;
}

export function PageContent({ content, isEditing, onChangeText }: PageContentProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const scale = theme.fonts.fontScale;
  const textInputRef = useRef<TextInput>(null);
  // react-native-web renders multiline TextInput as a plain <textarea>, which
  // does not auto-grow with content. Measure the textarea's natural content
  // height after every change and apply it as an explicit React style so the
  // textarea grows along with content. Native is unaffected.
  const [webHeight, setWebHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !isEditing) return;
    const node = textInputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node || node.tagName !== 'TEXTAREA') return;
    // Grow-only: never reset to 'auto' (causes layout shift that triggers
    // KeyboardAwareScrollView's auto-scroll and the browser's scroll-into-view).
    // scrollHeight reports the minimum height to fit content; when applied
    // height already accommodates content, scrollHeight equals applied height
    // and we keep the textarea where it is.
    const measured = node.scrollHeight;
    setWebHeight((current) => {
      if (current !== undefined && measured <= current) return current;
      return measured;
    });
  }, [content, isEditing, scale]);

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

  const isWeb = Platform.OS === 'web';

  return (
    <View
      style={[
        styles.container,
        // minHeight: 400 only on web — gives the textarea visual space when
        // empty. On native it makes the TextInput too tall for the caret to
        // stay above the keyboard.
        isWeb ? styles.containerWeb : null,
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
            // On native, flex: 1 fills the container. On web we explicitly
            // size to content via webHeight so flex must be turned off.
            isWeb ? styles.inputWeb : styles.input,
            {
              color: theme.colors.text,
              fontFamily: theme.fonts.serif,
              fontSize: 14 * scale,
              lineHeight: 22 * scale,
            },
            isWeb && webHeight !== undefined ? { height: webHeight } : null,
          ]}
          value={content}
          onChangeText={onChangeText}
          scrollEnabled={isWeb ? false : undefined}
          multiline
          textAlignVertical="top"
          placeholder={t.page.placeholder}
          placeholderTextColor={theme.colors.textSecondary}
        />
      ) : (
        <Markdown style={markdownStyles}>{content || ' '}</Markdown>
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
  containerWeb: {
    minHeight: 400,
  },
  input: {
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
  inputWeb: {
    fontSize: 14,
    lineHeight: 22,
    width: '100%',
    // No flex and no fixed height — height is driven via state from
    // scrollHeight measurements so the textarea always fits content.
    overflow: 'hidden',
  },
});
