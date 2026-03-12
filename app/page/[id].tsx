import { useState, useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { usePage } from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { PageHeader } from '@/components/page/PageHeader';
import { TagsRow } from '@/components/page/TagsRow';
import { PageContent } from '@/components/page/PageContent';
import { AttachmentBar } from '@/components/page/AttachmentBar';
import { FloatingActionButton } from '@/components/common/FloatingActionButton';

export default function PageScreen() {
  const { id, journalId } = useLocalSearchParams<{ id: string; journalId: string }>();
  const { theme } = useTheme();
  const { t } = useI18n();
  const { getKey } = useJournalKeys();

  const derivedKey = journalId ? getKey(journalId) : null;
  const { page, loading } = usePage(journalId, id, derivedKey);

  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState('');

  useEffect(() => {
    if (page) {
      setContent(page.text);
    }
  }, [page]);

  if (loading) {
    return (
      <View
        style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!page) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.notFound, { color: theme.colors.text }]}>Page not found</Text>
      </View>
    );
  }

  const dateObj = new Date(page.date);
  const dateStr = dateObj.toLocaleDateString();
  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <PageHeader date={dateStr} time={timeStr} />

      <ScrollView contentContainerStyle={styles.content}>
        <TagsRow tags={page.tags} />

        <PageContent content={content} isEditing={isEditing} onChangeText={setContent} />

        <View style={styles.attachments}>
          <AttachmentBar
            hasImage={page.images.length > 0}
            hasAttachment={page.files.length > 0}
            hasLocation={!!page.location}
          />
        </View>

        {page.location && (
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
              {'\u{1F4CD}'} {t.page.location}: {page.location.latitude.toFixed(4)},{' '}
              {page.location.longitude.toFixed(4)}
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
          {page.comments.length === 0 ? (
            <Text
              style={[
                styles.commentsPlaceholder,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.light },
              ]}
            >
              No comments yet
            </Text>
          ) : (
            page.comments.map((comment, i) => (
              <Text
                key={i}
                style={[
                  styles.commentText,
                  { color: theme.colors.text, fontFamily: theme.fonts.regular },
                ]}
              >
                {comment.text}
              </Text>
            ))
          )}
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
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
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
  commentText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
});
