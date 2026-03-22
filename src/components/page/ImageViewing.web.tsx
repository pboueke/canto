import { Modal, Image, Pressable, StyleSheet, View, Text } from 'react-native';
import { webModalContent } from '@/styles/web';

interface ImageSource {
  uri: string;
}

interface Props {
  images: ImageSource[];
  imageIndex: number;
  visible: boolean;
  onRequestClose: () => void;
}

export default function ImageViewing({ images, imageIndex, visible, onRequestClose }: Props) {
  if (!visible || images.length === 0) return null;
  const src = images[Math.min(imageIndex, images.length - 1)];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable style={styles.backdrop} onPress={onRequestClose}>
        <View style={[styles.container, webModalContent]}>
          <Pressable style={styles.close} onPress={onRequestClose}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <Image source={{ uri: src.uri }} style={styles.image} resizeMode="contain" />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    height: '90%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  close: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 18,
  },
});
