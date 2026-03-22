import { type ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Card({ children, onPress, style, accessibilityLabel }: CardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.cardBackground,
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidth,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 5,
    padding: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
});
