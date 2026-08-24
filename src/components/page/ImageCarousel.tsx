import { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ImageViewing from './ImageViewing';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useImageQueue } from '@/hooks/useImageQueue';
import type { Attachment } from 'canto-data';
import { canGenerateThumbnailFromAttachment } from '@/lib/pagePreview';

const HORIZONTAL_PADDING = 10;
const IMAGE_HEIGHT = 250;
const DEFAULT_WIDTH = Dimensions.get('window').width;

interface ImageCarouselProps {
  images: Attachment[];
  encrypted?: boolean;
  editable: boolean;
  onRemove?: (id: string) => void;
  onMoveLeft?: (id: string) => void;
  onMoveRight?: (id: string) => void;
  onDownload?: (image: Attachment) => void;
  /** Persisted small preview for the first image; never a reconstructed original. */
  thumbnail?: string;
  loadImage: (path: string) => Promise<string | null>;
}

export function ImageCarousel({
  images,
  encrypted = false,
  editable,
  onRemove,
  onMoveLeft,
  onMoveRight,
  onDownload,
  thumbnail,
  loadImage,
}: ImageCarouselProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [containerWidth, setContainerWidth] = useState(DEFAULT_WIDTH);
  const { loadedImages, loadingImages, enqueue, cancelAll } = useImageQueue(loadImage);

  const IMAGE_WIDTH = containerWidth - HORIZONTAL_PADDING * 4;

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  }, []);

  const activeImages = images.filter((img) => !img.deleted);

  const activeImagesKey = activeImages.map((img) => img.id).join(',');

  useEffect(() => {
    // Automatic carousel work follows the list-preview memory contract:
    // only a declared, bounded legacy value may be reconstructed. Chunked,
    // unknown-size, and large legacy images require an explicit tap.
    enqueue(activeImages.filter(canGenerateThumbnailFromAttachment));
    return () => cancelAll();
  }, [activeImagesKey, enqueue, cancelAll]);

  if (activeImages.length === 0) return null;

  const allLoaded = activeImages.every((img) => loadedImages[img.id]);
  const viewerImages = activeImages
    .filter((img) => loadedImages[img.id])
    .map((img) => ({ uri: loadedImages[img.id] }));

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      {encrypted && (
        <View style={styles.lockBadge}>
          <Feather name="lock" size={14} color={theme.colors.text} />
          {!allLoaded && (
            <Text
              style={[
                styles.lockText,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.page.decrypting}
            </Text>
          )}
        </View>
      )}

      <FlatList
        data={activeImages}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={IMAGE_WIDTH + HORIZONTAL_PADDING}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING }}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(
            e.nativeEvent.contentOffset.x / (IMAGE_WIDTH + HORIZONTAL_PADDING),
          );
          setCurrentIndex(index);
        }}
        renderItem={({ item, index }) => {
          const imageUri = loadedImages[item.id];
          const previewUri =
            !imageUri && index === 0 && thumbnail
              ? `data:image/jpeg;base64,${thumbnail}`
              : undefined;
          const isLoading = loadingImages[item.id];

          return (
            <View
              style={[styles.imageWrapper, { width: IMAGE_WIDTH }]}
              accessibilityLabel={t.a11y.imageNofM
                .replace('{n}', String(index + 1))
                .replace('{m}', String(activeImages.length))}
            >
              {imageUri || previewUri ? (
                <Pressable
                  onPress={() => {
                    setCurrentIndex(index);
                    if (imageUri) {
                      setViewerVisible(true);
                    } else {
                      // A persisted thumbnail is intentionally not passed to the
                      // full viewer. Opening the original is explicit user work.
                      enqueue([item]);
                    }
                  }}
                  accessibilityRole={imageUri ? 'image' : 'button'}
                  testID={`carousel-image-${item.id}`}
                >
                  <Image
                    source={{ uri: imageUri ?? previewUri! }}
                    style={[styles.image, { backgroundColor: theme.colors.surface }]}
                    resizeMode="contain"
                  />
                </Pressable>
              ) : !canGenerateThumbnailFromAttachment(item) ? (
                <Pressable
                  onPress={() => enqueue([item])}
                  accessibilityLabel={t.a11y.imageNofM
                    .replace('{n}', String(index + 1))
                    .replace('{m}', String(activeImages.length))}
                  accessibilityRole="button"
                  style={[styles.imagePlaceholder, { backgroundColor: theme.colors.surface }]}
                >
                  {isLoading ? (
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                  ) : (
                    <Feather name="image" size={40} color={theme.colors.textSecondary} />
                  )}
                </Pressable>
              ) : (
                <View style={[styles.imagePlaceholder, { backgroundColor: theme.colors.surface }]}>
                  {isLoading || encrypted ? (
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                  ) : (
                    <Feather name="image" size={40} color={theme.colors.textSecondary} />
                  )}
                </View>
              )}

              {!editable && onDownload && imageUri && (
                <View style={styles.downloadOverlay}>
                  <Pressable
                    onPress={() => onDownload(item)}
                    style={styles.downloadButton}
                    accessibilityLabel={t.a11y.downloadImage}
                    accessibilityRole="button"
                  >
                    <Feather name="download" size={18} color="#fff" />
                  </Pressable>
                </View>
              )}

              {editable && (
                <View style={styles.editOverlay}>
                  <Pressable
                    onPress={() => onRemove?.(item.id)}
                    style={[styles.editButton, { backgroundColor: theme.colors.deleteAction }]}
                    accessibilityLabel={t.a11y.deleteImage}
                    accessibilityRole="button"
                  >
                    <Feather name="x" size={16} color="#fff" />
                  </Pressable>
                  {index > 0 && (
                    <Pressable
                      onPress={() => onMoveLeft?.(item.id)}
                      style={[styles.editButton, { backgroundColor: theme.colors.surface }]}
                      accessibilityLabel={t.a11y.moveLeft}
                      accessibilityRole="button"
                    >
                      <Feather name="chevron-left" size={16} color={theme.colors.text} />
                    </Pressable>
                  )}
                  {index < activeImages.length - 1 && (
                    <Pressable
                      onPress={() => onMoveRight?.(item.id)}
                      style={[styles.editButton, { backgroundColor: theme.colors.surface }]}
                      accessibilityLabel={t.a11y.moveRight}
                      accessibilityRole="button"
                    >
                      <Feather name="chevron-right" size={16} color={theme.colors.text} />
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />

      {activeImages.length > 1 && (
        <View style={styles.dots}>
          {activeImages.map((img, i) => (
            <View
              key={img.id}
              style={[
                styles.dot,
                {
                  backgroundColor: i === currentIndex ? theme.colors.primary : theme.colors.border,
                },
              ]}
            />
          ))}
        </View>
      )}

      <ImageViewing
        images={viewerImages}
        imageIndex={currentIndex}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  lockText: {
    fontSize: 12,
  },
  imageWrapper: {
    height: IMAGE_HEIGHT,
    position: 'relative',
    marginRight: HORIZONTAL_PADDING,
  },
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
    borderRadius: 8,
  },
  imagePlaceholder: {
    width: '100%',
    height: IMAGE_HEIGHT,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  editOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
  },
  downloadButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  editButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
