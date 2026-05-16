import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { BackButton } from '@/components/common/BackButton';
import type { Journal } from 'canto-data';

interface CalendarHeaderProps {
  journal: Journal;
}

export function CalendarHeader({ journal }: CalendarHeaderProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.headerBackground,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: theme.borderWidth,
          paddingTop: insets.top + 5,
        },
      ]}
    >
      <BackButton />
      <Feather
        name={(journal.icon || 'book') as React.ComponentProps<typeof Feather>['name']}
        size={22}
        color={theme.colors.text}
      />
      <Text
        style={[
          styles.title,
          {
            color: theme.colors.text,
            fontFamily: theme.fonts.bold,
            fontSize: 20 * theme.fonts.fontScale,
          },
        ]}
        numberOfLines={1}
      >
        {journal.title} {t.calendar.titleSuffix}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 10,
    gap: 10,
  },
  title: {
    fontSize: 20,
    flex: 1,
  },
});
