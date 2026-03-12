import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

const ICONS: string[] = [
  'book',
  'book-open',
  'bookmark',
  'star',
  'heart',
  'map',
  'map-pin',
  'briefcase',
  'coffee',
  'camera',
  'music',
  'sun',
  'moon',
  'cloud',
  'feather',
  'pen-tool',
  'compass',
  'globe',
  'home',
  'archive',
  'award',
  'gift',
  'smile',
  'zap',
  'target',
  'flag',
  'anchor',
  'edit-3',
];

interface IconPickerProps {
  selected: string;
  onSelect: (icon: string) => void;
}

export function IconPicker({ selected, onSelect }: IconPickerProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.grid}>
      {ICONS.map((icon: string) => {
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
              name={icon as React.ComponentProps<typeof Feather>['name']}
              size={20}
              color={isSelected ? theme.colors.foreground : theme.colors.text}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
