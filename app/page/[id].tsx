import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { PageHeader } from '@/components/page/PageHeader';
import { TagsRow } from '@/components/page/TagsRow';
import { PageContent } from '@/components/page/PageContent';
import { AttachmentBar } from '@/components/page/AttachmentBar';
import { FloatingActionButton } from '@/components/common/FloatingActionButton';
import { getPage } from '@/lib/mockData';

export default function PageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { t } = useI18n();
  const page = getPage(id);

  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(page?.content ?? '');

  if (!page) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.notFound, { color: theme.colors.text }]}>Page not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <PageHeader date={page.date} time={page.time} />

      <ScrollView contentContainerStyle={styles.content}>
        <TagsRow tags={page.tags} />

        <PageContent content={content} isEditing={isEditing} onChangeText={setContent} />

        <View style={styles.attachments}>
          <AttachmentBar
            hasImage={page.hasImage}
            hasAttachment={page.hasAttachment}
            hasLocation={page.hasLocation}
          />
        </View>

        {page.hasLocation && (
          <View
            style={[
              styles.locationTag,
              {
                backgroundColor: theme.colors.location.background,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth,
              },
            ]}
          >
            <Text style={[styles.locationText, { color: theme.colors.location.text }]}>
              {'\u{1F4CD}'} {t.page.location}: 38.7223, -9.1393
            </Text>
          </View>
        )}

        <View
          style={[
            styles.commentsSection,
            {
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth,
              backgroundColor: theme.colors.foreground,
            },
          ]}
        >
          <Text
            style={[
              styles.commentsTitle,
              { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
            ]}
          >
            {t.page.comments}
          </Text>
          <Text
            style={[
              styles.commentsPlaceholder,
              { color: theme.colors.textSecondary, fontFamily: theme.fonts.light },
            ]}
          >
            No comments yet
          </Text>
        </View>
      </ScrollView>

      <FloatingActionButton
        icon={isEditing ? '\u{2714}' : '\u{270F}'}
        onPress={() => setIsEditing(!isEditing)}
        backgroundColor={
          isEditing
            ? theme.colors.popAction.save.background
            : theme.colors.popAction.edit.background
        }
        color={isEditing ? theme.colors.popAction.save.text : theme.colors.popAction.edit.text}
      />

      {isEditing && (
        <FloatingActionButton
          icon={'\u{1F5D1}'}
          onPress={() => {
            /* TODO: delete page */
          }}
          backgroundColor={theme.colors.popAction.delete.background}
          color={theme.colors.popAction.delete.text}
          position="left"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 10,
    paddingBottom: 100,
  },
  notFound: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  attachments: {
    marginTop: 10,
  },
  locationTag: {
    borderRadius: 5,
    padding: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  locationText: {
    fontSize: 13,
  },
  commentsSection: {
    borderRadius: 5,
    padding: 15,
    marginTop: 10,
  },
  commentsTitle: {
    fontSize: 14,
    marginBottom: 8,
  },
  commentsPlaceholder: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});
