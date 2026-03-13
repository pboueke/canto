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
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { IconPicker } from '@/components/common/IconPicker';
import { PasswordStrengthMeter } from '@/components/common/PasswordStrengthMeter';
import { ThemePickerModal } from '@/components/home/ThemePickerModal';
import { isBiometricAvailable } from '@/lib/biometric';
import { type ThemeName, themes } from '@/styles/themes';

interface NewJournalModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (journal: {
    title: string;
    icon: string;
    password?: string;
    biometric?: boolean;
    themeOverride?: string;
  }) => Promise<void>;
}

const THEME_DISPLAY_NAMES: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  monokai: 'Monokai',
  solarized: 'Solarized',
  nord: 'Nord',
  dracula: 'Dracula',
};

export function NewJournalModal({ visible, onClose, onCreate }: NewJournalModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('book');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [biometric, setBiometric] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [themeOverride, setThemeOverride] = useState<string | undefined>(undefined);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricSupported);
  }, []);

  const passwordsMatch = password === '' || password === confirmPassword;
  const canCreate = title.trim().length > 0 && passwordsMatch && !busy;

  function handleCreate() {
    if (!canCreate) return;
    setBusy(true);
    setTimeout(async () => {
      try {
        await onCreate({
          title: title.trim(),
          icon,
          password: password || undefined,
          biometric: biometric || undefined,
          themeOverride,
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
    setBiometric(false);
    setThemeOverride(undefined);
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
              <Text
                style={[
                  styles.sectionLabel,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
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
});
