import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { getLocalStore } from '@/hooks/useStorage';
import { StorageIntegrityError } from '@/lib/storage/integrity';
import type { JournalPageScan } from '@/lib/storage';
import type { Dictionary } from '@/i18n/dictionaries';
import type { JournalContent } from 'canto-data';
import { webModalContent } from '@/styles/web';
import { getContrastText } from '@/styles/themes';

interface RecoverPagesModalProps {
  visible: boolean;
  journal: Omit<JournalContent, 'pages'>;
  derivedKey?: Uint8Array | null;
  onClose: () => void;
  onRecovered: () => void;
}

type RecoverState = 'scanning' | 'ready' | 'restoring' | 'done' | 'error';

/**
 * Classify a recovery failure into an actionable, localized message. Never
 * forwards the underlying error text (which could carry paths or keys).
 */
function recoveryMessage(t: Dictionary, error: unknown): string {
  if (error instanceof StorageIntegrityError) {
    if (error.code === 'JOURNAL_LOCKED') return t.journalSettings.recoverLocked;
    if (error.code === 'CATALOG_UNREADABLE') return t.journalSettings.recoverIncomplete;
  }
  return t.journalSettings.recoverFailed;
}

export function RecoverPagesModal({
  visible,
  journal,
  derivedKey,
  onClose,
  onRecovered,
}: RecoverPagesModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [state, setState] = useState<RecoverState>('scanning');
  const [scan, setScan] = useState<JournalPageScan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestVersion = useRef(0);

  // Opening the modal runs a read-only scan. Nothing is published until the
  // user explicitly confirms on the result screen.
  useEffect(() => {
    if (!visible) return;
    const version = ++requestVersion.current;
    setState('scanning');
    setScan(null);
    setMessage(null);
    void (async () => {
      try {
        const store = await getLocalStore();
        if (!store.scanJournalPages) throw new Error('Local storage does not support page scans');
        const result = await store.scanJournalPages(journal.id, derivedKey ?? undefined);
        if (requestVersion.current !== version) return;
        setScan(result);
        setState('ready');
      } catch (error) {
        if (requestVersion.current !== version) return;
        setMessage(recoveryMessage(t, error));
        setState('error');
      }
    })();
    return () => {
      // Invalidate any in-flight scan when the modal closes or unmounts so a
      // late resolution can never repopulate a dismissed dialog.
      requestVersion.current++;
    };
  }, [visible, journal.id, derivedKey, t]);

  const handleRestore = useCallback(async () => {
    if (!scan) return;
    setState('restoring');
    setMessage(null);
    try {
      const store = await getLocalStore();
      if (!store.restoreJournalCatalog) {
        throw new Error('Local storage does not support catalog recovery');
      }
      // No caller-supplied pages: the confirmed write re-scans the current raw
      // records itself so a save that landed after the preview is included.
      await store.restoreJournalCatalog(journal.id, derivedKey ?? undefined);
      setState('done');
      onRecovered();
    } catch (error) {
      setMessage(recoveryMessage(t, error));
      setState('error');
    }
  }, [scan, journal.id, derivedKey, onRecovered, t]);

  const handleClose = useCallback(() => {
    // A restore in flight must finish; closing mid-publish would hide its result.
    if (state === 'restoring') return;
    onClose();
  }, [state, onClose]);

  const canRestore = state === 'ready' && (scan?.pageCount ?? 0) > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
            webModalContent,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
            {t.journalSettings.recoverLocalPages}
          </Text>

          {state === 'scanning' && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text
                style={[
                  styles.message,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.journalSettings.recoverScanning}
              </Text>
            </View>
          )}

          {state === 'restoring' && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text
                style={[
                  styles.message,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.journalSettings.recoverRestoring}
              </Text>
            </View>
          )}

          {state === 'ready' && (
            <>
              <Text
                style={[
                  styles.message,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.journalSettings.recoverDescription}
              </Text>
              <Text
                style={[
                  styles.message,
                  {
                    color: scan?.pageCount ? theme.colors.text : theme.colors.textSecondary,
                    fontFamily: scan?.pageCount ? theme.fonts.bold : theme.fonts.regular,
                  },
                ]}
              >
                {scan && scan.pageCount > 0
                  ? t.journalSettings.recoverFound.replace('{count}', String(scan.pageCount))
                  : t.journalSettings.recoverNone}
              </Text>
            </>
          )}

          {state === 'done' && (
            <Text
              style={[
                styles.message,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.journalSettings.recoverSuccess}
            </Text>
          )}

          {state === 'error' && message && (
            <Text
              style={[styles.error, { color: theme.colors.error, fontFamily: theme.fonts.regular }]}
            >
              {message}
            </Text>
          )}

          <View style={styles.buttons}>
            <Pressable
              style={[styles.btn, { backgroundColor: theme.colors.buttonCancel }]}
              onPress={handleClose}
              disabled={state === 'restoring'}
            >
              <Text
                style={[styles.btnText, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
              >
                {state === 'done' ? t.common.close : t.common.cancel}
              </Text>
            </Pressable>
            {state === 'ready' && (
              <Pressable
                style={[
                  styles.btn,
                  {
                    backgroundColor: canRestore
                      ? theme.colors.primary
                      : theme.colors.buttonDisabled,
                  },
                ]}
                onPress={handleRestore}
                disabled={!canRestore}
              >
                <Text
                  style={[
                    styles.btnText,
                    {
                      color: getContrastText(
                        canRestore ? theme.colors.primary : theme.colors.buttonDisabled,
                      ),
                      fontFamily: theme.fonts.bold,
                    },
                  ]}
                >
                  {t.journalSettings.recoverConfirm}
                </Text>
              </Pressable>
            )}
          </View>
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
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  error: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnText: {
    fontSize: 14,
  },
});
