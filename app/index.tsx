import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { AccountButton } from '@/components/home/AccountButton';
import { authenticateBiometric } from '@/lib/biometric';
import { ONBOARDING_KEY } from './onboarding';
import type { Journal } from '@/models';

export default function HomeScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const { journals, loading, refresh } = useJournals();
  const { create } = useCreateJournal();
  const { deriveAndCache, getKey, clearKey, clearAll } = useJournalKeys();
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // Check onboarding status on mount
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((value) => {
        if (value !== 'true') {
          router.replace('/onboarding');
        } else {
          setOnboardingChecked(true);
        }
      })
      .catch(() => {
        // If read fails, show onboarding as safe fallback
        router.replace('/onboarding');
      });
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      clearAll();
      refresh();
    }, [clearAll, refresh]),
  );

  const autoOpenedRef = useRef(false);

  const [devUnlocked, setDevUnlocked] = useState(false);
  const tapCountRef = useRef(0);

  const handleLogoPress = useCallback(() => {
    tapCountRef.current += 1;
    if (tapCountRef.current >= 7) {
      setDevUnlocked(true);
      tapCountRef.current = 0;
    }
  }, []);

  const [showNewModal, setShowNewModal] = useState(false);

  // Auto-open NewJournalModal when arriving from onboarding
  useEffect(() => {
    if (params.fromOnboarding === 'true' && !autoOpenedRef.current && onboardingChecked) {
      autoOpenedRef.current = true;
      setShowNewModal(true);
    }
  }, [params.fromOnboarding, onboardingChecked]);

  const [accessJournal, setAccessJournal] = useState<Journal | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  async function handleCreate(input: {
    title: string;
    icon: string;
    password?: string;
    biometric?: boolean;
    themeOverride?: string;
    kdfIterations?: number;
  }) {
    const journalId = await create(input, deriveAndCache);
    await refresh();
    setShowNewModal(false);
    router.push(`/journal/${journalId}`);
  }

  async function handleJournalPress(journal: Journal) {
    // Biometric gate: skip on web (biometric is unavailable), fall through to password
    if (journal.biometric && !getKey(journal.id) && Platform.OS !== 'web') {
      const success = await authenticateBiometric(t.home.biometricReason);
      if (!success) return;
    }

    if (journal.secure && !getKey(journal.id)) {
      // Password-protected — always require password
      setAccessJournal(journal);
      setAccessError(null);
    } else if (!journal.secure && journal.salt && !getKey(journal.id)) {
      // No password but has salt — auto-derive from empty string
      setUnlocking(true);
      await new Promise((r) => setTimeout(r, 100));
      try {
        await deriveAndCache(journal.id, '', journal.salt, journal.kdfIterations);
        router.push(`/journal/${journal.id}`);
      } finally {
        setUnlocking(false);
      }
    } else {
      router.push(`/journal/${journal.id}`);
    }
  }

  async function handleUnlock(password: string) {
    if (!accessJournal?.salt) return;
    const journalId = accessJournal.id;
    try {
      const key = await deriveAndCache(
        journalId,
        password,
        accessJournal.salt,
        accessJournal.kdfIterations,
      );
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

  // Don't render until onboarding check completes (avoids flash before redirect)
  if (!onboardingChecked) return null;

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
            <Pressable onPress={handleLogoPress}>
              <Logo size={170} />
            </Pressable>
          </View>
          <View style={styles.infoSection}>
            <InfoBox devUnlocked={devUnlocked} />
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

      <Modal visible={unlocking} transparent animationType="fade">
        <View style={styles.unlockingOverlay}>
          <View
            style={[
              styles.unlockingBox,
              { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
            ]}
          >
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text
              style={[
                styles.unlockingText,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.common.loading}
            </Text>
          </View>
        </View>
      </Modal>

      <NewJournalModal
        visible={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={handleCreate}
        existingTitles={journals.map((j) => j.title)}
        onImportComplete={async (journalId) => {
          await refresh();
          router.push(`/journal/${journalId}`);
        }}
      />

      <JournalAccessModal
        visible={!!accessJournal}
        journalTitle={accessJournal?.title ?? ''}
        onClose={() => setAccessJournal(null)}
        onUnlock={handleUnlock}
        error={accessError}
      />

      {/* Footer: account status */}
      <View
        style={[
          styles.footer,
          { borderTopColor: theme.colors.border, paddingBottom: insets.bottom + 8 },
        ]}
      >
        <AccountButton />
      </View>
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
  unlockingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  unlockingBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 30,
    alignItems: 'center',
    gap: 14,
  },
  unlockingText: {
    fontSize: 14,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 8,
    alignItems: 'center',
  },
});
