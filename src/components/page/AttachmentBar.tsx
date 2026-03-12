import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

interface AttachmentBarProps {
  hasImage: boolean;
  hasAttachment: boolean;
  hasLocation: boolean;
}

export function AttachmentBar({ hasImage, hasAttachment, hasLocation }: AttachmentBarProps) {
  const { theme } = useTheme();

  const items: { icon: keyof typeof Feather.glyphMap; label: string }[] = [];
  if (hasImage) items.push({ icon: 'image', label: 'Images' });
  if (hasAttachment) items.push({ icon: 'paperclip', label: 'Files' });
  if (hasLocation) items.push({ icon: 'map-pin', label: 'Location' });

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
          <Feather name={item.icon} size={14} color={theme.colors.textSecondary} />
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
  label: {
    fontSize: 12,
  },
});
