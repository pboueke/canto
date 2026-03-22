import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

interface TagProps {
  label: string;
  variant?: 'default' | 'active';
  onRemove?: () => void;
}

export function Tag({ label, variant = 'default', onRemove }: TagProps) {
  const { theme } = useTheme();
  const bgColor = variant === 'active' ? theme.colors.tag.active : theme.colors.tag.default;

  return (
    <View style={[styles.tag, { backgroundColor: bgColor }]}>
      <Text
        style={[styles.label, { color: theme.colors.tag.text, fontFamily: theme.fonts.regular }]}
      >
        #{label}
      </Text>
      {onRemove && (
        <Pressable
          onPress={onRemove}
          style={[styles.removeButton, { backgroundColor: theme.colors.deleteAction }]}
        >
          <Feather name="x" size={10} color="#fff" />
        </Pressable>
      )}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 12,
  },
  removeButton: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
