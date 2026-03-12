import { Pressable, StyleSheet, Text } from 'react-native';

interface FloatingActionButtonProps {
  icon: string;
  onPress: () => void;
  backgroundColor: string;
  color: string;
  position?: 'right' | 'left';
  size?: number;
}

export function FloatingActionButton({
  icon,
  onPress,
  backgroundColor,
  color,
  position = 'right',
  size = 50,
}: FloatingActionButtonProps) {
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
          [position === 'right' ? 'right' : 'left']: 20,
        },
      ]}
    >
      <Text style={[styles.icon, { color, fontSize: size * 0.45 }]}>{icon}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: 30,
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
