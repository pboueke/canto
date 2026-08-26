import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';
import { useSyncManager, useSyncState } from '@/contexts/SyncManagerContext';
import { useSaveJournal } from '@/hooks/useStorage';
import type { JournalContent, JournalSettings } from 'canto-data';
import { webModalContent } from '@/styles/web';
import { formatSyncWarning } from '@/lib/sync/warnings';
import type { SyncRunOutcome } from '@/lib/sync';

interface SyncModalProps {
  visible: boolean;
  journal: Omit<JournalContent, 'pages'>;
  derivedKey: Uint8Array | null;
  onClose: () => void;
  onJournalChanged: () => void;
}

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

export function SyncModal({
  visible,
  journal,
  derivedKey,
  onClose,
  onJournalChanged,
}: SyncModalProps) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const { isSignedIn, signIn } = useGoogleAuth();
  const { syncJournal, cancelSync, manager } = useSyncManager();
  const syncState = useSyncState(journal.id);
  const { saveJournalMetadata } = useSaveJournal();

  const [feedback, setFeedback] = useState<string | null>(null);

  const isSyncEnabled = journal.settings.syncProvider === 'gdrive';
  const formatWarnings = useCallback(
    (warnings: { name: string; size?: number; reason: string }[]) =>
      warnings
        .map((warning) =>
          formatSyncWarning(warning, lang, {
            legacyAttachmentTooLarge: t.sync.syncDeferredAttachments,
            chunkGenerationMissing: t.sync.syncDeferredChunkGeneration,
            attachmentNotFound: t.sync.syncDeferredAttachmentNotFound,
          }),
        )
        .join('\n'),
    [lang, t],
  );

  const updateSettings = useCallback(
    async (patch: Partial<JournalSettings>) => {
      const updated = {
        ...journal,
        settings: { ...journal.settings, ...patch },
      };
      await saveJournalMetadata(updated, derivedKey ?? undefined);
      onJournalChanged();
    },
    [journal, derivedKey, saveJournalMetadata, onJournalChanged],
  );

  const formatResultFeedback = useCallback(
    (outcome: SyncRunOutcome) => {
      if (outcome.kind === 'cancelled') return null;
      if (outcome.kind === 'not-ready' || outcome.kind === 'already-running')
        return t.common.loading;
      if (outcome.kind === 'authentication-required') return t.sync.signInToGoogle;
      if (outcome.kind === 'failed') return t.sync.syncError;
      if (outcome.kind === 'checkpointed') return t.sync.syncCheckpointed;

      const result = outcome.result;
      const primary =
        result.warnings.length > 0 ? formatWarnings(result.warnings) : t.sync.syncComplete;
      return result.requiresFreshRenderer ? `${primary}\n${t.sync.syncCheckpointed}` : primary;
    },
    [formatWarnings, t],
  );

  const handleEnableSync = useCallback(async () => {
    await updateSettings({
      syncProvider: 'gdrive',
      remoteSync: true,
      autoSync: true,
    });
    setFeedback(t.sync.syncing);
    const result = await syncJournal(journal.id, derivedKey ?? undefined);
    setFeedback(formatResultFeedback(result));
  }, [updateSettings, syncJournal, journal.id, derivedKey, t, formatResultFeedback]);

  const handleDisableSync = useCallback(async () => {
    // Invalidate the active run before changing settings so it cannot write a
    // stale success state or continue uploading after the user disables sync.
    cancelSync(journal.id);
    await updateSettings({
      syncProvider: undefined,
      remoteSync: false,
      autoSync: false,
    });
    setFeedback(null);
  }, [cancelSync, journal.id, updateSettings]);

  const handleSyncNow = useCallback(async () => {
    setFeedback(t.sync.syncing);
    const result = await syncJournal(journal.id, derivedKey ?? undefined);
    setFeedback(formatResultFeedback(result));
  }, [syncJournal, journal.id, derivedKey, t, formatResultFeedback]);

  const handleAutoSyncToggle = useCallback(
    (val: boolean) => updateSettings({ autoSync: val }),
    [updateSettings],
  );

  const lastSyncedText = syncState.lastSynced
    ? new Date(syncState.lastSynced).toLocaleString()
    : t.sync.neverSynced;

  const isSyncing = syncState.status === 'syncing';
  const isCheckpointed = syncState.status === 'checkpointed';
  const requiresFreshRenderer = syncState.requiresFreshRenderer === true;
  const syncBlocked = isCheckpointed || requiresFreshRenderer || !manager;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
            {t.sync.sync}
          </Text>

          {/* Sync status */}
          <View style={styles.row}>
            <Text
              style={[
                styles.label,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
              ]}
            >
              {isSyncEnabled ? 'Google Drive' : t.sync.notConfigured}
            </Text>
          </View>

          {!isSignedIn ? (
            <Pressable
              onPress={signIn}
              style={[styles.actionBtn, { backgroundColor: theme.colors.primary }]}
            >
              <Feather name="log-in" size={16} color={theme.colors.foreground} />
              <Text
                style={[
                  styles.actionBtnText,
                  { color: theme.colors.foreground, fontFamily: theme.fonts.bold },
                ]}
              >
                {t.sync.signInToGoogle}
              </Text>
            </Pressable>
          ) : (
            <>
              {!isSyncEnabled ? (
                <Pressable
                  onPress={handleEnableSync}
                  style={[styles.actionBtn, { backgroundColor: theme.colors.primary }]}
                >
                  <Feather name="cloud" size={16} color={theme.colors.foreground} />
                  <Text
                    style={[
                      styles.actionBtnText,
                      { color: theme.colors.foreground, fontFamily: theme.fonts.bold },
                    ]}
                  >
                    {t.sync.enableGDriveSync}
                  </Text>
                </Pressable>
              ) : (
                <>
                  {/* Progress bar during sync */}
                  {isSyncing && syncState.progress && (
                    <View style={styles.progressSection}>
                      <ProgressBar
                        current={syncState.progress.current}
                        total={syncState.progress.total}
                      />
                      <Text
                        style={[
                          styles.progressText,
                          { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                        ]}
                      >
                        {syncState.progress.current}/{syncState.progress.total}
                      </Text>
                    </View>
                  )}

                  {/* Auto-sync toggle */}
                  <View style={styles.settingRow}>
                    <Text
                      style={[
                        styles.settingLabel,
                        { color: theme.colors.text, fontFamily: theme.fonts.regular },
                      ]}
                    >
                      {t.sync.autoSync}
                    </Text>
                    <Switch
                      value={journal.settings.autoSync}
                      onValueChange={handleAutoSyncToggle}
                      trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                    />
                  </View>

                  {/* Last synced */}
                  <View style={styles.row}>
                    <Text
                      style={[
                        styles.label,
                        { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                      ]}
                    >
                      {t.sync.lastSynced}: {lastSyncedText}
                    </Text>
                  </View>

                  {/* Sync now */}
                  <Pressable
                    testID="sync-now-button"
                    onPress={handleSyncNow}
                    disabled={isSyncing || syncBlocked}
                    accessibilityState={{ disabled: isSyncing || syncBlocked }}
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: theme.colors.primary,
                        opacity: isSyncing || syncBlocked ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Feather name="refresh-cw" size={16} color={theme.colors.foreground} />
                    <Text
                      style={[
                        styles.actionBtnText,
                        { color: theme.colors.foreground, fontFamily: theme.fonts.bold },
                      ]}
                    >
                      {isSyncing ? t.sync.syncing : t.sync.syncNow}
                    </Text>
                  </Pressable>

                  {!manager && (
                    <Text
                      style={[
                        styles.feedback,
                        { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                      ]}
                    >
                      {t.common.loading}
                    </Text>
                  )}

                  {/* Disable */}
                  <Pressable onPress={handleDisableSync} style={styles.disableRow}>
                    <Text
                      style={[
                        styles.disableText,
                        { color: theme.colors.error, fontFamily: theme.fonts.regular },
                      ]}
                    >
                      {t.sync.disableSync}
                    </Text>
                  </Pressable>
                </>
              )}
            </>
          )}

          {/* Feedback */}
          {(feedback || syncBlocked) && !isSyncing && (
            <Text
              style={[
                styles.feedback,
                {
                  color: feedback === t.sync.syncError ? theme.colors.error : theme.colors.primary,
                  fontFamily: theme.fonts.regular,
                },
              ]}
            >
              {feedback ?? t.sync.syncCheckpointed}
            </Text>
          )}

          <Pressable
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: theme.colors.highlight }]}
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
  disableRow: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  disableText: {
    fontSize: 13,
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
