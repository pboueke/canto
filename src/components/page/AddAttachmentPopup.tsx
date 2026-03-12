import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';

interface AddAttachmentPopupProps {
  visible: boolean;
  onClose: () => void;
  onAddImage: () => void;
  onAddEncryptedImage: () => void;
  onAddFile: () => void;
  onAddEncryptedFile: () => void;
  onAddLocation: () => void;
  onAddComment: () => void;
  hasLocation: boolean;
}

interface OptionProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  showLock?: boolean;
  disabled?: boolean;
}

function Option({ icon, label, onPress, showLock, disabled }: OptionProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.option,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidth,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <View style={styles.optionIcon}>
        <Feather name={icon} size={22} color={theme.colors.primary} />
        {showLock && (
          <Feather name="lock" size={11} color={theme.colors.accent} style={styles.lockBadge} />
        )}
      </View>
      <Text
        style={[styles.optionLabel, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AddAttachmentPopup({
  visible,
  onClose,
  onAddImage,
  onAddEncryptedImage,
  onAddFile,
  onAddEncryptedFile,
  onAddLocation,
  onAddComment,
  hasLocation,
}: AddAttachmentPopupProps) {
  const { theme } = useTheme();
  const { t } = useI18n();

  const handlePress = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View style={styles.center}>
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
            {t.page.attachments}
          </Text>

          <View style={styles.grid}>
            <Option icon="image" label={t.page.addImage} onPress={() => handlePress(onAddImage)} />
            <Option
              icon="image"
              label={t.page.addEncryptedImage}
              onPress={() => handlePress(onAddEncryptedImage)}
              showLock
            />
            <Option
              icon="paperclip"
              label={t.page.addFile}
              onPress={() => handlePress(onAddFile)}
            />
            <Option
              icon="paperclip"
              label={t.page.addEncryptedFile}
              onPress={() => handlePress(onAddEncryptedFile)}
              showLock
            />
            <Option
              icon="map-pin"
              label={t.page.addLocation}
              onPress={() => handlePress(onAddLocation)}
              disabled={hasLocation}
            />
            <Option
              icon="message-circle"
              label={t.page.addComment}
              onPress={() => handlePress(onAddComment)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  content: {
    width: '85%',
    borderRadius: 10,
    padding: 20,
  },
  title: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  option: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  optionIcon: {
    position: 'relative',
    marginBottom: 8,
  },
  lockBadge: {
    position: 'absolute',
    bottom: -3,
    right: -10,
  },
  optionLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
});
