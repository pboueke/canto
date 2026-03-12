import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { Logo } from '@/components/common/Logo';
import { InfoBox } from '@/components/home/InfoBox';
import { JournalCard } from '@/components/home/JournalCard';
import { NewJournalCard } from '@/components/home/NewJournalCard';
import { mockJournals } from '@/lib/mockData';

export default function HomeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.topSection,
          { backgroundColor: theme.colors.foreground, paddingTop: insets.top + 10 },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.logoSection}>
            <Logo size={170} />
          </View>
          <View style={styles.infoSection}>
            <InfoBox />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.journalList}>
        <View style={styles.journalRow}>
          {mockJournals.map((journal) => (
            <JournalCard key={journal.id} journal={journal} />
          ))}
          <NewJournalCard />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSection: {
    paddingHorizontal: 15,
    paddingBottom: 15,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoSection: {
    flex: 1,
    alignItems: 'center',
  },
  infoSection: {
    flex: 1,
  },
  journalList: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  journalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
