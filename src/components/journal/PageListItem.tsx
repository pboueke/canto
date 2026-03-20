import { useState, useEffect } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/common/Card';
import { Tag } from '@/components/common/Tag';
import { useTheme } from '@/hooks/useTheme';
import { useAttachment } from '@/hooks/useStorage';
import { enqueueThumbnail } from '@/hooks/useImageQueue';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import type { PagePreview, JournalSettings } from '@/models';

interface PageListItemProps {
  page: PagePreview;
  journalId: string;
  settings?: JournalSettings;
}

export function PageListItem({ page, journalId, settings }: PageListItemProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const { getKey } = useJournalKeys();
  const derivedKey = getKey(journalId);
  const { getAttachment } = useAttachment(derivedKey);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

  const showTags = settings?.previewTags ?? true;
  const showThumbnail = settings?.previewThumbnail ?? true;
  const showIcons = settings?.previewIcons ?? true;
  const use24h = settings?.use24h ?? false;

  useEffect(() => {
    // Prefer inline base64 thumbnail (generated at save time)
    if (page.thumbnail && showThumbnail) {
      setThumbnailUri(`data:image/jpeg;base64,${page.thumbnail}`);
      return;
    }

    if (!page.firstImage || !showThumbnail) return;
    const cancel = enqueueThumbnail(
      page.id,
      async () => {
        const data = await getAttachment(page.firstImage!, false);
        if (!data) return null;
        if (Platform.OS === 'web') {
          return `data:image/jpeg;base64,${data}`;
        }
        // Native: write to cache file for better memory management
        const { Paths, File: ExpoFile } = require('expo-file-system');
        const tmpFile = new ExpoFile(Paths.cache, `thumb-${page.id}.jpg`);
        if (!tmpFile.exists) tmpFile.create({ intermediates: true });
        tmpFile.write(data, { encoding: 'base64' });
        return tmpFile.uri;
      },
      (uri) => {
        if (uri) setThumbnailUri(uri);
      },
    );
    return cancel;
  }, [page.thumbnail, page.firstImage, showThumbnail]);

  const dateObj = new Date(page.date);
  const dateStr = dateObj.toLocaleDateString();
  const timeStr = use24h
    ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <Card
      onPress={() => {
        const themeParam = settings?.themeOverride
          ? `&themeOverride=${settings.themeOverride}`
          : '';
        router.push(`/page/${page.id}?journalId=${journalId}${themeParam}`);
      }}
      style={styles.card}
    >
      <View style={styles.row}>
        <View style={styles.textContent}>
          <View style={styles.titleRow}>
            <Text style={[styles.date, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
              {dateStr}
            </Text>
            {showIcons && (
              <View style={styles.icons}>
                {page.hasAttachment && (
                  <Feather name="paperclip" size={12} color={theme.colors.textSecondary} />
                )}
                {page.hasImage && (
                  <Feather name="image" size={12} color={theme.colors.textSecondary} />
                )}
                {page.hasLocation && (
                  <Feather name="map-pin" size={12} color={theme.colors.textSecondary} />
                )}
              </View>
            )}
            {!showIcons && <View style={styles.icons} />}
            <Text
              style={[
                styles.time,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
              ]}
            >
              {timeStr}
            </Text>
          </View>

          {showTags && page.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {page.tags.map((tag) => (
                <Tag key={tag} label={tag} />
              ))}
            </View>
          )}

          {page.previewText.length > 0 && (
            <Text
              style={[
                styles.preview,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.serif },
              ]}
              numberOfLines={1}
            >
              {page.previewText}
            </Text>
          )}
        </View>

        {showThumbnail && thumbnailUri && (
          <Image source={{ uri: thumbnailUri }} style={styles.thumbnail} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
  },
  textContent: {
    flex: 1,
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
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginLeft: 10,
  },
});
