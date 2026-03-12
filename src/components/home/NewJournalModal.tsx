import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { IconPicker } from '@/components/common/IconPicker';

interface NewJournalModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (journal: { title: string; icon: string; password?: string }) => Promise<void>;
}

export function NewJournalModal({ visible, onClose, onCreate }: NewJournalModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();

  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('book');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const passwordsMatch = password === '' || password === confirmPassword;
  const canCreate = title.trim().length > 0 && passwordsMatch && !busy;

  function handleCreate() {
    if (!canCreate) return;
    setBusy(true);
    // Defer heavy work so React can paint the spinner first
    setTimeout(async () => {
      try {
        await onCreate({
          title: title.trim(),
          icon,
          password: password || undefined,
        });
        resetForm();
      } catch {
        // error handled by parent
      } finally {
        setBusy(false);
      }
    }, 50);
  }

  function handleClose() {
    if (busy) return;
    resetForm();
    onClose();
  }

  function resetForm() {
    setTitle('');
    setIcon('book');
    setPassword('');
    setConfirmPassword('');
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
          <Text
            style={[styles.modalTitle, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
          >
            {t.home.newJournal}
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
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
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

                <Text
                  style={[
                    styles.sectionLabel,
                    { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {t.home.selectIcon}
                </Text>
                <IconPicker selected={icon} onSelect={setIcon} />

                <Text
                  style={[
                    styles.sectionLabel,
                    { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {t.home.passwordOptional}
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
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

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
              </ScrollView>

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
    maxHeight: '85%',
    width: '100%',
  },
  modalTitle: {
    fontSize: 20,
    marginBottom: 15,
    textAlign: 'center',
  },
  busyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 15,
  },
  busyText: {
    fontSize: 14,
  },
  scroll: {
    marginBottom: 15,
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
    marginBottom: 10,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: 8,
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
