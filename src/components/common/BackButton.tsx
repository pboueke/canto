import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useSafeBack } from '@/hooks/useSafeBack';

interface BackButtonProps {
  onBack?: () => void;
}

export function BackButton({ onBack }: BackButtonProps) {
  const { theme } = useTheme();
  const safeBack = useSafeBack();

  return (
    <Pressable onPress={onBack ?? safeBack} style={styles.button}>
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
