import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { webModalContent } from '@/styles/web';

export function AutoLockModal() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { onAutoLock } = useJournalKeys();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return onAutoLock(() => {
      setVisible(true);
    });
  }, [onAutoLock]);

  const handleDismiss = () => {
    setVisible(false);
    router.replace('/');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View
          style={[styles.content, { backgroundColor: theme.colors.background }, webModalContent]}
        >
          <Feather name="lock" size={40} color={theme.colors.primary} style={styles.icon} />
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
            {t.security.autoLockTitle}
          </Text>
          <Text
            style={[
              styles.message,
              { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
            ]}
          >
            {t.security.autoLockMessage}
          </Text>
          <Pressable
            onPress={handleDismiss}
            style={[styles.button, { backgroundColor: theme.colors.primary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { fontFamily: theme.fonts.bold }]}>
              {t.common.confirm}
            </Text>
          </Pressable>
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
    padding: 24,
  },
  content: {
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 5,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});
