import { StyleSheet, Text } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/common/Card';

interface NewJournalCardProps {
  onPress: () => void;
}

export function NewJournalCard({ onPress }: NewJournalCardProps) {
  const { theme } = useTheme();

  return (
    <Card
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.newJournal.background,
          borderColor: theme.colors.newJournal.border,
        },
      ]}
    >
      <Text style={[styles.icon, { color: theme.colors.newJournal.icon }]}>+</Text>
      <Text
        style={[
          styles.label,
          {
            color: theme.colors.newJournal.text,
            fontFamily: theme.fonts.regular,
          },
        ]}
      >
        New Journal
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
  icon: {
    fontSize: 36,
    fontWeight: '300',
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
  },
});
