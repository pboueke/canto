import { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
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
import { aesGcmDecrypt, base64ToUint8 } from '@/lib/encryption/utils';
import { type ThemeName, themes } from '@/styles/themes';
import { webModalContent } from '@/styles/web';
import { inspectBackup, importJournal, hasNameConflict, resolveNameConflict } from '@/lib/backup';
import type { AttachmentError } from '@/lib/backup/import';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';
import { useSyncManager } from '@/contexts/SyncManagerContext';
import type { JournalContent, Page } from 'canto-data';
import type { RemoteJournalMeta, DownloadFailure } from '@/lib/sync';
import { GDriveApiError, GDriveAuthenticationError } from '@/lib/sync/gdrive/api';
import { downloadCloudPageAttachments } from '@/lib/sync/cloud-attachment-import';
import { safeJsonParse } from '@/lib/utils/json';
import { DataIntegrityWarningModal } from '@/components/common/DataIntegrityWarningModal';
import { retryWithBackoff } from '@/lib/sync/retry';
import { formatSyncWarning } from '@/lib/sync/warnings';
import { describeError } from '@/lib/utils/error';

type CloudImportPhase = 'idle' | 'preparing' | 'downloading';

const CLOUD_IMPORT_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
const CLOUD_IMPORT_RETRY_ATTEMPTS = 5;

class CloudImportAuthenticationError extends Error {
  constructor() {
    super('Google Drive session expired. Please sign in again.');
    this.name = 'CloudImportAuthenticationError';
  }
}

/**
 * A page attempt also writes attachments to local storage. Retrying a parse,
 * quota, or other local error cannot repair it and made a failed large import
 * spend the full backoff budget once for every page. Drive's request layer
 * already retries transient transport failures once; this outer retry is only
 * for a recoverable HTTP response.
 */
function shouldRetryCloudImportPage(error: unknown): boolean {
  if (!(error instanceof GDriveApiError)) return false;
  return (
    error.status === 401 || error.status === 408 || error.status === 429 || error.status >= 500
  );
}

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
  existingIds?: string[];
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
  existingIds = [],
}: NewJournalModalProps) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { isSignedIn, accessToken, getAccessToken } = useGoogleAuth();
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
  const [cloudImportPhase, setCloudImportPhase] = useState<CloudImportPhase>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  // Import sub-flow state
  const [importFileUri, setImportFileUri] = useState<string | null>(null);
  const [importSourceFingerprint, setImportSourceFingerprint] = useState<string | undefined>();
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
  const [cloudLocalIds, setCloudLocalIds] = useState<Set<string>>(new Set());
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [pendingCloudRemote, setPendingCloudRemote] = useState<RemoteJournalMeta | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [canCancelFileImport, setCanCancelFileImport] = useState(false);
  const fileImportAbortRef = useRef<AbortController | null>(null);
  // Data integrity warning state
  const [integrityWarning, setIntegrityWarning] = useState<{
    type: 'sync' | 'import';
    details: string[];
    syncFailures?: DownloadFailure[];
    attachmentErrors?: AttachmentError[];
    retryRemote?: RemoteJournalMeta;
  } | null>(null);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricSupported);
  }, []);

  const passwordsMatch = password === '' || password === confirmPassword;
  const canCreate = title.trim().length > 0 && passwordsMatch && !busy;
  const isImportBusy = busy || importing || cloudLoading || cloudImportPhase !== 'idle';

  function formatImportError(error: unknown): string {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes('cancelled')) return t.common.cancel;
    if (message.includes('password') || message.includes('ghash') || message.includes('decrypt')) {
      return t.home.wrongPassword;
    }
    if (
      message.includes('google drive') ||
      message.includes('authentication') ||
      message.includes('401')
    ) {
      return t.sync.signInToGoogle;
    }
    if (
      message.includes('invalid backup') ||
      message.includes('missing manifest') ||
      message.includes('unsupported') ||
      message.includes('fingerprint')
    ) {
      return t.backup.invalidFile;
    }
    return t.backup.importError;
  }

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
      setError((err instanceof Error ? err.message : String(err)) || 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (isImportBusy) return;
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
    setPendingCloudRemote(null);
    resetImportState();
  }

  async function handleCloudImport() {
    if (!manager || !accessToken) return;
    setCloudError(null);
    setCloudLoading(true);
    // Let React show feedback before a potentially slow Drive request starts.
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Google Drive session expired. Please sign in again.');
      await manager.connectWithToken(token, getAccessToken);
      const store = manager.getRemoteStore();
      const remoteJournals = await store.listRemoteJournals();
      setCloudLocalIds(new Set(existingIds));
      setCloudJournals(remoteJournals);
      setShowCloudImport(true);
    } catch (err) {
      setCloudError(formatImportError(err));
    } finally {
      setCloudLoading(false);
    }
  }

  async function handleCloudJournalSelect(remote: RemoteJournalMeta) {
    if (!manager || !accessToken) return;
    setShowCloudImport(false);

    // If the journal is password-protected, prompt for the password first
    if (remote.encrypted) {
      setPendingCloudRemote(remote);
      setImportPassword('');
      setImportNeedsPassword(true);
      return;
    }

    await executeCloudImport(remote, '');
  }

  async function executeCloudImport(remote: RemoteJournalMeta, password: string) {
    let incompleteJournalId: string | null = null;
    setCloudImportPhase('preparing');
    setImportProgress(null);
    // PBKDF2 can be expensive on Android. Paint the loading state before key
    // derivation so submitting a password never appears to do nothing.
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Google Drive session expired. Please sign in again.');
      await manager!.connectWithToken(token, getAccessToken);
      const store = manager!.getRemoteStore();

      // Derive sync key from salt
      if (!remote.salt) throw new Error('Journal has no salt — cannot decrypt');
      const saltBytes = base64ToUint8(remote.salt);
      const iterations = remote.kdfIterations ?? DEFAULT_KDF_ITERATIONS;
      const syncKey = await deriveKey(password, saltBytes, iterations);

      // Download and decrypt journal metadata
      const encryptedMetaCandidates = store.downloadJournalMetaCandidates
        ? await store.downloadJournalMetaCandidates(remote.id)
        : [await store.downloadJournalMeta(remote.id)].filter((value): value is string => !!value);
      if (encryptedMetaCandidates.length === 0) throw new Error('Journal not found on remote');
      let metaJson: string | undefined;
      let metaDecryptError: unknown;
      for (const encryptedMeta of encryptedMetaCandidates) {
        try {
          metaJson = await aesGcmDecrypt(encryptedMeta, syncKey);
          break;
        } catch (err) {
          metaDecryptError = err;
        }
      }
      if (!metaJson) {
        throw new Error(
          `Cloud metadata cannot be decrypted (journal ${remote.id}; ${encryptedMetaCandidates.length} candidate(s); ` +
            `encrypted=${remote.encrypted ?? false}; KDF ${iterations}). ` +
            `The remote sync key does not match the registry metadata: ${
              metaDecryptError instanceof Error
                ? metaDecryptError.message
                : String(metaDecryptError)
            }`,
        );
      }
      const meta = safeJsonParse<JournalContent>(metaJson, 'cloud-import-meta');
      const journal: JournalContent = { ...meta, pages: [] };

      // Download sync index to know which pages exist
      const syncIndex = await store.downloadSyncIndex(remote.id);
      const pageIds = syncIndex
        ? Object.keys(syncIndex).filter((id) => !syncIndex[id].deleted)
        : [];
      const total = pageIds.length;
      let current = 0;

      // Download and decrypt each page
      const { getLocalStore } = await import('@/hooks/useStorage');
      const localStore = await getLocalStore();
      const importWarnings: { name: string; size?: number; reason: string; pageId: string }[] = [];
      const downloadFailures: DownloadFailure[] = [];
      // Cloud attachment downloads write into the destination journal root as
      // they stream. Keep that root invisible and recoverable until the final
      // metadata/pages/catalog publication has been verified.
      await localStore.beginJournalImport?.(journal.id);
      incompleteJournalId = journal.id;
      await localStore.updateJournalImport?.(journal.id, 'writing');

      setCloudImportPhase('downloading');
      setImportProgress({ current: 0, total });

      async function downloadOnePage(pageId: string): Promise<Page | null> {
        const encryptedPage = await store.downloadPage(remote.id, pageId);
        if (!encryptedPage) {
          throw new Error('Not found on remote');
        }
        const pageJson = await aesGcmDecrypt(encryptedPage, syncKey);
        const page = safeJsonParse<Page>(pageJson, `page:${pageId}`);

        const attachmentWarnings = await downloadCloudPageAttachments({
          journalId: remote.id,
          page,
          syncKey,
          localStore,
          remoteStore: store,
        });
        importWarnings.push(
          ...attachmentWarnings.map((warning) => ({ ...warning, pageId: page.id })),
        );
        return page;
      }

      for (const pageId of pageIds) {
        try {
          const page = await retryWithBackoff(() => downloadOnePage(pageId), {
            attempts: CLOUD_IMPORT_RETRY_ATTEMPTS,
            delaysMs: CLOUD_IMPORT_RETRY_DELAYS_MS,
            shouldRetry: shouldRetryCloudImportPage,
            onAttempt: async (attempt, err) => {
              console.warn('[Canto] Cloud import page retry', { pageId, attempt, err });
            },
          });
          if (page) journal.pages.push(page);
        } catch (err) {
          // Continuing after authentication has failed turns one expired
          // session into a warning for every page and can keep a large import
          // running for hours. The outer handler rolls back its staging root.
          if (
            err instanceof CloudImportAuthenticationError ||
            err instanceof GDriveAuthenticationError
          ) {
            throw new CloudImportAuthenticationError();
          }
          downloadFailures.push({
            name: `${pageId}.json`,
            reason: describeError(err),
          });
        }
        current++;
        setImportProgress({ current, total });
      }

      // Show integrity warning if some pages failed
      if (downloadFailures.length > 0) {
        try {
          await localStore.abortJournalImport?.(journal.id);
          incompleteJournalId = null;
        } catch (cleanupErr) {
          console.warn('[Canto] Cleanup of incomplete cloud import failed:', cleanupErr);
        }
        setCloudImportPhase('idle');
        setIntegrityWarning({
          type: 'sync',
          details: downloadFailures.map((f) => `${f.name}: ${f.reason}`),
          syncFailures: downloadFailures,
          retryRemote: remote,
        });
        return;
      }

      const importKey = remote.encrypted && password ? syncKey : undefined;
      // saveJournal publishes pages and their catalog together. Writing each
      // page a second time would both duplicate I/O and invalidate imported
      // modification timestamps.
      try {
        await localStore.updateJournalImport?.(journal.id, 'publishing', {
          expectedPageCount: journal.pages.length,
        });
        await localStore.saveJournal(journal, importKey);
        await localStore.updateJournalImport?.(journal.id, 'committed');
        await localStore.completeJournalImport?.(journal.id);
        incompleteJournalId = null;
      } catch (saveErr) {
        try {
          await localStore.abortJournalImport?.(journal.id);
          incompleteJournalId = null;
        } catch (cleanupErr) {
          console.warn('[Canto] Cleanup of partial cloud import failed:', cleanupErr);
        }
        throw saveErr;
      }

      // Seed the SyncManager's lastKnownRemoteSalt so the next sync correctly
      // identifies that local matches remote — otherwise the engine would treat
      // this as a "no history" first-sync and risk overwriting remote on any
      // future password change.
      if (remote.salt && manager) {
        await manager.recordRemoteSalt(remote.id, remote.salt);
      }

      if (importWarnings.length > 0) {
        // The journal is safely imported, but unsafe legacy attachments remain
        // absent. Show the same localized, per-file result as normal sync;
        // never leave this important state in a console-only English warning.
        onImportComplete?.(journal.id);
        setIntegrityWarning({
          type: 'import',
          details: importWarnings.map((warning) =>
            formatSyncWarning(warning, lang, {
              legacyAttachmentTooLarge: t.sync.syncDeferredAttachments,
              chunkGenerationMissing: t.sync.syncDeferredChunkGeneration,
              attachmentNotFound: t.sync.syncDeferredAttachmentNotFound,
            }),
          ),
        });
        return;
      }

      resetForm();
      onClose();
      onImportComplete?.(journal.id);
    } catch (err) {
      if (incompleteJournalId) {
        try {
          const { getLocalStore } = await import('@/hooks/useStorage');
          const localStore = await getLocalStore();
          await localStore.abortJournalImport?.(incompleteJournalId);
        } catch (cleanupErr) {
          console.warn('[Canto] Cleanup of interrupted cloud import failed:', cleanupErr);
        }
      }
      console.error('[Canto] Cloud import failed:', err);
      setImportError(formatImportError(err));
    } finally {
      setCloudImportPhase('idle');
      setImportProgress(null);
    }
  }

  function resetImportState() {
    setImportFileUri(null);
    setImportSourceFingerprint(undefined);
    setImportNeedsPassword(false);
    setImportPasswordOptional(false);
    setImportPassword('');
    setImportSalt(null);
    setImportKdfIterations(null);
    setImportOriginalTitle('');
    setImportRenameNeeded(false);
    setImportNewTitle('');
    setImportProgress(null);
    setCanCancelFileImport(false);
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
      setImportSourceFingerprint(info.sourceFingerprint);
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
      await finishImport(fileUri, info.manifest.journalTitle, undefined, info.sourceFingerprint);
    } catch (err) {
      console.error('[Canto] Import failed:', err);
      setImportError(formatImportError(err));
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
      await finishImport(importFileUri, importOriginalTitle, undefined, importSourceFingerprint);
    } catch (err) {
      console.error('[Canto] Import failed:', err);
      setImportError(formatImportError(err));
      setImporting(false);
    }
  }

  async function handleImportPasswordSubmit() {
    if (!importPassword) return;
    setImportNeedsPassword(false);

    // Cloud import path: resume with the password
    if (pendingCloudRemote) {
      const remote = pendingCloudRemote;
      setPendingCloudRemote(null);
      await executeCloudImport(remote, importPassword);
      return;
    }

    if (!importFileUri) return;
    setImporting(true);
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

      await finishImport(importFileUri, importOriginalTitle, key, importSourceFingerprint);
    } catch (err) {
      console.error('[Canto] Import failed:', err);
      setImportError(formatImportError(err));
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

      await finishImport(importFileUri, importNewTitle.trim(), key, importSourceFingerprint);
    } catch (err) {
      console.error('[Canto] Import failed:', err);
      setImportError(formatImportError(err));
      setImporting(false);
    }
  }

  async function finishImport(
    fileUri: string,
    titleToUse: string,
    key?: Uint8Array,
    expectedSourceFingerprint?: string,
  ) {
    const controller = new AbortController();
    fileImportAbortRef.current = controller;
    setCanCancelFileImport(true);
    try {
      const imported = await importJournal(
        fileUri,
        titleToUse,
        key,
        (progress) => setImportProgress({ current: progress.current, total: progress.total }),
        controller.signal,
        expectedSourceFingerprint,
      );

      if (imported.attachmentErrors && imported.attachmentErrors.length > 0) {
        // Show warning but still complete the import
        setIntegrityWarning({
          type: 'import',
          details: imported.attachmentErrors.map((e) => e.name),
          attachmentErrors: imported.attachmentErrors,
        });
        // Don't close yet — the warning modal will show.
        // The journal is already imported, so call onImportComplete.
        onImportComplete?.(imported.journalId);
      } else {
        resetForm();
        onClose();
        onImportComplete?.(imported.journalId);
      }
    } catch (err) {
      console.error('[Canto] Import failed:', err);
      setImportError(formatImportError(err));
    } finally {
      if (fileImportAbortRef.current === controller) fileImportAbortRef.current = null;
      setCanCancelFileImport(false);
      setImporting(false);
    }
  }

  function cancelFileImport() {
    fileImportAbortRef.current?.abort();
  }

  return (
    <Modal
      visible={visible}
      transparent={isWeb}
      animationType={isWeb ? 'fade' : 'slide'}
      onRequestClose={handleClose}
    >
      <View style={isWeb ? styles.overlayWeb : styles.overlayNative}>
        <View
          style={[
            isWeb ? styles.containerWeb : styles.containerNative,
            isWeb ? webModalContent : null,
            isWeb
              ? {
                  backgroundColor: theme.colors.foreground,
                  borderColor: theme.colors.border,
                  borderWidth: theme.borderWidth,
                }
              : { backgroundColor: theme.colors.background },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                borderBottomColor: theme.colors.border,
                paddingTop: isWeb ? 12 : insets.top + 12,
              },
            ]}
          >
            <Pressable onPress={handleClose} style={styles.backBtn}>
              <Feather name="x" size={22} color={theme.colors.text} />
            </Pressable>
            <Text
              style={[
                styles.headerTitle,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.home.newJournal}
            </Text>
            <View style={{ width: 30 }} />
          </View>

          {isImportBusy ? (
            <View style={styles.busyContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text
                style={[
                  styles.busyText,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {cloudLoading
                  ? t.common.loading
                  : cloudImportPhase === 'preparing'
                    ? t.sync.preparingImport
                    : importing || cloudImportPhase === 'downloading'
                      ? t.backup.importing
                      : t.common.loading}
              </Text>
              {importProgress && importProgress.total > 0 && cloudImportPhase !== 'preparing' && (
                <>
                  <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: theme.colors.primary,
                          width: `${Math.round((importProgress.current / importProgress.total) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.progressText,
                      { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {importProgress.current} / {importProgress.total}
                  </Text>
                </>
              )}
              {importing && canCancelFileImport && (
                <Pressable
                  onPress={cancelFileImport}
                  style={[styles.cancelImport, { borderColor: theme.colors.border }]}
                >
                  <Text
                    style={[
                      styles.cancelImportText,
                      { color: theme.colors.text, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {t.common.cancel}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={{ flex: 1 }}>
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
                      {
                        color: theme.colors.textSecondary,
                        fontFamily: theme.fonts.bold,
                        margin: 0,
                      },
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

                {error ? (
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
                ) : null}

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

                {cloudError ? (
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
                ) : null}

                {importError ? (
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
                ) : null}

                <View style={{ height: 20 }} />
              </ScrollView>

              <View
                style={[
                  styles.footer,
                  {
                    borderTopColor: theme.colors.border,
                    paddingBottom: isWeb ? 12 : insets.bottom + 12,
                  },
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
            </View>
          )}
        </View>
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
          setPendingCloudRemote(null);
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
                  setPendingCloudRemote(null);
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
                  const isLocal = cloudLocalIds.has(rj.id);
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

      {/* Data integrity warning */}
      <DataIntegrityWarningModal
        visible={integrityWarning !== null}
        onClose={() => {
          setIntegrityWarning(null);
          if (integrityWarning?.type === 'import') {
            resetForm();
            onClose();
          }
        }}
        title={
          integrityWarning?.type === 'sync'
            ? t.dataIntegrity.syncWarningTitle
            : t.dataIntegrity.importWarningTitle
        }
        description={
          integrityWarning?.type === 'sync'
            ? t.dataIntegrity.syncWarningDesc
                .replace('{failed}', String(integrityWarning?.details.length ?? 0))
                .replace('{total}', String(integrityWarning?.details.length ?? 0))
            : t.dataIntegrity.importWarningDesc.replace(
                '{count}',
                String(integrityWarning?.details.length ?? 0),
              )
        }
        details={integrityWarning?.details ?? []}
        suggestion={
          integrityWarning?.type === 'sync'
            ? t.dataIntegrity.syncSuggestion
            : t.dataIntegrity.importSuggestion
        }
        actions={
          integrityWarning?.type === 'sync'
            ? [
                {
                  label: t.common.cancel,
                  variant: 'secondary' as const,
                  onPress: () => {
                    setIntegrityWarning(null);
                  },
                },
                {
                  label: t.dataIntegrity.retry,
                  variant: 'primary' as const,
                  onPress: () => {
                    const remote = integrityWarning?.retryRemote;
                    setIntegrityWarning(null);
                    if (remote) handleCloudJournalSelect(remote);
                  },
                },
              ]
            : [
                {
                  label: t.dataIntegrity.acknowledge,
                  variant: 'primary' as const,
                  onPress: () => {
                    setIntegrityWarning(null);
                    resetForm();
                    onClose();
                  },
                },
              ]
        }
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayWeb: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  overlayNative: {
    flex: 1,
  },
  containerWeb: {
    borderRadius: 5,
    height: '90%',
    width: '100%',
    overflow: 'hidden',
  },
  containerNative: {
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
  progressTrack: {
    width: '60%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
  },
  cancelImport: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cancelImportText: {
    fontSize: 15,
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
    paddingBottom: 12,
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
