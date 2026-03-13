import { useState, useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { createUnlockRateLimiter } from '@/lib/encryption/ratelimit';

interface JournalAccessModalProps {
  visible: boolean;
  journalTitle: string;
  onClose: () => void;
  onUnlock: (password: string) => Promise<void>;
  error?: string | null;
}

export function JournalAccessModal({
  visible,
  journalTitle,
  onClose,
  onUnlock,
  error,
}: JournalAccessModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const limiterRef = useRef(createUnlockRateLimiter());

  function handleUnlock() {
    if (!password || busy) return;
    if (!limiterRef.current.attempt()) {
      setRateLimited(true);
      return;
    }
    setRateLimited(false);
    setBusy(true);
    // Defer heavy work so React can paint the spinner first
    setTimeout(async () => {
      try {
        await onUnlock(password);
        limiterRef.current.reset();
        setPassword('');
      } catch {
        // error handled by parent
      } finally {
        setBusy(false);
      }
    }, 50);
  }

  function handleClose() {
    if (busy) return;
    setPassword('');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
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
            {t.home.unlockJournal}
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
            ]}
          >
            {journalTitle}
          </Text>

          {busy ? (
            <View style={styles.busyContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text
                style={[
                  styles.busyText,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.common.loading}
              </Text>
            </View>
          ) : (
            <>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    borderColor: error ? theme.colors.error : theme.colors.border,
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
                autoFocus
                onSubmitEditing={handleUnlock}
              />

              {error && (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
              )}

              {rateLimited && (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>
                  {t.home.tooManyAttempts}
                </Text>
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
                  onPress={handleUnlock}
                  disabled={!password}
                  style={[
                    styles.button,
                    {
                      backgroundColor: password ? theme.colors.primary : theme.colors.highlight,
                      opacity: password ? 1 : 0.5,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      {
                        color: password ? theme.colors.foreground : theme.colors.textSecondary,
                        fontFamily: theme.fonts.bold,
                      },
                    ]}
                  >
                    {t.common.open}
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    borderRadius: 10,
    padding: 20,
    width: '100%',
  },
  title: {
    fontSize: 20,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  busyContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 15,
  },
  busyText: {
    fontSize: 14,
  },
  input: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: 8,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
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
