import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';
import { useSyncManager } from '@/contexts/SyncManagerContext';
import { useSaveJournal } from '@/hooks/useStorage';
import type { JournalContent, JournalSettings } from '@/models';

interface SyncModalProps {
  visible: boolean;
  journal: JournalContent;
  derivedKey: Uint8Array | null;
  onClose: () => void;
  onJournalChanged: () => void;
}

export function SyncModal({
  visible,
  journal,
  derivedKey,
  onClose,
  onJournalChanged,
}: SyncModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { isSignedIn, signIn } = useGoogleAuth();
  const { syncJournal, getSyncState } = useSyncManager();
  const { saveJournal } = useSaveJournal();

  const [syncState, setSyncState] = useState(getSyncState(journal.id));
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSyncState(getSyncState(journal.id));
      setFeedback(null);
    }
  }, [visible, journal.id, getSyncState]);

  const isSyncEnabled = journal.settings.syncProvider === 'gdrive';

  const updateSettings = useCallback(
    async (patch: Partial<JournalSettings>) => {
      const updated: JournalContent = {
        ...journal,
        settings: { ...journal.settings, ...patch },
      };
      await saveJournal(updated, derivedKey ?? undefined);
      onJournalChanged();
    },
    [journal, derivedKey, saveJournal, onJournalChanged],
  );

  const handleEnableSync = useCallback(async () => {
    await updateSettings({
      syncProvider: 'gdrive',
      remoteSync: true,
      autoSync: true,
    });
    // Trigger initial sync
    setFeedback(t.sync.syncing);
    const result = await syncJournal(journal.id, derivedKey ?? undefined);
    if (result) {
      setFeedback(t.sync.syncComplete);
      setSyncState(getSyncState(journal.id));
    } else {
      setFeedback(t.sync.syncError);
      setSyncState(getSyncState(journal.id));
    }
  }, [updateSettings, syncJournal, journal.id, derivedKey, getSyncState, t]);

  const handleDisableSync = useCallback(async () => {
    await updateSettings({
      syncProvider: undefined,
      remoteSync: false,
      autoSync: false,
    });
    setFeedback(null);
  }, [updateSettings]);

  const handleSyncNow = useCallback(async () => {
    setFeedback(t.sync.syncing);
    const result = await syncJournal(journal.id, derivedKey ?? undefined);
    if (result) {
      setFeedback(t.sync.syncComplete);
    } else {
      setFeedback(t.sync.syncError);
    }
    setSyncState(getSyncState(journal.id));
  }, [syncJournal, journal.id, derivedKey, getSyncState, t]);

  const handleAutoSyncToggle = useCallback(
    (val: boolean) => updateSettings({ autoSync: val }),
    [updateSettings],
  );

  const lastSyncedText = syncState.lastSynced
    ? new Date(syncState.lastSynced).toLocaleString()
    : t.sync.neverSynced;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
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
                    onPress={handleSyncNow}
                    disabled={syncState.status === 'syncing'}
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: theme.colors.primary,
                        opacity: syncState.status === 'syncing' ? 0.5 : 1,
                      },
                    ]}
                  >
                    {syncState.status === 'syncing' ? (
                      <ActivityIndicator size="small" color={theme.colors.foreground} />
                    ) : (
                      <Feather name="refresh-cw" size={16} color={theme.colors.foreground} />
                    )}
                    <Text
                      style={[
                        styles.actionBtnText,
                        { color: theme.colors.foreground, fontFamily: theme.fonts.bold },
                      ]}
                    >
                      {t.sync.syncNow}
                    </Text>
                  </Pressable>

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
          {feedback && (
            <Text
              style={[
                styles.feedback,
                {
                  color: feedback === t.sync.syncError ? theme.colors.error : theme.colors.primary,
                  fontFamily: theme.fonts.regular,
                },
              ]}
            >
              {feedback}
            </Text>
          )}

          {syncState.error && (
            <Text
              style={[
                styles.feedback,
                { color: theme.colors.error, fontFamily: theme.fonts.regular },
              ]}
            >
              {syncState.error}
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
