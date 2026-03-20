import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { webModalContent } from '@/styles/web';

interface ConfirmDeleteModalProps {
  visible: boolean;
  journalName: string;
  isSecure: boolean;
  onConfirm: (password?: string) => void;
  onCancel: () => void;
  error?: string | null;
}

export function ConfirmDeleteModal({
  visible,
  journalName,
  isSecure,
  onConfirm,
  onCancel,
  error,
}: ConfirmDeleteModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [input, setInput] = useState('');

  const expectedText = `delete ${journalName}`;
  const canConfirm = isSecure
    ? input.length > 0
    : input.toLowerCase() === expectedText.toLowerCase();

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm(isSecure ? input : undefined);
      setInput('');
    }
  };

  const handleCancel = () => {
    setInput('');
    onCancel();
  };

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
          <Text style={[styles.title, { color: theme.colors.error, fontFamily: theme.fonts.bold }]}>
            {t.journalSettings.deleteJournal}
          </Text>

          <Text
            style={[styles.message, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}
          >
            {isSecure
              ? t.journalSettings.deleteConfirmSecure
              : t.journalSettings.typeToDelete.replace('{name}', journalName)}
          </Text>

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
            placeholder={isSecure ? t.home.password : expectedText}
            placeholderTextColor={theme.colors.textSecondary}
            value={input}
            onChangeText={setInput}
            secureTextEntry={isSecure}
            autoCapitalize="none"
          />

          {error ? (
            <Text
              style={[styles.error, { color: theme.colors.error, fontFamily: theme.fonts.regular }]}
            >
              {error}
            </Text>
          ) : null}

          <View style={styles.buttons}>
            <Pressable
              style={[styles.btn, { backgroundColor: theme.colors.buttonCancel }]}
              onPress={handleCancel}
            >
              <Text
                style={[styles.btnText, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
              >
                {t.common.cancel}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.btn,
                {
                  backgroundColor: canConfirm ? theme.colors.error : theme.colors.buttonDisabled,
                },
              ]}
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Text style={[styles.btnText, { color: '#fff', fontFamily: theme.fonts.bold }]}>
                {t.common.delete}
              </Text>
            </Pressable>
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
  message: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  error: {
    fontSize: 13,
    marginBottom: 12,
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
