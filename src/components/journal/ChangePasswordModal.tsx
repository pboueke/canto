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
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { PasswordStrengthMeter } from '@/components/common/PasswordStrengthMeter';
import { KdfIterationPicker } from '@/components/common/KdfIterationPicker';
import { DEFAULT_KDF_ITERATIONS } from '@/lib/encryption/password';
import type { ReencryptionResult } from '@/lib/storage/types';
import { getContrastText } from '@/styles/themes';
import { webModalContent } from '@/styles/web';

function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.ceil(bytes / 1024))} KB`;
  }
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

export interface ReencryptionProgress {
  label: string;
  current?: number;
  total?: number;
}

interface ChangePasswordModalProps {
  visible: boolean;
  isSecure: boolean;
  currentKdfIterations?: number;
  onSubmit: (
    currentPassword: string | undefined,
    newPassword: string | undefined,
    kdfIterations?: number,
  ) => Promise<ReencryptionResult>;
  onCancel: () => void;
  progress?: ReencryptionProgress | null;
  error?: string;
  result?: ReencryptionResult | null;
}

export function ChangePasswordModal({
  visible,
  isSecure,
  currentKdfIterations,
  onSubmit,
  onCancel,
  progress,
  error,
  result,
}: ChangePasswordModalProps) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
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
  const skippedAttachments = result?.skippedAttachments ?? [];
  const progressPercent =
    progress?.current !== undefined && progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;

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
                {progress?.label || t.common.loading}
              </Text>
              {progressPercent !== null && (
                <View style={styles.progressContainer}>
                  <View
                    testID="reencryption-progress"
                    accessibilityRole="progressbar"
                    accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
                    style={[styles.progressTrack, { backgroundColor: theme.colors.surface }]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${progressPercent}%`, backgroundColor: theme.colors.primary },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.progressPercent,
                      { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {progressPercent}%
                  </Text>
                </View>
              )}
            </View>
          ) : result ? (
            <View style={styles.resultContainer}>
              <Feather
                name={skippedAttachments.length > 0 ? 'alert-triangle' : 'check-circle'}
                size={32}
                color={skippedAttachments.length > 0 ? theme.colors.error : theme.colors.primary}
              />
              <Text
                style={[
                  styles.resultTitle,
                  { color: theme.colors.text, fontFamily: theme.fonts.bold },
                ]}
              >
                {skippedAttachments.length > 0
                  ? t.journalSettings.passwordProtectionUpdatedWithExceptions
                  : t.journalSettings.passwordChanged}
              </Text>
              {skippedAttachments.length > 0 && (
                <>
                  <Text
                    style={[
                      styles.resultDescription,
                      { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {t.journalSettings.passwordProtectionExceptionDescription}
                  </Text>
                  <ScrollView
                    style={styles.resultList}
                    contentContainerStyle={styles.resultListContent}
                  >
                    {skippedAttachments.map((attachment, index) => (
                      <Text
                        key={`${attachment.name}-${index}`}
                        style={[
                          styles.resultItem,
                          { color: theme.colors.text, fontFamily: theme.fonts.regular },
                        ]}
                      >
                        {attachment.name}
                        {attachment.size !== undefined
                          ? ` (${formatBytes(attachment.size, lang)})`
                          : ''}
                      </Text>
                    ))}
                  </ScrollView>
                </>
              )}
              <Pressable
                style={[
                  styles.btn,
                  styles.doneButton,
                  { backgroundColor: theme.colors.buttonSubmit },
                ]}
                onPress={handleCancel}
              >
                <Text
                  style={[
                    styles.btnText,
                    {
                      color: getContrastText(theme.colors.buttonSubmit),
                      fontFamily: theme.fonts.bold,
                    },
                  ]}
                >
                  {t.common.done}
                </Text>
              </Pressable>
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
                  <Text
                    style={[
                      styles.btnText,
                      {
                        color: getContrastText(theme.colors.buttonSubmit),
                        fontFamily: theme.fonts.bold,
                      },
                    ]}
                  >
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
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 12,
  },
  resultContainer: {
    alignItems: 'center',
    gap: 12,
  },
  resultTitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  resultDescription: {
    fontSize: 13,
    lineHeight: 19,
  },
  resultList: {
    alignSelf: 'stretch',
    maxHeight: 180,
  },
  resultListContent: {
    gap: 6,
  },
  resultItem: {
    fontSize: 13,
  },
  doneButton: {
    marginTop: 4,
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
