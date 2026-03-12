import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { JournalHeader } from '@/components/journal/JournalHeader';
import { PageListItem } from '@/components/journal/PageListItem';
import { FloatingActionButton } from '@/components/common/FloatingActionButton';
import { getJournal, getJournalPages } from '@/lib/mockData';

export default function JournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { t } = useI18n();

  const journal = getJournal(id);
  const pages = getJournalPages(id);

  if (!journal) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.empty, { color: theme.colors.text }]}>Journal not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <JournalHeader journal={journal} />

      {pages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>
            {t.journal.noPages}
          </Text>
        </View>
      ) : (
        <FlatList
          data={pages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <PageListItem page={item} />}
        />
      )}

      <FloatingActionButton
        icon="+"
        onPress={() => {
          /* TODO: create page */
        }}
        backgroundColor={theme.colors.popAction.new.background}
        color={theme.colors.popAction.new.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: 10,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    fontSize: 16,
    textAlign: 'center',
  },
});
