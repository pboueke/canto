import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { BackButton } from '@/components/common/BackButton';

interface PageHeaderProps {
  date: string;
  time: string;
}

export function PageHeader({ date, time }: PageHeaderProps) {
  const { theme } = useTheme();
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
      <View style={styles.dateSection}>
        <Feather name="calendar" size={16} color={theme.colors.text} />
        <Text
          style={[styles.dateText, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}
        >
          {date}
        </Text>
      </View>
      <View style={styles.timeSection}>
        <Feather name="clock" size={16} color={theme.colors.text} />
        <Text
          style={[styles.timeText, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}
        >
          {time}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: undefined,
    paddingHorizontal: 15,
    paddingBottom: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  dateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 20,
  },
  timeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 15,
  },
  timeText: {
    fontSize: 15,
  },
});
