import { useState, useEffect } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/common/Card';
import { Tag } from '@/components/common/Tag';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useAttachment } from '@/hooks/useStorage';
import { enqueueThumbnail } from '@/hooks/useImageQueue';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import type { JournalSettings } from 'canto-data';
import type { ListPagePreview } from '@/lib/pagePreview';
import { LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES } from '@/lib/storage/attachment-content';

interface PageListItemProps {
  page: ListPagePreview;
  journalId: string;
  settings?: JournalSettings;
  onThumbnailLoadStart?: (pageId: string) => void;
}

export function PageListItem({
  page,
  journalId,
  settings,
  onThumbnailLoadStart,
}: PageListItemProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
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

    // Chunked content is intentionally only reassembled when a user opens the
    // attachment. List rendering may use a persisted thumbnail, never source.
    if (
      !page.firstImage ||
      page.firstImageChunked ||
      !showThumbnail ||
      page.firstImageSize == null ||
      page.firstImageSize > LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES
    )
      return;
    const cancel = enqueueThumbnail(
      page.id,
      async () => {
        onThumbnailLoadStart?.(page.id);
        const data = await getAttachment(page.firstImage!, page.firstImageEncrypted ?? false);
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
  }, [
    page.thumbnail,
    page.firstImage,
    page.firstImageEncrypted,
    page.firstImageChunked,
    page.firstImageSize,
    showThumbnail,
    derivedKey,
    getAttachment,
    onThumbnailLoadStart,
  ]);

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
      accessibilityLabel={`${t.a11y.pageEntry}: ${dateStr} ${page.previewText}`}
    >
      <View style={styles.row}>
        <View style={styles.textContent}>
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.date,
                {
                  color: theme.colors.text,
                  fontFamily: theme.fonts.bold,
                  fontSize: 16 * theme.fonts.fontScale,
                },
              ]}
            >
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
                {
                  color: theme.colors.textSecondary,
                  fontFamily: theme.fonts.regular,
                  fontSize: 12 * theme.fonts.fontScale,
                },
              ]}
            >
              {timeStr}
            </Text>
          </View>

          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />

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
                {
                  color: theme.colors.textSecondary,
                  fontFamily: theme.fonts.serif,
                  fontSize: 13 * theme.fonts.fontScale,
                },
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
  separator: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.7,
  },
  thumbnail: {
    width: 84,
    height: 84,
    borderRadius: 8,
    marginLeft: 10,
  },
});
