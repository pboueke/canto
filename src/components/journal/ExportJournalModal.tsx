import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { exportJournal, type ExportProgress } from '@/lib/backup';
import type { JournalContent } from '@/models';

interface ExportJournalModalProps {
  visible: boolean;
  journal: JournalContent;
  derivedKey?: Uint8Array | null;
  onClose: () => void;
}

export function ExportJournalModal({
  visible,
  journal,
  derivedKey,
  onClose,
}: ExportJournalModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();

  const [encrypted, setEncrypted] = useState(journal.secure);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    // Let React render the spinner
    await new Promise((r) => setTimeout(r, 100));
    try {
      await exportJournal(journal, encrypted, derivedKey ?? undefined, setProgress);
      handleClose();
    } catch (err) {
      console.error('[Canto] Export failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }

  function handleClose() {
    if (exporting) return;
    setEncrypted(journal.secure);
    setError(null);
    setProgress(null);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
            {t.backup.exportJournal}
          </Text>

          <View style={styles.journalInfo}>
            <Feather
              name={(journal.icon || 'book') as React.ComponentProps<typeof Feather>['name']}
              size={20}
              color={theme.colors.text}
            />
            <Text
              style={[
                styles.journalName,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
              numberOfLines={1}
            >
              {journal.title}
            </Text>
          </View>

          {exporting ? (
            <View style={styles.progressContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text
                style={[
                  styles.progressText,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.backup.exporting}
                {progress ? ` (${progress.current}/${progress.total})` : ''}
              </Text>
            </View>
          ) : (
            <>
              {journal.secure && (
                <View style={styles.encryptRow}>
                  <Feather name="lock" size={16} color={theme.colors.text} />
                  <Text
                    style={[
                      styles.encryptLabel,
                      { color: theme.colors.text, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {t.backup.includeEncryption}
                  </Text>
                  <Switch
                    value={encrypted}
                    onValueChange={setEncrypted}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  />
                </View>
              )}

              {error && (
                <View style={[styles.errorBox, { borderColor: theme.colors.error }]}>
                  <Feather name="alert-circle" size={14} color={theme.colors.error} />
                  <Text
                    style={[
                      styles.errorText,
                      { color: theme.colors.text, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {error}
                  </Text>
                </View>
              )}

              <View style={styles.buttons}>
                <Pressable
                  onPress={handleClose}
                  style={[styles.button, { backgroundColor: theme.colors.highlight }]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: theme.colors.text, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {t.common.cancel}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleExport}
                  style={[styles.button, { backgroundColor: theme.colors.primary }]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: theme.colors.foreground, fontFamily: theme.fonts.bold },
                    ]}
                  >
                    {t.backup.export}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 30,
  },
  content: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    marginBottom: 16,
  },
  journalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  journalName: {
    fontSize: 16,
    flex: 1,
  },
  encryptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  encryptLabel: {
    fontSize: 14,
    flex: 1,
  },
  progressContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  progressText: {
    fontSize: 14,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
  },
});
