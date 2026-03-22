import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { Tag } from '@/components/common/Tag';
import type { Filter } from 'canto-data';

interface FilterModalProps {
  visible: boolean;
  filter: Filter;
  availableTags: string[];
  onToggleProperty: (prop: 'hasFile' | 'hasImage' | 'hasComments' | 'hasLocation') => void;
  onToggleTag: (tag: string) => void;
  onClose: () => void;
}

interface PropertyButtonProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  active: boolean;
  onPress: () => void;
}

function PropertyButton({ icon, label, active, onPress }: PropertyButtonProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      style={[
        styles.propBtn,
        {
          backgroundColor: active ? theme.colors.primary : theme.colors.surface,
          borderColor: active ? theme.colors.primary : theme.colors.border,
        },
      ]}
      onPress={onPress}
    >
      <Feather name={icon} size={18} color={active ? '#fff' : theme.colors.text} />
      <Text
        style={[
          styles.propLabel,
          {
            color: active ? '#fff' : theme.colors.text,
            fontFamily: theme.fonts.regular,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function FilterModal({
  visible,
  filter,
  availableTags,
  onToggleProperty,
  onToggleTag,
  onClose,
}: FilterModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();

  const selectedTags = filter.properties.tags;
  const unselectedTags = availableTags.filter((tag) => !selectedTags.includes(tag.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
          <View style={styles.header}>
            <Text
              style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
            >
              {t.filterBar.filterBy}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={22} color={theme.colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Attachment type filters */}
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.page.attachments}
            </Text>
            <View style={styles.propRow}>
              <PropertyButton
                icon="image"
                label={t.filterBar.hasImage}
                active={filter.properties.hasImage}
                onPress={() => onToggleProperty('hasImage')}
              />
              <PropertyButton
                icon="paperclip"
                label={t.filterBar.hasFile}
                active={filter.properties.hasFile}
                onPress={() => onToggleProperty('hasFile')}
              />
              <PropertyButton
                icon="map-pin"
                label={t.filterBar.hasLocation}
                active={filter.properties.hasLocation}
                onPress={() => onToggleProperty('hasLocation')}
              />
            </View>

            {/* Tag filters */}
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.filterBar.tags}
            </Text>

            {selectedTags.length > 0 && (
              <View style={styles.tagRow}>
                {selectedTags.map((tag) => (
                  <Tag key={tag} label={tag} variant="active" onRemove={() => onToggleTag(tag)} />
                ))}
              </View>
            )}

            {unselectedTags.length > 0 ? (
              <View style={styles.tagRow}>
                {unselectedTags.map((tag) => (
                  <Pressable key={tag} onPress={() => onToggleTag(tag)}>
                    <Tag label={tag} variant="default" />
                  </Pressable>
                ))}
              </View>
            ) : (
              availableTags.length === 0 && (
                <Text
                  style={[
                    styles.noTags,
                    { color: theme.colors.textSecondary, fontFamily: theme.fonts.light },
                  ]}
                >
                  {t.filterBar.noTagsAvailable}
                </Text>
              )
            )}
          </ScrollView>

          <Pressable
            style={[styles.doneBtn, { backgroundColor: theme.colors.primary }]}
            onPress={onClose}
          >
            <Text style={[styles.doneText, { fontFamily: theme.fonts.bold }]}>{t.common.done}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  content: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: 350,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 10,
  },
  propRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  propBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  propLabel: {
    fontSize: 14,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  noTags: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  doneBtn: {
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  doneText: {
    color: '#fff',
    fontSize: 16,
  },
});
