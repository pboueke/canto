import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { PasswordStrengthMeter } from '@/components/common/PasswordStrengthMeter';
import { KdfIterationPicker } from '@/components/common/KdfIterationPicker';
import { DEFAULT_KDF_ITERATIONS } from '@/lib/encryption/password';
import { webModalContent } from '@/styles/web';

interface ChangePasswordModalProps {
  visible: boolean;
  isSecure: boolean;
  currentKdfIterations?: number;
  onSubmit: (
    currentPassword: string | undefined,
    newPassword: string | undefined,
    kdfIterations?: number,
  ) => Promise<void>;
  onCancel: () => void;
  progress?: string;
  error?: string;
}

export function ChangePasswordModal({
  visible,
  isSecure,
  currentKdfIterations,
  onSubmit,
  onCancel,
  progress,
  error,
}: ChangePasswordModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [kdfIterations, setKdfIterations] = useState(
    currentKdfIterations ?? DEFAULT_KDF_ITERATIONS,
  );
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);

  const mismatch = newPassword !== '' && confirmPassword !== '' && newPassword !== confirmPassword;
  const canSubmit = !busy && !mismatch && (!isSecure || currentPassword.length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    setLocalError('');
    setBusy(true);
    setTimeout(async () => {
      try {
        await onSubmit(
          isSecure ? currentPassword : undefined,
          newPassword || undefined,
          newPassword ? kdfIterations : undefined,
        );
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    }, 50);
  };

  const handleCancel = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setKdfIterations(currentKdfIterations ?? DEFAULT_KDF_ITERATIONS);
    setLocalError('');
    onCancel();
  };

  const displayError = error || localError;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
            webModalContent,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
            {t.journalSettings.changePassword}
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
                {progress || t.common.loading}
              </Text>
            </View>
          ) : (
            <>
              {isSecure && (
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: theme.colors.text,
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      fontFamily: theme.fonts.regular,
                    },
                  ]}
                  placeholder={t.journalSettings.currentPassword}
                  placeholderTextColor={theme.colors.textSecondary}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
              )}

              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    fontFamily: theme.fonts.regular,
                  },
                ]}
                placeholder={t.journalSettings.newPassword}
                placeholderTextColor={theme.colors.textSecondary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
              />

              <PasswordStrengthMeter password={newPassword} />

              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    fontFamily: theme.fonts.regular,
                  },
                ]}
                placeholder={t.journalSettings.confirmNewPassword}
                placeholderTextColor={theme.colors.textSecondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
              />

              <Text
                style={[
                  styles.hint,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.light },
                ]}
              >
                {t.journalSettings.removePasswordHint}
              </Text>

              {newPassword.length > 0 && (
                <KdfIterationPicker value={kdfIterations} onChange={setKdfIterations} />
              )}

              {newPassword.length > 0 && (
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

              {mismatch && (
                <Text
                  style={[
                    styles.error,
                    { color: theme.colors.error, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {t.home.passwordMismatch}
                </Text>
              )}

              {displayError !== undefined && displayError !== '' && (
                <Text
                  style={[
                    styles.error,
                    { color: theme.colors.error, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {displayError}
                </Text>
              )}

              <View style={styles.buttons}>
                <Pressable
                  style={[styles.btn, { backgroundColor: theme.colors.buttonCancel }]}
                  onPress={handleCancel}
                  disabled={busy}
                >
                  <Text
                    style={[
                      styles.btnText,
                      { color: theme.colors.text, fontFamily: theme.fonts.bold },
                    ]}
                  >
                    {t.common.cancel}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.btn,
                    {
                      backgroundColor: canSubmit
                        ? theme.colors.buttonSubmit
                        : theme.colors.buttonDisabled,
                    },
                  ]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                >
                  <Text style={[styles.btnText, { color: '#fff', fontFamily: theme.fonts.bold }]}>
                    {t.common.save}
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
  busyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 15,
  },
  busyText: {
    fontSize: 14,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 10,
  },
  hint: {
    fontSize: 12,
    marginBottom: 10,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  warningText: {
    fontSize: 12,
    flex: 1,
  },
  error: {
    fontSize: 13,
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  progressText: {
    fontSize: 13,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 8,
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
