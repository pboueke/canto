import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { BackButton } from '@/components/common/BackButton';
import type { MockJournal } from '@/lib/mockData';

interface JournalHeaderProps {
  journal: MockJournal;
  onPressSettings?: () => void;
  onPressData?: () => void;
}

export function JournalHeader({ journal, onPressSettings, onPressData }: JournalHeaderProps) {
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
      <Text style={styles.icon}>{getIconEmoji(journal.icon)}</Text>
      <Text
        style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
        numberOfLines={1}
      >
        {journal.name}
      </Text>
      <View style={styles.actions}>
        <Pressable onPress={onPressData} style={styles.actionButton}>
          <Text style={[styles.actionIcon, { color: theme.colors.text }]}>{'\u{1F4BE}'}</Text>
        </Pressable>
        <Pressable onPress={onPressSettings} style={styles.actionButton}>
          <Text style={[styles.actionIcon, { color: theme.colors.text }]}>{'\u{2699}'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function getIconEmoji(icon: string): string {
  const icons: Record<string, string> = {
    book: '\u{1F4D6}',
    map: '\u{1F5FA}',
    briefcase: '\u{1F4BC}',
    heart: '\u{2764}',
    star: '\u{2B50}',
  };
  return icons[icon] ?? '\u{1F4D3}';
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 10,
    gap: 10,
  },
  icon: {
    fontSize: 24,
  },
  title: {
    fontSize: 20,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 15,
  },
  actionButton: {
    padding: 4,
  },
  actionIcon: {
    fontSize: 22,
  },
});
