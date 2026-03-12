import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/common/Card';
import { useTheme } from '@/hooks/useTheme';
import type { MockJournal } from '@/lib/mockData';

interface JournalCardProps {
  journal: MockJournal;
}

export function JournalCard({ journal }: JournalCardProps) {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <Card onPress={() => router.push(`/journal/${journal.id}`)} style={styles.card}>
      <Text style={[styles.icon]}>{getIconEmoji(journal.icon)}</Text>
      <Text
        style={[styles.name, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
        numberOfLines={1}
      >
        {journal.name}
      </Text>
      <Text
        style={[styles.count, { color: theme.colors.textSecondary, fontFamily: theme.fonts.light }]}
      >
        {journal.entryCount} {journal.entryCount === 1 ? 'entry' : 'entries'}
      </Text>
    </Card>
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
  card: {
    width: 140,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 5,
  },
  icon: {
    fontSize: 32,
    marginBottom: 8,
  },
  name: {
    fontSize: 14,
    marginBottom: 4,
    textAlign: 'center',
  },
  count: {
    fontSize: 11,
  },
});
