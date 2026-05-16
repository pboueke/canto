import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import type { Comment } from 'canto-data';

interface CommentListProps {
  comments: Comment[];
  editable: boolean;
  onAdd: () => void;
  onEdit: (comment: Comment) => void;
  onDelete: (id: string) => void;
}

export function CommentList({ comments, editable, onAdd, onEdit, onDelete }: CommentListProps) {
  const { theme } = useTheme();
  const { t } = useI18n();

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidth,
          backgroundColor: theme.colors.foreground,
        },
      ]}
    >
      <Text
        style={[
          styles.title,
          {
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.regular,
            fontSize: 14 * theme.fonts.fontScale,
          },
        ]}
      >
        {t.page.comments}
      </Text>

      {comments.length === 0 ? (
        <Text
          style={[
            styles.placeholder,
            {
              color: theme.colors.textSecondary,
              fontFamily: theme.fonts.light,
              fontSize: 13 * theme.fonts.fontScale,
            },
          ]}
        >
          {t.page.noComments}
        </Text>
      ) : (
        comments.map((comment) => {
          const dateObj = new Date(comment.date);
          const dateStr = dateObj.toLocaleDateString();
          const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          return (
            <View key={comment.id} style={styles.comment}>
              <View style={styles.commentHeader}>
                <Feather name="message-circle" size={12} color={theme.colors.textSecondary} />
                <Text
                  style={[
                    styles.commentDate,
                    {
                      color: theme.colors.textSecondary,
                      fontFamily: theme.fonts.light,
                      fontSize: 11 * theme.fonts.fontScale,
                    },
                  ]}
                >
                  {dateStr} {timeStr}
                </Text>
                {editable && (
                  <View style={styles.commentActions}>
                    <Pressable onPress={() => onEdit(comment)} style={styles.commentAction}>
                      <Feather name="edit-2" size={12} color={theme.colors.textSecondary} />
                    </Pressable>
                    <Pressable onPress={() => onDelete(comment.id)} style={styles.commentAction}>
                      <Feather name="trash-2" size={12} color={theme.colors.deleteAction} />
                    </Pressable>
                  </View>
                )}
              </View>
              <Pressable onPress={editable ? () => onEdit(comment) : undefined}>
                <Text
                  style={[
                    styles.commentText,
                    {
                      color: theme.colors.text,
                      fontFamily: theme.fonts.regular,
                      fontSize: 13 * theme.fonts.fontScale,
                    },
                  ]}
                >
                  {comment.text}
                </Text>
              </Pressable>
            </View>
          );
        })
      )}

      {editable && (
        <Pressable
          onPress={onAdd}
          style={[
            styles.addButton,
            { borderColor: theme.colors.border, borderWidth: theme.borderWidth },
          ]}
        >
          <Feather name="plus" size={14} color={theme.colors.textSecondary} />
          <Text
            style={[
              styles.addText,
              {
                color: theme.colors.textSecondary,
                fontFamily: theme.fonts.regular,
                fontSize: 13 * theme.fonts.fontScale,
              },
            ]}
          >
            {t.page.addComment}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 5,
    padding: 15,
    marginTop: 10,
  },
  title: {
    fontSize: 14,
    marginBottom: 8,
  },
  placeholder: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  comment: {
    marginBottom: 10,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  commentDate: {
    fontSize: 11,
    flex: 1,
  },
  commentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  commentAction: {
    padding: 4,
  },
  commentText: {
    fontSize: 13,
    lineHeight: 18,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 5,
    borderStyle: 'dashed',
  },
  addText: {
    fontSize: 13,
  },
});
