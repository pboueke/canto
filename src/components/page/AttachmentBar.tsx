import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface AttachmentBarProps {
  hasImage: boolean;
  hasAttachment: boolean;
  hasLocation: boolean;
}

export function AttachmentBar({ hasImage, hasAttachment, hasLocation }: AttachmentBarProps) {
  const { theme } = useTheme();

  const items: { emoji: string; label: string }[] = [];
  if (hasImage) items.push({ emoji: '\u{1F5BC}', label: 'Images' });
  if (hasAttachment) items.push({ emoji: '\u{1F4CE}', label: 'Files' });
  if (hasLocation) items.push({ emoji: '\u{1F4CD}', label: 'Location' });

  if (items.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.highlight,
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidth,
        },
      ]}
    >
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <Text style={styles.emoji}>{item.emoji}</Text>
          <Text
            style={[
              styles.label,
              { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
            ]}
          >
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 5,
    padding: 10,
    gap: 15,
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emoji: {
    fontSize: 14,
  },
  label: {
    fontSize: 12,
  },
});
