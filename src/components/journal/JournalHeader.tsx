import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { BackButton } from '@/components/common/BackButton';
import type { Journal } from '@/models';

interface JournalHeaderProps {
  journal: Journal;
  onPressSettings?: () => void;
  onPressData?: () => void;
}

export function JournalHeader({ journal, onPressSettings, onPressData }: JournalHeaderProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.headerBackground,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: theme.borderWidth,
          paddingTop: insets.top + 5,
        },
      ]}
    >
      <BackButton />
      <Feather
        name={(journal.icon || 'book') as React.ComponentProps<typeof Feather>['name']}
        size={22}
        color={theme.colors.text}
      />
      <Text
        style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
        numberOfLines={1}
      >
        {journal.title}
      </Text>
      <View style={styles.actions}>
        <Pressable onPress={onPressData} style={styles.actionButton}>
          <Feather name="save" size={20} color={theme.colors.text} />
        </Pressable>
        <Pressable onPress={onPressSettings} style={styles.actionButton}>
          <Feather name="settings" size={20} color={theme.colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 10,
    gap: 10,
  },
  title: {
    fontSize: 20,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 15,
  },
  actionButton: {
    padding: 4,
  },
});
