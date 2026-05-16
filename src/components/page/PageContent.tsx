import { StyleSheet, TextInput, View } from 'react-native';
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
          style={[
            styles.input,
            {
              color: theme.colors.text,
              fontFamily: theme.fonts.serif,
              fontSize: 14 * scale,
              lineHeight: 22 * scale,
            },
          ]}
          value={content}
          onChangeText={onChangeText}
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
  input: {
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
});
