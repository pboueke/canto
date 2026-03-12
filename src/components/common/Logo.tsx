import { Image, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

const logoDark = require('@/assets/images/canto_bv1.png');

interface LogoProps {
  size?: number;
}

export function Logo({ size = 180 }: LogoProps) {
  const { isDark } = useTheme();

  return (
    <Image
      source={logoDark}
      style={[
        styles.logo,
        {
          width: size,
          height: size,
          tintColor: isDark ? '#FFFFFF' : undefined,
        },
      ]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  logo: {},
});
