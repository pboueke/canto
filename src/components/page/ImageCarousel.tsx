import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
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
import type { Attachment } from '@/models';

const SCREEN_WIDTH = Dimensions.get('window').width;
const IMAGE_WIDTH = SCREEN_WIDTH - 20;
const IMAGE_HEIGHT = 250;

interface ImageCarouselProps {
  images: Attachment[];
  encrypted?: boolean;
  editable: boolean;
  onRemove?: (id: string) => void;
  onMoveLeft?: (id: string) => void;
  onMoveRight?: (id: string) => void;
  loadImage: (path: string) => Promise<string | null>;
}

export function ImageCarousel({
  images,
  encrypted = false,
  editable,
  onRemove,
  onMoveLeft,
  onMoveRight,
  loadImage,
}: ImageCarouselProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const { loadedImages, loadingImages, enqueue, cancelAll } = useImageQueue(loadImage);

  const activeImages = images.filter((img) => !img.deleted);

  useEffect(() => {
    enqueue(activeImages);
    return () => cancelAll();
  }, [activeImages.length]);

  if (activeImages.length === 0) return null;

  const allLoaded = activeImages.every((img) => loadedImages[img.id]);
  const viewerImages = activeImages
    .filter((img) => loadedImages[img.id])
    .map((img) => ({ uri: loadedImages[img.id] }));

  return (
    <View style={styles.container}>
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
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / IMAGE_WIDTH);
          setCurrentIndex(index);
        }}
        renderItem={({ item, index }) => {
          const imageUri = loadedImages[item.id];
          const isLoading = loadingImages[item.id];

          return (
            <View style={[styles.imageWrapper, { width: IMAGE_WIDTH }]}>
              {imageUri ? (
                <Pressable
                  onPress={() => {
                    setCurrentIndex(index);
                    setViewerVisible(true);
                  }}
                >
                  <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
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

              {editable && (
                <View style={styles.editOverlay}>
                  <Pressable
                    onPress={() => onRemove?.(item.id)}
                    style={[styles.editButton, { backgroundColor: theme.colors.deleteAction }]}
                  >
                    <Feather name="x" size={16} color="#fff" />
                  </Pressable>
                  {index > 0 && (
                    <Pressable
                      onPress={() => onMoveLeft?.(item.id)}
                      style={[styles.editButton, { backgroundColor: theme.colors.surface }]}
                    >
                      <Feather name="chevron-left" size={16} color={theme.colors.text} />
                    </Pressable>
                  )}
                  {index < activeImages.length - 1 && (
                    <Pressable
                      onPress={() => onMoveRight?.(item.id)}
                      style={[styles.editButton, { backgroundColor: theme.colors.surface }]}
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
  editOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
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
