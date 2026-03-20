import { useState, useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import type { Comment } from '@/models';
import { webModalContent } from '@/styles/web';

interface CommentModalProps {
  visible: boolean;
  comment?: Comment | null;
  onSave: (text: string, existingId?: string) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function CommentModal({ visible, comment, onSave, onDelete, onClose }: CommentModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) {
      setText(comment?.text ?? '');
    }
  }, [visible, comment]);

  const isEditing = !!comment;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View style={styles.modalCenter}>
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
            {isEditing ? t.common.edit : t.page.addComment}
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth,
                fontFamily: theme.fonts.serif,
                backgroundColor: theme.colors.background,
              },
            ]}
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            autoFocus
            placeholder={t.page.placeholder}
            placeholderTextColor={theme.colors.textSecondary}
          />

          <View style={styles.buttons}>
            {isEditing && onDelete && (
              <Pressable
                onPress={() => {
                  onDelete(comment.id);
                  onClose();
                }}
                style={[styles.button, { backgroundColor: theme.colors.deleteAction }]}
              >
                <Text style={[styles.buttonText, { color: '#fff', fontFamily: theme.fonts.bold }]}>
                  {t.common.delete}
                </Text>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onClose}
              style={[styles.button, { backgroundColor: theme.colors.buttonCancel }]}
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
              onPress={() => {
                if (text.trim()) {
                  onSave(text.trim(), comment?.id);
                  onClose();
                }
              }}
              style={[styles.button, { backgroundColor: theme.colors.buttonSubmit }]}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: theme.colors.foreground, fontFamily: theme.fonts.bold },
                ]}
              >
                {t.common.save}
              </Text>
            </Pressable>
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
  modalCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  content: {
    width: '90%',
    borderRadius: 10,
    padding: 20,
  },
  title: {
    fontSize: 16,
    marginBottom: 12,
  },
  input: {
    borderRadius: 5,
    padding: 12,
    minHeight: 120,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 5,
  },
  buttonText: {
    fontSize: 14,
  },
});
