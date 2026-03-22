import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';

interface ExportMenuProps {
  visible: boolean;
  onClose: () => void;
  onExport: () => void;
}

export function ExportMenu({ visible, onClose, onExport }: ExportMenuProps) {
  const { theme } = useTheme();
  const { t } = useI18n();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          style={[
            styles.menu,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Pressable
            style={styles.menuItem}
            onPress={() => {
              onClose();
              onExport();
            }}
          >
            <Feather name="download" size={18} color={theme.colors.text} />
            <Text
              style={[
                styles.menuText,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.backup.exportJournal}
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
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 100,
    paddingRight: 15,
  },
  menu: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
  },
  menuText: {
    fontSize: 15,
  },
});
