import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/common/Card';
import { Tag } from '@/components/common/Tag';
import { useTheme } from '@/hooks/useTheme';
import type { MockPage } from '@/lib/mockData';

interface PageListItemProps {
  page: MockPage;
}

export function PageListItem({ page }: PageListItemProps) {
  const { theme } = useTheme();
  const router = useRouter();

  const previewText =
    page.content.split('\n').find((line) => !line.startsWith('#') && line.trim()) ?? '';
  const truncated = previewText.length > 200 ? previewText.slice(0, 200) + '...' : previewText;

  return (
    <Card onPress={() => router.push(`/page/${page.id}`)} style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={[styles.date, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
          {page.date}
        </Text>
        <View style={styles.icons}>
          {page.hasAttachment && (
            <Text style={[styles.iconText, { color: theme.colors.textSecondary }]}>
              {'\u{1F4CE}'}
            </Text>
          )}
          {page.hasImage && (
            <Text style={[styles.iconText, { color: theme.colors.textSecondary }]}>
              {'\u{1F5BC}'}
            </Text>
          )}
          {page.hasLocation && (
            <Text style={[styles.iconText, { color: theme.colors.textSecondary }]}>
              {'\u{1F4CD}'}
            </Text>
          )}
        </View>
        <Text
          style={[
            styles.time,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
          ]}
        >
          {page.time}
        </Text>
      </View>

      {page.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {page.tags.map((tag) => (
            <Tag key={tag} label={tag} />
          ))}
        </View>
      )}

      {truncated && (
        <Text
          style={[
            styles.preview,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.serif },
          ]}
          numberOfLines={2}
        >
          {truncated}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 33,
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    letterSpacing: 2,
  },
  icons: {
    flexDirection: 'row',
    marginLeft: 8,
    gap: 4,
    flex: 1,
  },
  iconText: {
    fontSize: 12,
  },
  time: {
    fontSize: 12,
    textAlign: 'right',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.7,
  },
});
