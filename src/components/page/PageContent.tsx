import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface PageContentProps {
  content: string;
  isEditing: boolean;
  onChangeText?: (text: string) => void;
}

export function PageContent({ content, isEditing, onChangeText }: PageContentProps) {
  const { theme } = useTheme();

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
          style={[styles.input, { color: theme.colors.text, fontFamily: theme.fonts.serif }]}
          value={content}
          onChangeText={onChangeText}
          multiline
          textAlignVertical="top"
          placeholderTextColor={theme.colors.textSecondary}
        />
      ) : (
        <Text style={[styles.text, { color: theme.colors.text, fontFamily: theme.fonts.serif }]}>
          {content}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 5,
    padding: 15,
    minHeight: 400,
  },
  input: {
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
  text: {
    fontSize: 14,
    lineHeight: 22,
  },
});
