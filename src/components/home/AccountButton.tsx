import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useJournals, getLocalStore } from '@/hooks/useStorage';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';
import { useSyncManager } from '@/contexts/SyncManagerContext';
import { SyncProviderModal } from '@/components/home/SyncProviderModal';
import type { RemoteJournalMeta } from '@/lib/sync';
import type { SyncProvider } from '@/lib/sync/types';
import { webModalContent } from '@/styles/web';

const PROVIDER_LABELS: Record<SyncProvider, string> = {
  gdrive: 'Google',
};

export function AccountButton() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const {
    user,
    isSignedIn,
    isLoading,
    accessToken,
    signIn,
    signOut,
    retentionDays,
    setRetentionDays,
  } = useGoogleAuth();
  const { manager, provider } = useSyncManager();
  const { journals: localJournals } = useJournals();
  const [showPopover, setShowPopover] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);

  // Manage journals modal state
  const [showManage, setShowManage] = useState(false);
  const [remoteJournals, setRemoteJournals] = useState<RemoteJournalMeta[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<RemoteJournalMeta | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (isLoading) return null;

  function handleConnectPress() {
    setShowProviderModal(true);
  }

  async function handleProviderSelect(_selectedProvider: SyncProvider) {
    setShowProviderModal(false);
    // Currently only gdrive is supported — trigger Google sign-in
    await signIn();
  }

  if (!isSignedIn) {
    return (
      <>
        <Pressable onPress={handleConnectPress} style={styles.footerRow}>
          <Feather name="cloud" size={14} color={theme.colors.primary} />
          <Text
            style={[
              styles.connectText,
              { color: theme.colors.primary, fontFamily: theme.fonts.regular },
            ]}
          >
            {t.sync.connectAccount}
          </Text>
        </Pressable>
        <SyncProviderModal
          visible={showProviderModal}
          onClose={() => setShowProviderModal(false)}
          onSelect={handleProviderSelect}
        />
      </>
    );
  }

  const providerLabel = provider ? PROVIDER_LABELS[provider] : '';
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  async function handleOpenManage() {
    if (!manager || !accessToken) return;
    setShowPopover(false);
    setManageError(null);
    setManageLoading(true);
    setShowManage(true);
    try {
      await manager.connectWithToken(accessToken);
      const store = manager.getRemoteStore();
      const journals = await store.listRemoteJournals();
      setRemoteJournals(journals);
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err));
    } finally {
      setManageLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!manager || !accessToken || !deleteTarget) return;
    setDeleting(true);
    try {
      await manager.connectWithToken(accessToken);
      const store = manager.getRemoteStore();
      await store.deleteJournal(deleteTarget.id);
      // Disable sync on the local copy if it exists
      const localJournal = localJournals.find((j) => j.id === deleteTarget.id);
      if (localJournal) {
        const localStore = await getLocalStore();
        const full = await localStore.getJournal(localJournal.id);
        if (full) {
          full.settings.syncProvider = undefined;
          full.settings.remoteSync = false;
          full.settings.autoSync = false;
          await localStore.saveJournal(full);
        }
      }
      setRemoteJournals((prev) => prev.filter((j) => j.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const localTitles = new Set(localJournals.map((j) => j.title));

  return (
    <>
      {/* Footer button: avatar + "Logged in with {provider}" */}
      <Pressable onPress={() => setShowPopover(true)} style={styles.footerRow}>
        {user?.photo ? (
          <Image source={{ uri: user.photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.initialsCircle, { backgroundColor: theme.colors.primary }]}>
            <Text
              style={[
                styles.initialsText,
                { color: theme.colors.foreground, fontFamily: theme.fonts.bold },
              ]}
            >
              {initials}
            </Text>
          </View>
        )}
        <Text
          style={[
            styles.loggedInText,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
          ]}
          numberOfLines={1}
        >
          {t.sync.loggedInWith.replace('{provider}', providerLabel)}
        </Text>
      </Pressable>

      {/* Account popover */}
      <Modal
        visible={showPopover}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPopover(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowPopover(false)}>
          <View
            style={[
              styles.popover,
              webModalContent,
              {
                backgroundColor: theme.colors.foreground,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth,
              },
            ]}
          >
            <Text
              style={[styles.email, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}
            >
              {t.sync.signedInAs}
            </Text>
            <Text
              style={[
                styles.emailValue,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
              numberOfLines={1}
            >
              {user?.email}
            </Text>
            <Pressable
              onPress={handleOpenManage}
              style={[styles.actionBtn, { backgroundColor: theme.colors.highlight }]}
            >
              <Feather name="hard-drive" size={14} color={theme.colors.text} />
              <Text
                style={[
                  styles.actionText,
                  { color: theme.colors.text, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.sync.manageJournals}
              </Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                setShowPopover(false);
                await signOut();
              }}
              style={[styles.actionBtn, { backgroundColor: theme.colors.highlight }]}
            >
              <Feather name="log-out" size={14} color={theme.colors.error} />
              <Text
                style={[
                  styles.actionText,
                  { color: theme.colors.error, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.sync.signOut}
              </Text>
            </Pressable>
            {Platform.OS === 'web' && (
              <View style={styles.retentionSection}>
                <Text
                  style={[
                    styles.retentionLabel,
                    { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {t.sync.sessionRetention}
                </Text>
                <View style={styles.retentionRow}>
                  {([1, 7, 30, 0] as const).map((days) => {
                    const label =
                      days === 1
                        ? t.sync.retentionOneDay
                        : days === 7
                          ? t.sync.retentionOneWeek
                          : days === 30
                            ? t.sync.retentionOneMonth
                            : t.sync.retentionNever;
                    const isActive = retentionDays === days;
                    return (
                      <Pressable
                        key={days}
                        onPress={() => setRetentionDays(days)}
                        style={[
                          styles.retentionChip,
                          {
                            backgroundColor: isActive
                              ? theme.colors.primary
                              : theme.colors.highlight,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.retentionChipText,
                            {
                              color: isActive ? theme.colors.foreground : theme.colors.text,
                              fontFamily: isActive ? theme.fonts.bold : theme.fonts.regular,
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Manage journals modal */}
      <Modal
        visible={showManage}
        transparent
        animationType="fade"
        onRequestClose={() => setShowManage(false)}
      >
        <View style={styles.overlay}>
          <View
            style={[
              styles.manageContent,
              webModalContent,
              {
                backgroundColor: theme.colors.foreground,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth,
              },
            ]}
          >
            <Text
              style={[
                styles.manageTitle,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.sync.manageJournals}
            </Text>

            {manageLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
              </View>
            ) : manageError ? (
              <View style={[styles.errorBox, { borderColor: theme.colors.error }]}>
                <Feather name="alert-circle" size={14} color={theme.colors.error} />
                <Text
                  style={[
                    styles.errorText,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {manageError}
                </Text>
              </View>
            ) : remoteJournals.length === 0 ? (
              <Text
                style={[
                  styles.emptyText,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.sync.noCloudJournals}
              </Text>
            ) : (
              <ScrollView style={styles.journalList}>
                {remoteJournals.map((rj) => {
                  const isLocal = localTitles.has(rj.title);
                  return (
                    <View
                      key={rj.id}
                      style={[
                        styles.journalRow,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface,
                        },
                      ]}
                    >
                      <View style={styles.journalInfo}>
                        <Text
                          style={[
                            styles.journalTitle,
                            { color: theme.colors.text, fontFamily: theme.fonts.regular },
                          ]}
                          numberOfLines={1}
                        >
                          {rj.title}
                        </Text>
                        {isLocal && (
                          <View style={styles.localBadge}>
                            <Feather
                              name="check-circle"
                              size={12}
                              color={theme.colors.textSecondary}
                            />
                            <Text
                              style={[
                                styles.localText,
                                {
                                  color: theme.colors.textSecondary,
                                  fontFamily: theme.fonts.regular,
                                },
                              ]}
                            >
                              {t.sync.journalAlreadyLocal}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Pressable
                        onPress={() => setDeleteTarget(rj)}
                        hitSlop={8}
                        style={styles.deleteBtn}
                      >
                        <Feather name="trash-2" size={16} color={theme.colors.error} />
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              onPress={() => setShowManage(false)}
              style={[styles.closeBtn, { backgroundColor: theme.colors.highlight }]}
            >
              <Text
                style={[
                  styles.actionText,
                  { color: theme.colors.text, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.common.close}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        visible={deleteTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteTarget(null)}
      >
        <View style={styles.overlay}>
          <View
            style={[
              styles.confirmContent,
              webModalContent,
              {
                backgroundColor: theme.colors.foreground,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth,
              },
            ]}
          >
            <Text
              style={[
                styles.confirmTitle,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.sync.deleteRemoteJournal}
            </Text>
            <Text
              style={[
                styles.confirmJournalName,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              {deleteTarget?.title}
            </Text>
            <Text
              style={[
                styles.confirmBody,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.sync.deleteRemoteConfirm}
            </Text>
            <View style={styles.confirmButtons}>
              <Pressable
                onPress={() => setDeleteTarget(null)}
                disabled={deleting}
                style={[
                  styles.confirmBtn,
                  { backgroundColor: theme.colors.highlight, opacity: deleting ? 0.5 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.actionText,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {t.common.cancel}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDeleteConfirm}
                disabled={deleting}
                style={[
                  styles.confirmBtn,
                  {
                    backgroundColor: deleting ? theme.colors.highlight : theme.colors.error,
                    opacity: deleting ? 0.5 : 1,
                  },
                ]}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={theme.colors.foreground} />
                ) : (
                  <Text
                    style={[
                      styles.actionText,
                      { color: theme.colors.foreground, fontFamily: theme.fonts.bold },
                    ]}
                  >
                    {t.common.delete}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  connectText: {
    fontSize: 14,
  },
  loggedInText: {
    fontSize: 13,
    flexShrink: 1,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  initialsCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 10,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  popover: {
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 300,
    gap: 8,
  },
  email: {
    fontSize: 12,
  },
  emailValue: {
    fontSize: 14,
    marginBottom: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 14,
  },
  // Manage journals modal
  manageContent: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxHeight: '70%',
  },
  manageTitle: {
    fontSize: 18,
    marginBottom: 16,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
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
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  journalList: {
    marginBottom: 16,
  },
  journalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  journalInfo: {
    flex: 1,
    gap: 4,
  },
  journalTitle: {
    fontSize: 15,
  },
  localBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  localText: {
    fontSize: 12,
  },
  deleteBtn: {
    padding: 8,
  },
  closeBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  // Delete confirmation modal
  confirmContent: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  confirmTitle: {
    fontSize: 18,
    marginBottom: 12,
  },
  confirmJournalName: {
    fontSize: 15,
    marginBottom: 8,
  },
  confirmBody: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  retentionSection: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.3)',
    gap: 8,
  },
  retentionLabel: {
    fontSize: 12,
  },
  retentionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  retentionChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  retentionChipText: {
    fontSize: 12,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
