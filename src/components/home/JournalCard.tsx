import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/common/Card';
import { useTheme } from '@/hooks/useTheme';
import type { Journal } from '@/models';

interface JournalCardProps {
  journal: Journal;
  onPress: () => void;
}

export function JournalCard({ journal, onPress }: JournalCardProps) {
  const { theme } = useTheme();

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.iconRow}>
        <Feather
          name={(journal.icon || 'book') as React.ComponentProps<typeof Feather>['name']}
          size={28}
          color={theme.colors.text}
        />
        {journal.secure && (
          <Feather name="lock" size={12} color={theme.colors.textSecondary} style={styles.lock} />
        )}
      </View>
      <Text
        style={[styles.name, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
        numberOfLines={1}
      >
        {journal.title}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 140,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 5,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  lock: {
    marginLeft: 4,
  },
  name: {
    fontSize: 14,
    textAlign: 'center',
  },
});
