import { Pressable, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { getContrastText } from '@/styles/themes';

interface AnniversaryRowProps {
  count: number;
  onPress: () => void;
}

export function AnniversaryRow({ count, onPress }: AnniversaryRowProps) {
  const { theme } = useTheme();
  const { t } = useI18n();

  const hasAnniversaries = count > 0;
  const label =
    count === 0
      ? t.calendar.anniversaryRowZero
      : count === 1
        ? t.calendar.anniversaryRowOne
        : t.calendar.anniversaryRow.replace('{count}', String(count));

  const textColor = hasAnniversaries
    ? getContrastText(theme.colors.primary)
    : theme.colors.textSecondary;

  return (
    <Pressable
      onPress={hasAnniversaries ? onPress : undefined}
      disabled={!hasAnniversaries}
      accessibilityState={{ disabled: !hasAnniversaries }}
      style={[
        styles.row,
        {
          backgroundColor: hasAnniversaries ? theme.colors.primary : theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Feather name="gift" size={20} color={textColor} />
      <Text style={[styles.text, { color: textColor, fontFamily: theme.fonts.bold }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 14,
    marginHorizontal: 10,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  text: {
    fontSize: 15,
    flex: 1,
  },
});
