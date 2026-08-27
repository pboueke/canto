import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { getLocalStore } from '@/hooks/useStorage';
import { exportJournal, type ExportProgress } from '@/lib/backup';
import type { JournalContent } from 'canto-data';
import { webModalContent } from '@/styles/web';

function ProgressBar({ current, total }: { current: number; total: number }) {
  const { theme } = useTheme();
  const fraction = total > 0 ? current / total : 0;

  return (
    <View style={[progressStyles.track, { backgroundColor: theme.colors.border }]}>
      <View
        style={[
          progressStyles.fill,
          {
            backgroundColor: theme.colors.primary,
            width: `${Math.round(fraction * 100)}%`,
          },
        ]}
      />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});

interface ExportJournalModalProps {
  visible: boolean;
  journal: Omit<JournalContent, 'pages'>;
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
    await new Promise((r) => setTimeout(r, 100));
    try {
      // Export is a deliberate full-data workflow. Keep the modal shell fast
      // by loading pages only after the user confirms the export action.
      const store = await getLocalStore();
      const fullJournal = await store.getJournal(journal.id, derivedKey ?? undefined);
      if (!fullJournal) throw new Error(t.backup.exportError);
      await exportJournal(fullJournal, encrypted, derivedKey ?? undefined, setProgress);
      handleClose();
    } catch (err) {
      console.error('[Canto] Export failed:', err);
      setError(t.backup.exportError);
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
            webModalContent,
            {
              backgroundColor: theme.colors.foreground,
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
            {t.backup.exportJournal}
          </Text>

          {/* Journal info */}
          <View style={styles.row}>
            <View style={styles.journalInfo}>
              <Feather
                name={(journal.icon || 'book') as React.ComponentProps<typeof Feather>['name']}
                size={18}
                color={theme.colors.text}
              />
              <Text
                style={[
                  styles.label,
                  { color: theme.colors.text, fontFamily: theme.fonts.regular },
                ]}
                numberOfLines={1}
              >
                {journal.title}
              </Text>
            </View>
          </View>

          {exporting ? (
            <>
              {progress && (
                <View style={styles.progressSection}>
                  <ProgressBar current={progress.current} total={progress.total} />
                  <Text
                    style={[
                      styles.progressText,
                      { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {t.backup.exporting} ({progress.current}/{progress.total})
                  </Text>
                </View>
              )}
              {!progress && (
                <View style={styles.spinnerRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text
                    style={[
                      styles.label,
                      { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {t.backup.exporting}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              {/* Encryption toggle */}
              {journal.secure && (
                <View style={styles.settingRow}>
                  <Text
                    style={[
                      styles.settingLabel,
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

              {/* Export button */}
              <Pressable
                onPress={handleExport}
                style={[styles.actionBtn, { backgroundColor: theme.colors.primary }]}
              >
                <Feather name="download" size={16} color={theme.colors.foreground} />
                <Text
                  style={[
                    styles.actionBtnText,
                    { color: theme.colors.foreground, fontFamily: theme.fonts.bold },
                  ]}
                >
                  {t.backup.export}
                </Text>
              </Pressable>
            </>
          )}

          {/* Error */}
          {error && (
            <Text
              style={[
                styles.feedback,
                { color: theme.colors.error, fontFamily: theme.fonts.regular },
              ]}
            >
              {error}
            </Text>
          )}

          {/* Close */}
          <Pressable
            onPress={handleClose}
            disabled={exporting}
            style={[
              styles.closeBtn,
              { backgroundColor: theme.colors.highlight, opacity: exporting ? 0.5 : 1 },
            ]}
          >
            <Text
              style={[
                styles.closeBtnText,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.common.close}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  content: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    gap: 12,
  },
  title: {
    fontSize: 18,
    marginBottom: 4,
  },
  row: {
    paddingVertical: 2,
  },
  journalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 13,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 14,
  },
  progressSection: {
    gap: 4,
  },
  progressText: {
    fontSize: 11,
    textAlign: 'right',
  },
  spinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 14,
  },
  feedback: {
    fontSize: 12,
    textAlign: 'center',
  },
  closeBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  closeBtnText: {
    fontSize: 14,
  },
});
