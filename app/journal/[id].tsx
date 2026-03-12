import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useJournal, useCreatePage } from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { JournalHeader } from '@/components/journal/JournalHeader';
import { PageListItem } from '@/components/journal/PageListItem';
import { FloatingActionButton } from '@/components/common/FloatingActionButton';
import { pageToPreview } from '@/models';

export default function JournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { t } = useI18n();
  const { getKey } = useJournalKeys();

  const derivedKey = id ? getKey(id) : null;
  const { journal, loading, refresh } = useJournal(id, derivedKey);
  const { create: createPage } = useCreatePage(id, derivedKey);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const pages = useMemo(() => {
    if (!journal) return [];
    return journal.pages
      .filter((p) => !p.deleted)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(pageToPreview);
  }, [journal]);

  if (loading) {
    return (
      <View
        style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

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
          renderItem={({ item }) => <PageListItem page={item} journalId={journal.id} />}
        />
      )}

      <FloatingActionButton
        icon="+"
        onPress={async () => {
          const pageId = await createPage();
          if (pageId) {
            router.push(`/page/${pageId}?journalId=${journal.id}&edit=true`);
          }
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
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
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
