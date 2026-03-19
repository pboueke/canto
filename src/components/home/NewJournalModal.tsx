import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { IconPicker } from '@/components/common/IconPicker';
import { PasswordStrengthMeter } from '@/components/common/PasswordStrengthMeter';
import { KdfIterationPicker } from '@/components/common/KdfIterationPicker';
import { ThemePickerModal } from '@/components/home/ThemePickerModal';
import { isBiometricAvailable } from '@/lib/biometric';
import { DEFAULT_KDF_ITERATIONS, LEGACY_KDF_ITERATIONS } from '@/lib/encryption/password';
import { deriveKey } from '@/lib/encryption/password';
import { base64ToUint8 } from '@/lib/encryption/utils';
import { type ThemeName, themes } from '@/styles/themes';
import { inspectBackup, importJournal, hasNameConflict, resolveNameConflict } from '@/lib/backup';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';
import { useSyncManager } from '@/contexts/SyncManagerContext';
import type { RemoteJournalMeta } from '@/lib/sync';

interface NewJournalModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (journal: {
    title: string;
    icon: string;
    password?: string;
    biometric?: boolean;
    themeOverride?: string;
    kdfIterations?: number;
  }) => Promise<void>;
  onImportComplete?: (journalId: string) => void;
  existingTitles?: string[];
}

const THEME_DISPLAY_NAMES: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  monokai: 'Monokai',
  solarized: 'Solarized',
  nord: 'Nord',
  dracula: 'Dracula',
};

export function NewJournalModal({
  visible,
  onClose,
  onCreate,
  onImportComplete,
  existingTitles = [],
}: NewJournalModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { isSignedIn, accessToken } = useGoogleAuth();
  const { manager } = useSyncManager();

  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('book');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [biometric, setBiometric] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [kdfIterations, setKdfIterations] = useState(DEFAULT_KDF_ITERATIONS);
  const [themeOverride, setThemeOverride] = useState<string | undefined>(undefined);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPasswordExplain, setShowPasswordExplain] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // Import sub-flow state
  const [importFileUri, setImportFileUri] = useState<string | null>(null);
  const [importNeedsPassword, setImportNeedsPassword] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  const [importSalt, setImportSalt] = useState<string | null>(null);
  const [importKdfIterations, setImportKdfIterations] = useState<number | null>(null);
  const [importOriginalTitle, setImportOriginalTitle] = useState('');
  const [importPasswordOptional, setImportPasswordOptional] = useState(false);
  const [importRenameNeeded, setImportRenameNeeded] = useState(false);
  const [importNewTitle, setImportNewTitle] = useState('');
  // Cloud import state
  const [showCloudImport, setShowCloudImport] = useState(false);
  const [cloudJournals, setCloudJournals] = useState<RemoteJournalMeta[]>([]);
  const [cloudLocalTitles, setCloudLocalTitles] = useState<Set<string>>(new Set());
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricSupported);
  }, []);

  const passwordsMatch = password === '' || password === confirmPassword;
  const canCreate = title.trim().length > 0 && passwordsMatch && !busy;

  async function handleCreate() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    // Let React render the spinner before starting async work
    await new Promise((r) => setTimeout(r, 100));
    try {
      await onCreate({
        title: title.trim(),
        icon,
        password: password || undefined,
        biometric: biometric || undefined,
        themeOverride,
        kdfIterations: password ? kdfIterations : undefined,
      });
      resetForm();
    } catch (err) {
      console.error('[Canto] Journal creation failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy || importing) return;
    resetForm();
    onClose();
  }

  function resetForm() {
    setTitle('');
    setIcon('book');
    setPassword('');
    setConfirmPassword('');
    setBiometric(false);
    setKdfIterations(DEFAULT_KDF_ITERATIONS);
    setThemeOverride(undefined);
    setError(null);
    setImportError(null);
    resetImportState();
  }

  async function handleCloudImport() {
    if (!manager || !accessToken) return;
    setCloudError(null);
    setCloudLoading(true);
    try {
      await manager.connectWithToken(accessToken);
      const store = manager.getRemoteStore();
      const remoteJournals = await store.listRemoteJournals();
      setCloudLocalTitles(new Set(existingTitles));
      setCloudJournals(remoteJournals);
      setShowCloudImport(true);
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : String(err));
    } finally {
      setCloudLoading(false);
    }
  }

  async function handleCloudJournalSelect(remote: RemoteJournalMeta) {
    if (!manager || !accessToken) return;
    setShowCloudImport(false);
    setImporting(true);
    try {
      await manager.connectWithToken(accessToken);
      const store = manager.getRemoteStore();
      const journal = await store.downloadJournalMeta(remote.id);
      if (!journal) throw new Error('Journal not found on remote');

      // Download attachments and save locally
      const { getLocalStore } = await import('@/hooks/useStorage');
      const localStore = await getLocalStore();
      for (const page of journal.pages) {
        const attachments = [...(page.images ?? []), ...(page.files ?? [])].filter(
          (a) => !a.deleted && a.path,
        );
        for (const att of attachments) {
          const filename = att.path.split('/').pop() ?? att.path;
          const remotePath = `gdrive://${journal.id}/attachments/${filename}`;
          const data = await store.downloadAttachment(remotePath);
          if (data) {
            const localPath = await localStore.saveAttachment(journal.id, page.id, att, data);
            att.path = localPath;
          }
        }
      }
      await localStore.saveJournal(journal);
      for (const page of journal.pages) {
        await localStore.savePage(journal.id, page);
      }

      resetForm();
      onClose();
      onImportComplete?.(journal.id);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  function resetImportState() {
    setImportFileUri(null);
    setImportNeedsPassword(false);
    setImportPasswordOptional(false);
    setImportPassword('');
    setImportSalt(null);
    setImportKdfIterations(null);
    setImportOriginalTitle('');
    setImportRenameNeeded(false);
    setImportNewTitle('');
  }

  async function handleImport() {
    setImportError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/zip',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const fileUri = result.assets[0].uri;
      setImporting(true);
      await new Promise((r) => setTimeout(r, 100));

      const info = await inspectBackup(fileUri);
      setImportFileUri(fileUri);
      setImportOriginalTitle(info.manifest.journalTitle);

      if (info.needsPassword || info.canProvidePassword) {
        // Show password sub-modal (required for encrypted ZIPs, optional for unencrypted)
        setImportSalt(info.manifest.salt ?? null);
        setImportKdfIterations(info.manifest.kdfIterations ?? null);
        setImportPasswordOptional(info.canProvidePassword);
        setImportNeedsPassword(true);
        setImporting(false);
        return;
      }

      // Check name conflicts
      if (hasNameConflict(info.manifest.journalTitle, existingTitles)) {
        setImportNewTitle(resolveNameConflict(info.manifest.journalTitle, existingTitles));
        setImportRenameNeeded(true);
        setImporting(false);
        return;
      }

      // No password, no conflict — import directly
      await finishImport(fileUri, info.manifest.journalTitle);
    } catch (err) {
      console.error('[Canto] Import failed:', err);
      setImportError(err instanceof Error ? err.message : String(err));
      setImporting(false);
    }
  }

  async function handleImportPasswordSkip() {
    if (!importFileUri) return;
    setImportNeedsPassword(false);

    // Check name conflicts
    if (hasNameConflict(importOriginalTitle, existingTitles)) {
      setImportNewTitle(resolveNameConflict(importOriginalTitle, existingTitles));
      setImportRenameNeeded(true);
      return;
    }

    // Import without password — encrypted attachments lose their password layer
    setImporting(true);
    await new Promise((r) => setTimeout(r, 100));
    try {
      await finishImport(importFileUri, importOriginalTitle);
    } catch (err) {
      console.error('[Canto] Import failed:', err);
      setImportError(err instanceof Error ? err.message : String(err));
      setImporting(false);
    }
  }

  async function handleImportPasswordSubmit() {
    if (!importFileUri || !importPassword) return;
    setImporting(true);
    setImportNeedsPassword(false);
    await new Promise((r) => setTimeout(r, 100));

    try {
      let key: Uint8Array | undefined;
      if (importSalt) {
        const saltBytes = base64ToUint8(importSalt);
        const iterations = importKdfIterations ?? LEGACY_KDF_ITERATIONS;
        key = await deriveKey(importPassword, saltBytes, iterations);
      }

      // Check name conflicts
      if (hasNameConflict(importOriginalTitle, existingTitles)) {
        setImportNewTitle(resolveNameConflict(importOriginalTitle, existingTitles));
        setImportRenameNeeded(true);
        setImporting(false);
        // Store the key temporarily for use after rename
        // We pass it through the final import call
        return;
      }

      await finishImport(importFileUri, importOriginalTitle, key);
    } catch (err) {
      console.error('[Canto] Import failed:', err);
      setImportError(err instanceof Error ? err.message : String(err));
      setImporting(false);
    }
  }

  async function handleImportRenameSubmit() {
    if (!importFileUri || !importNewTitle.trim()) return;
    setImporting(true);
    setImportRenameNeeded(false);
    await new Promise((r) => setTimeout(r, 100));

    try {
      let key: Uint8Array | undefined;
      if (importSalt && importPassword) {
        const saltBytes = base64ToUint8(importSalt);
        const iterations = importKdfIterations ?? LEGACY_KDF_ITERATIONS;
        key = await deriveKey(importPassword, saltBytes, iterations);
      }

      await finishImport(importFileUri, importNewTitle.trim(), key);
    } catch (err) {
      console.error('[Canto] Import failed:', err);
      setImportError(err instanceof Error ? err.message : String(err));
      setImporting(false);
    }
  }

  async function finishImport(fileUri: string, titleToUse: string, key?: Uint8Array) {
    try {
      const imported = await importJournal(fileUri, titleToUse, key);
      resetForm();
      onClose();
      onImportComplete?.(imported.journalId);
    } catch (err) {
      console.error('[Canto] Import failed:', err);
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: theme.colors.border, paddingTop: insets.top + 12 },
          ]}
        >
          <Pressable onPress={handleClose} style={styles.backBtn}>
            <Feather name="x" size={22} color={theme.colors.text} />
          </Pressable>
          <Text
            style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
          >
            {t.home.newJournal}
          </Text>
          <View style={{ width: 30 }} />
        </View>

        {busy || importing ? (
          <View style={styles.busyContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text
              style={[
                styles.busyText,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
              ]}
            >
              {importing ? t.backup.importing : t.common.loading}
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    borderWidth: theme.borderWidth || 1,
                    backgroundColor: theme.colors.surface,
                    fontFamily: theme.fonts.regular,
                  },
                ]}
                placeholder={t.home.journalName}
                placeholderTextColor={theme.colors.textSecondary}
                value={title}
                onChangeText={setTitle}
                autoFocus
              />

              {/* Icon picker */}
              <Text
                style={[
                  styles.sectionLabel,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
                ]}
              >
                {t.home.selectIcon}
              </Text>
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <IconPicker selected={icon} onSelect={setIcon} />
              </View>

              {/* Theme */}
              <Text
                style={[
                  styles.sectionLabel,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
                ]}
              >
                {t.journalSettings.themeOverride}
              </Text>
              <Pressable
                style={[
                  styles.themeRow,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
                onPress={() => setShowThemePicker(true)}
              >
                <Text
                  style={[
                    styles.themeLabel,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {themeOverride && themeOverride in themes
                    ? (THEME_DISPLAY_NAMES[themeOverride] ?? themeOverride)
                    : t.journalSettings.useGlobalTheme}
                </Text>
                <Feather name="chevron-right" size={18} color={theme.colors.textSecondary} />
              </Pressable>

              {/* Password */}
              <View style={styles.passwordLabelRow}>
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold, margin: 0 },
                  ]}
                >
                  {t.home.passwordOptional}
                </Text>
                <Pressable
                  style={[styles.helpButton, { backgroundColor: theme.colors.primary }]}
                  onPress={() => setShowPasswordExplain(true)}
                  hitSlop={8}
                >
                  <Feather name="help-circle" size={14} color={theme.colors.foreground} />
                </Pressable>
              </View>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    borderWidth: theme.borderWidth || 1,
                    backgroundColor: theme.colors.surface,
                    fontFamily: theme.fonts.regular,
                  },
                ]}
                placeholder={t.home.password}
                placeholderTextColor={theme.colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <PasswordStrengthMeter password={password} />

              {password.length > 0 && (
                <>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: theme.colors.text,
                        borderColor: !passwordsMatch ? theme.colors.error : theme.colors.border,
                        borderWidth: theme.borderWidth || 1,
                        backgroundColor: theme.colors.surface,
                        fontFamily: theme.fonts.regular,
                      },
                    ]}
                    placeholder={t.home.confirmPassword}
                    placeholderTextColor={theme.colors.textSecondary}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                  {!passwordsMatch && confirmPassword.length > 0 && (
                    <Text style={[styles.errorText, { color: theme.colors.error }]}>
                      {t.home.passwordMismatch}
                    </Text>
                  )}
                </>
              )}

              {password.length > 0 && (
                <KdfIterationPicker value={kdfIterations} onChange={setKdfIterations} />
              )}

              {password.length > 0 && (
                <View style={styles.warningRow}>
                  <Feather name="alert-triangle" size={14} color={theme.colors.error} />
                  <Text
                    style={[
                      styles.warningText,
                      { color: theme.colors.error, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {t.home.passwordWarning}
                  </Text>
                </View>
              )}

              {biometricSupported && (
                <View style={styles.biometricRow}>
                  <Feather name="smartphone" size={16} color={theme.colors.text} />
                  <Text
                    style={[
                      styles.biometricLabel,
                      { color: theme.colors.text, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {t.home.biometricLock}
                  </Text>
                  <Switch
                    value={biometric}
                    onValueChange={setBiometric}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  />
                </View>
              )}

              {error && (
                <View style={[styles.errorBox, { borderColor: theme.colors.error }]}>
                  <Feather name="alert-circle" size={14} color={theme.colors.error} />
                  <Text
                    style={[
                      styles.errorBoxText,
                      { color: theme.colors.text, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {error}
                  </Text>
                </View>
              )}

              {/* Import from backup */}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
                <Text
                  style={[
                    styles.dividerText,
                    { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {t.backup.or}
                </Text>
                <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
              </View>

              <Pressable
                onPress={handleImport}
                style={[
                  styles.importButton,
                  { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                ]}
              >
                <Feather name="upload" size={18} color={theme.colors.primary} />
                <Text
                  style={[
                    styles.importText,
                    { color: theme.colors.primary, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {t.backup.importFromBackup}
                </Text>
              </Pressable>

              {isSignedIn && (
                <Pressable
                  onPress={handleCloudImport}
                  disabled={cloudLoading}
                  style={[
                    styles.importButton,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                      opacity: cloudLoading ? 0.5 : 1,
                    },
                  ]}
                >
                  <Feather name="cloud" size={18} color={theme.colors.primary} />
                  <Text
                    style={[
                      styles.importText,
                      { color: theme.colors.primary, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {t.sync.importFromCloud}
                  </Text>
                </Pressable>
              )}

              {cloudError && (
                <View style={[styles.errorBox, { borderColor: theme.colors.error }]}>
                  <Feather name="alert-circle" size={14} color={theme.colors.error} />
                  <Text
                    style={[
                      styles.errorBoxText,
                      { color: theme.colors.text, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {cloudError}
                  </Text>
                </View>
              )}

              {importError && (
                <View style={[styles.errorBox, { borderColor: theme.colors.error }]}>
                  <Feather name="alert-circle" size={14} color={theme.colors.error} />
                  <Text
                    style={[
                      styles.errorBoxText,
                      { color: theme.colors.text, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {importError}
                  </Text>
                </View>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>

            <View
              style={[
                styles.footer,
                { borderTopColor: theme.colors.border, paddingBottom: insets.bottom + 12 },
              ]}
            >
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
                onPress={handleCreate}
                disabled={!canCreate}
                style={[
                  styles.button,
                  {
                    backgroundColor: canCreate ? theme.colors.primary : theme.colors.highlight,
                    opacity: canCreate ? 1 : 0.5,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    {
                      color: canCreate ? theme.colors.foreground : theme.colors.textSecondary,
                      fontFamily: theme.fonts.bold,
                    },
                  ]}
                >
                  {t.common.create}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <Modal
        visible={showPasswordExplain}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPasswordExplain(false)}
      >
        <View style={styles.explainOverlay}>
          <View
            style={[
              styles.explainContent,
              { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
            ]}
          >
            <Text
              style={[
                styles.explainTitle,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.home.passwordExplainTitle}
            </Text>
            <ScrollView style={styles.explainScroll}>
              <Text
                style={[
                  styles.explainBody,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.home.passwordExplainBody}
              </Text>
            </ScrollView>
            <Pressable
              style={[styles.explainCloseBtn, { backgroundColor: theme.colors.highlight }]}
              onPress={() => setShowPasswordExplain(false)}
            >
              <Text
                style={[
                  styles.explainCloseBtnText,
                  { color: theme.colors.text, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.common.close}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Import password prompt */}
      <Modal
        visible={importNeedsPassword}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setImportNeedsPassword(false);
          resetImportState();
        }}
      >
        <View style={styles.explainOverlay}>
          <View
            style={[
              styles.explainContent,
              { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
            ]}
          >
            <Text
              style={[
                styles.explainTitle,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.backup.importFromBackup}
            </Text>
            <Text
              style={[
                styles.explainBody,
                {
                  color: theme.colors.textSecondary,
                  fontFamily: theme.fonts.regular,
                  marginBottom: 16,
                },
              ]}
            >
              {t.backup.importPassword}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  borderWidth: theme.borderWidth || 1,
                  backgroundColor: theme.colors.surface,
                  fontFamily: theme.fonts.regular,
                },
              ]}
              placeholder={t.home.password}
              placeholderTextColor={theme.colors.textSecondary}
              value={importPassword}
              onChangeText={setImportPassword}
              secureTextEntry
              autoFocus
              onSubmitEditing={handleImportPasswordSubmit}
            />
            <View style={styles.footer}>
              <Pressable
                onPress={() => {
                  setImportNeedsPassword(false);
                  resetImportState();
                }}
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
              {importPasswordOptional && (
                <Pressable
                  onPress={handleImportPasswordSkip}
                  style={[styles.button, { backgroundColor: theme.colors.highlight }]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: theme.colors.text, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {t.common.skip}
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={handleImportPasswordSubmit}
                disabled={!importPassword}
                style={[
                  styles.button,
                  {
                    backgroundColor: importPassword ? theme.colors.primary : theme.colors.highlight,
                    opacity: importPassword ? 1 : 0.5,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    {
                      color: importPassword ? theme.colors.foreground : theme.colors.textSecondary,
                      fontFamily: theme.fonts.bold,
                    },
                  ]}
                >
                  {t.common.confirm}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Import rename prompt */}
      <Modal
        visible={importRenameNeeded}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setImportRenameNeeded(false);
          resetImportState();
        }}
      >
        <View style={styles.explainOverlay}>
          <View
            style={[
              styles.explainContent,
              { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
            ]}
          >
            <Text
              style={[
                styles.explainTitle,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.backup.importRename}
            </Text>
            <Text
              style={[
                styles.explainBody,
                {
                  color: theme.colors.textSecondary,
                  fontFamily: theme.fonts.regular,
                  marginBottom: 16,
                },
              ]}
            >
              {t.backup.importConflict}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  borderWidth: theme.borderWidth || 1,
                  backgroundColor: theme.colors.surface,
                  fontFamily: theme.fonts.regular,
                },
              ]}
              value={importNewTitle}
              onChangeText={setImportNewTitle}
              autoFocus
              onSubmitEditing={handleImportRenameSubmit}
            />
            <View style={styles.footer}>
              <Pressable
                onPress={() => {
                  setImportRenameNeeded(false);
                  resetImportState();
                }}
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
                onPress={handleImportRenameSubmit}
                disabled={!importNewTitle.trim()}
                style={[
                  styles.button,
                  {
                    backgroundColor: importNewTitle.trim()
                      ? theme.colors.primary
                      : theme.colors.highlight,
                    opacity: importNewTitle.trim() ? 1 : 0.5,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    {
                      color: importNewTitle.trim()
                        ? theme.colors.foreground
                        : theme.colors.textSecondary,
                      fontFamily: theme.fonts.bold,
                    },
                  ]}
                >
                  {t.common.confirm}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ThemePickerModal
        visible={showThemePicker}
        onClose={() => setShowThemePicker(false)}
        showGlobalOption
        selectedTheme={
          themeOverride && themeOverride in themes ? (themeOverride as ThemeName) : undefined
        }
        onSelect={(name) => {
          setThemeOverride(name ?? undefined);
        }}
      />

      {/* Cloud import picker */}
      <Modal
        visible={showCloudImport}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCloudImport(false)}
      >
        <View style={styles.explainOverlay}>
          <View
            style={[
              styles.explainContent,
              { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
            ]}
          >
            <Text
              style={[
                styles.explainTitle,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.sync.importFromCloud}
            </Text>
            {cloudJournals.length === 0 ? (
              <Text
                style={[
                  styles.explainBody,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.sync.noCloudJournals}
              </Text>
            ) : (
              <ScrollView style={styles.explainScroll}>
                {cloudJournals.map((rj) => {
                  const isLocal = cloudLocalTitles.has(rj.title);
                  return (
                    <Pressable
                      key={rj.id}
                      onPress={() => !isLocal && handleCloudJournalSelect(rj)}
                      disabled={isLocal}
                      style={[
                        styles.importButton,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface,
                          opacity: isLocal ? 0.5 : 1,
                          paddingHorizontal: 14,
                          justifyContent: 'flex-start',
                        },
                      ]}
                    >
                      <Feather
                        name={isLocal ? 'check-circle' : 'book'}
                        size={16}
                        color={isLocal ? theme.colors.textSecondary : theme.colors.text}
                      />
                      <Text
                        style={[
                          styles.importText,
                          {
                            color: isLocal ? theme.colors.textSecondary : theme.colors.text,
                            fontFamily: theme.fonts.regular,
                            flex: 1,
                          },
                        ]}
                      >
                        {rj.title}
                      </Text>
                      {isLocal && (
                        <Text
                          style={{
                            color: theme.colors.textSecondary,
                            fontFamily: theme.fonts.regular,
                            fontSize: 12,
                          }}
                        >
                          {t.sync.journalAlreadyLocal}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <Pressable
              style={[styles.explainCloseBtn, { backgroundColor: theme.colors.highlight }]}
              onPress={() => setShowCloudImport(false)}
            >
              <Text
                style={[
                  styles.explainCloseBtnText,
                  { color: theme.colors.text, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.common.close}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
  },
  busyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 15,
  },
  busyText: {
    fontSize: 14,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
  },
  input: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 12,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 12,
    marginBottom: 4,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 4,
  },
  themeLabel: {
    fontSize: 15,
  },
  errorText: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: 8,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  warningText: {
    fontSize: 12,
    flex: 1,
  },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    marginTop: 4,
  },
  biometricLabel: {
    fontSize: 14,
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginTop: 8,
  },
  errorBoxText: {
    fontSize: 13,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
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
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 12,
    marginLeft: 4,
  },
  helpButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explainOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 30,
  },
  explainContent: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    maxHeight: '70%',
  },
  explainTitle: {
    fontSize: 18,
    marginBottom: 16,
  },
  explainScroll: {
    marginBottom: 16,
  },
  explainBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  explainCloseBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  explainCloseBtnText: {
    fontSize: 14,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    textTransform: 'uppercase',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 14,
    marginBottom: 8,
  },
  importText: {
    fontSize: 15,
  },
});
