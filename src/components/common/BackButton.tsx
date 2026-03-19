import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

interface BackButtonProps {
  onBack?: () => void;
}

export function BackButton({ onBack }: BackButtonProps) {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <Pressable onPress={onBack ?? (() => router.back())} style={styles.button}>
      <Feather name="arrow-left" size={22} color={theme.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingRight: 12,
    paddingVertical: 4,
  },
});
