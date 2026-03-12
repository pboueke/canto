import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface TagProps {
  label: string;
  variant?: 'default' | 'active';
}

export function Tag({ label, variant = 'default' }: TagProps) {
  const { theme } = useTheme();
  const bgColor = variant === 'active' ? theme.colors.tag.active : theme.colors.tag.default;

  return (
    <View style={[styles.tag, { backgroundColor: bgColor }]}>
      <Text
        style={[styles.label, { color: theme.colors.tag.text, fontFamily: theme.fonts.regular }]}
      >
        #{label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 5,
    marginBottom: 3,
  },
  label: {
    fontSize: 12,
  },
});
