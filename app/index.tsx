import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useJournals, useCreateJournal, tryLoadJournal } from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { Logo } from '@/components/common/Logo';
import { InfoBox } from '@/components/home/InfoBox';
import { JournalCard } from '@/components/home/JournalCard';
import { NewJournalCard } from '@/components/home/NewJournalCard';
import { NewJournalModal } from '@/components/home/NewJournalModal';
import { JournalAccessModal } from '@/components/home/JournalAccessModal';
import { authenticateBiometric } from '@/lib/biometric';
import type { Journal } from '@/models';

export default function HomeScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { journals, loading, refresh } = useJournals();
  const { create } = useCreateJournal();
  const { deriveAndCache, getKey, clearKey, clearAll } = useJournalKeys();

  useFocusEffect(
    useCallback(() => {
      clearAll();
      refresh();
    }, [clearAll, refresh]),
  );

  const [showNewModal, setShowNewModal] = useState(false);
  const [accessJournal, setAccessJournal] = useState<Journal | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  async function handleCreate(input: {
    title: string;
    icon: string;
    password?: string;
    biometric?: boolean;
    themeOverride?: string;
  }) {
    const journalId = await create(input, deriveAndCache);
    await refresh();
    setShowNewModal(false);
    router.push(`/journal/${journalId}`);
  }

  async function handleJournalPress(journal: Journal) {
    // Biometric gate (for both secure and non-secure journals)
    if (journal.biometric) {
      const success = await authenticateBiometric(t.home.biometricReason);
      if (!success) return;
    }

    if (journal.secure && !getKey(journal.id)) {
      // User-set password — show password modal
      setAccessJournal(journal);
      setAccessError(null);
    } else if (!journal.secure && journal.salt && !getKey(journal.id)) {
      // No password but has salt — auto-derive from empty string
      await deriveAndCache(journal.id, '', journal.salt);
      router.push(`/journal/${journal.id}`);
    } else {
      router.push(`/journal/${journal.id}`);
    }
  }

  async function handleUnlock(password: string) {
    if (!accessJournal?.salt) return;
    const journalId = accessJournal.id;
    try {
      const key = await deriveAndCache(journalId, password, accessJournal.salt);
      // Trial decryption — PBKDF2 always succeeds, so we must verify the derived key
      const result = await tryLoadJournal(journalId, key);
      if (!result) {
        clearKey(journalId);
        setAccessError(t.home.wrongPassword);
        return;
      }
      setAccessJournal(null);
      setAccessError(null);
      router.push(`/journal/${journalId}`);
    } catch {
      clearKey(accessJournal.id);
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
