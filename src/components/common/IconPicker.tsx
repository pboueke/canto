import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json';
import { useTheme } from '@/hooks/useTheme';

const ALL_ICONS = Object.keys(glyphMap) as React.ComponentProps<typeof Feather>['name'][];

interface IconPickerProps {
  selected: string;
  onSelect: (icon: string) => void;
}

export function IconPicker({ selected, onSelect }: IconPickerProps) {
  const { theme } = useTheme();

  return (
    <ScrollView style={styles.scroll} nestedScrollEnabled showsVerticalScrollIndicator>
      <View style={styles.grid}>
        {ALL_ICONS.map((icon) => {
          const isSelected = icon === selected;
          return (
            <Pressable
              key={icon}
              onPress={() => onSelect(icon)}
              style={[
                styles.iconButton,
                {
                  backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                  borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                  borderWidth: theme.borderWidth || 1,
                },
              ]}
            >
              <Feather
                name={icon}
                size={20}
                color={isSelected ? theme.colors.foreground : theme.colors.text}
              />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 200,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
