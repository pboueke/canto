import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import type { GeoLocation } from 'canto-data';

interface LocationTagProps {
  location: GeoLocation;
  editable: boolean;
  onRemove?: () => void;
}

export function LocationTag({ location, editable, onRemove }: LocationTagProps) {
  const { theme } = useTheme();
  const { t } = useI18n();

  const coordText = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;

  const handlePress = () => {
    const url =
      Platform.OS === 'web'
        ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
        : `geo:${location.latitude},${location.longitude}`;
    Linking.openURL(url);
  };

  const handleLongPress = async () => {
    await Clipboard.setStringAsync(`${location.latitude},${location.longitude}`);
    Alert.alert(t.page.locationCopied);
  };

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        style={[
          styles.tag,
          {
            backgroundColor: theme.colors.location.background,
            borderColor: theme.colors.border,
            borderWidth: theme.borderWidth,
          },
        ]}
      >
        <Feather name="map-pin" size={14} color={theme.colors.location.text} />
        <Text
          style={[
            styles.text,
            { color: theme.colors.location.text, fontFamily: theme.fonts.regular },
          ]}
        >
          {coordText}
        </Text>
        <Feather name="external-link" size={12} color={theme.colors.location.text} />
        {editable && (
          <Pressable
            onPress={onRemove}
            style={[styles.removeButton, { backgroundColor: theme.colors.deleteAction }]}
          >
            <Feather name="x" size={10} color="#fff" />
          </Pressable>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 10,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: {
    fontSize: 13,
  },
  removeButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});
