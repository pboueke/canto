import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useJournals, useCreateJournal } from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { Logo } from '@/components/common/Logo';
import { InfoBox } from '@/components/home/InfoBox';
import { JournalCard } from '@/components/home/JournalCard';
import { NewJournalCard } from '@/components/home/NewJournalCard';
import { NewJournalModal } from '@/components/home/NewJournalModal';
import { JournalAccessModal } from '@/components/home/JournalAccessModal';
import type { Journal } from '@/models';

export default function HomeScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { journals, loading, refresh } = useJournals();
  const { create } = useCreateJournal();
  const { deriveAndCache, getKey } = useJournalKeys();

  const [showNewModal, setShowNewModal] = useState(false);
  const [accessJournal, setAccessJournal] = useState<Journal | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  async function handleCreate(input: { title: string; icon: string; password?: string }) {
    const journalId = await create(input, input.password ? deriveAndCache : undefined);
    await refresh();
    setShowNewModal(false);
    router.push(`/journal/${journalId}`);
  }

  function handleJournalPress(journal: Journal) {
    if (journal.secure && !getKey(journal.id)) {
      setAccessJournal(journal);
      setAccessError(null);
    } else {
      router.push(`/journal/${journal.id}`);
    }
  }

  async function handleUnlock(password: string) {
    if (!accessJournal?.salt) return;
    const journalId = accessJournal.id;
    try {
      await deriveAndCache(journalId, password, accessJournal.salt);
      setAccessJournal(null);
      setAccessError(null);
      router.push(`/journal/${journalId}`);
    } catch {
      setAccessError(t.home.wrongPassword);
    }
  }

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

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : journals.length === 0 ? (
        <View style={styles.centered}>
          <Text
            style={[
              styles.emptyText,
              { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
            ]}
          >
            {t.home.noJournals}
          </Text>
          <NewJournalCard onPress={() => setShowNewModal(true)} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.journalList}>
          <View style={styles.journalRow}>
            {journals.map((journal) => (
              <JournalCard
                key={journal.id}
                journal={journal}
                onPress={() => handleJournalPress(journal)}
              />
            ))}
            <NewJournalCard onPress={() => setShowNewModal(true)} />
          </View>
        </ScrollView>
      )}

      <NewJournalModal
        visible={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={handleCreate}
      />

      <JournalAccessModal
        visible={!!accessJournal}
        journalTitle={accessJournal?.title ?? ''}
        onClose={() => setAccessJournal(null)}
        onUnlock={handleUnlock}
        error={accessError}
      />
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
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
