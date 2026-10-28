import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { DiagnosticsCopyButton } from '@/components/common/DiagnosticsCopyButton';
import type { IntegrityCode } from '@/lib/storage/integrity';
import { RecoverPagesModal } from './RecoverPagesModal';

interface JournalIntegrityPanelProps {
  journalId: string;
  code: IntegrityCode;
  derivedKey?: Uint8Array | null;
  onRecovered: () => void;
  onBack: () => void;
}

/** Codes the explicit page recovery flow can repair without losing data. */
const RECOVERABLE: readonly IntegrityCode[] = ['LEGACY_ZERO_KEY', 'CATALOG_UNREADABLE'];

/**
 * Shown instead of the page list when a journal opened with a verified key
 * still cannot be read safely. Nothing is deleted or rewritten from here
 * except through the confirmed recovery flow.
 */
export function JournalIntegrityPanel({
  journalId,
  code,
  derivedKey,
  onRecovered,
  onBack,
}: JournalIntegrityPanelProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [recovering, setRecovering] = useState(false);

  const message =
    code === 'LEGACY_ZERO_KEY'
      ? t.journalIntegrity.legacyMessage
      : code === 'ROTATION_INTERRUPTED'
        ? t.journalIntegrity.interruptedMessage
        : t.journalIntegrity.unreadableMessage;

  const handleRecovered = useCallback(() => {
    setRecovering(false);
    onRecovered();
  }, [onRecovered]);

  return (
    <ScrollView
      testID="journal-integrity"
      contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.foreground, borderColor: theme.colors.border },
        ]}
      >
        <Feather name="alert-triangle" size={28} color={theme.colors.primary} />
        <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
          {t.journalIntegrity.title}
        </Text>
        <Text style={[styles.text, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}>
          {message}
        </Text>

        {RECOVERABLE.includes(code) && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setRecovering(true)}
            style={[styles.button, { backgroundColor: theme.colors.primary }]}
          >
            <Text style={[styles.primaryText, { fontFamily: theme.fonts.bold }]}>
              {t.journalIntegrity.recover}
            </Text>
          </Pressable>
        )}

        <DiagnosticsCopyButton code={code} journalId={journalId} derivedKey={derivedKey} />

        <Pressable accessibilityRole="button" onPress={onBack} style={styles.link}>
          <Text
            style={[
              styles.buttonText,
              { color: theme.colors.text, fontFamily: theme.fonts.regular },
            ]}
          >
            {t.journalIntegrity.back}
          </Text>
        </Pressable>
      </View>

      <RecoverPagesModal
        visible={recovering}
        journal={{ id: journalId }}
        derivedKey={derivedKey}
        onClose={() => setRecovering(false)}
        onRecovered={handleRecovered}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 17,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  buttonText: {
    fontSize: 14,
  },
  link: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
