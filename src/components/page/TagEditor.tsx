import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { Tag } from '@/components/common/Tag';
import { webModalContent } from '@/styles/web';

interface TagEditorProps {
  tags: string[];
  allJournalTags: string[];
  editable: boolean;
  onChange: (tags: string[]) => void;
}

export function TagEditor({ tags, allJournalTags, editable, onChange }: TagEditorProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [modalVisible, setModalVisible] = useState(false);
  const [newTag, setNewTag] = useState('');

  if (!editable && tags.length === 0) return null;

  const suggestions = allJournalTags.filter(
    (jt) => !tags.some((t) => t.toLowerCase() === jt.toLowerCase()),
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.some((t) => t.toLowerCase() === trimmed)) {
      onChange([...tags, trimmed]);
    }
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <View style={styles.container}>
      <View style={styles.tagsRow}>
        {tags.map((tag) => (
          <Tag key={tag} label={tag} onRemove={editable ? () => removeTag(tag) : undefined} />
        ))}
        {editable && (
          <Pressable
            onPress={() => setModalVisible(true)}
            style={[styles.addButton, { backgroundColor: theme.colors.tag.add }]}
          >
            <Feather name="plus" size={14} color={theme.colors.tag.text} />
          </Pressable>
        )}
      </View>

      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)}>
          <View />
        </Pressable>
        <View style={styles.modalCenter}>
          <View
            style={[
              styles.modalContent,
              webModalContent,
              {
                backgroundColor: theme.colors.foreground,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.page.addTag}
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    borderWidth: theme.borderWidth,
                    fontFamily: theme.fonts.regular,
                  },
                ]}
                value={newTag}
                onChangeText={setNewTag}
                placeholder={t.page.newTag}
                placeholderTextColor={theme.colors.textSecondary}
                onSubmitEditing={() => {
                  addTag(newTag);
                  setModalVisible(false);
                }}
                autoFocus
              />
              <Pressable
                onPress={() => {
                  addTag(newTag);
                  setModalVisible(false);
                }}
                style={[styles.submitButton, { backgroundColor: theme.colors.buttonSubmit }]}
              >
                <Feather name="check" size={16} color={theme.colors.foreground} />
              </Pressable>
            </View>

            {suggestions.length > 0 && (
              <View style={styles.suggestions}>
                {suggestions.map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => {
                      addTag(tag);
                      setModalVisible(false);
                    }}
                  >
                    <Tag label={tag} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    width: '90%',
    alignSelf: 'center',
  },
  addButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  modalContent: {
    width: '85%',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  submitButton: {
    width: 40,
    height: 40,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
