import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import type { SyncProvider } from '@/lib/sync/types';
import { webModalContent } from '@/styles/web';

interface SyncProviderModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (provider: SyncProvider) => void;
}

export function SyncProviderModal({ visible, onClose, onSelect }: SyncProviderModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          style={[
            styles.content,
            webModalContent,
            {
              backgroundColor: theme.colors.foreground,
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
            {t.sync.selectProvider}
          </Text>

          <Pressable
            onPress={() => onSelect('gdrive')}
            style={[styles.providerRow, { backgroundColor: theme.colors.highlight }]}
          >
            <Feather name="hard-drive" size={20} color={theme.colors.primary} />
            <Text
              style={[
                styles.providerName,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.sync.googleDrive}
            </Text>
            <Feather name="chevron-right" size={18} color={theme.colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={onClose}
            style={[styles.cancelBtn, { backgroundColor: theme.colors.highlight }]}
          >
            <Text
              style={[
                styles.cancelText,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.common.cancel}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  content: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    gap: 12,
  },
  title: {
    fontSize: 18,
    marginBottom: 4,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  providerName: {
    fontSize: 15,
    flex: 1,
  },
  cancelBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelText: {
    fontSize: 14,
  },
});
