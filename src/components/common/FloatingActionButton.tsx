import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

interface FloatingActionButtonProps {
  icon?: string;
  featherIcon?: keyof typeof Feather.glyphMap;
  onPress: () => void;
  backgroundColor: string;
  color: string;
  position?: 'right' | 'left';
  size?: number;
  bottom?: number;
}

export function FloatingActionButton({
  icon,
  featherIcon,
  onPress,
  backgroundColor,
  color,
  position = 'right',
  size = 50,
  bottom = 30,
}: FloatingActionButtonProps) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor,
          width: size,
          height: size,
          borderRadius: size / 2,
          bottom: bottom + insets.bottom,
          [position === 'right' ? 'right' : 'left']: 20,
        },
      ]}
    >
      {featherIcon ? (
        <Feather name={featherIcon} size={size * 0.45} color={color} />
      ) : (
        <Text style={[styles.icon, { color, fontSize: size * 0.45 }]}>{icon}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  icon: {
    fontWeight: 'bold',
  },
});
