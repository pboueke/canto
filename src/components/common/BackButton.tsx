import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

export function BackButton() {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <Pressable onPress={() => router.back()} style={styles.button}>
      <Text style={[styles.arrow, { color: theme.colors.text }]}>{'\u{2190}'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingRight: 12,
    paddingVertical: 4,
  },
  arrow: {
    fontSize: 22,
  },
});
