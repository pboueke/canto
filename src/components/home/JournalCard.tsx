import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/common/Card';
import { ThemeContext, useTheme } from '@/hooks/useTheme';
import { type ThemeName, themes } from '@/styles/themes';
import type { Journal } from 'canto-data';

interface JournalCardProps {
  journal: Journal;
  onPress: () => void;
}

export function JournalCard({ journal, onPress }: JournalCardProps) {
  const { theme: globalTheme, setThemeName } = useTheme();
  const hasBadges = journal.secure || journal.biometric;

  const overrideName = journal.themeOverride as ThemeName | undefined;
  const overrideTheme = overrideName && overrideName in themes ? themes[overrideName] : null;
  const theme = overrideTheme ?? globalTheme;

  const themeContextValue = useMemo(
    () => ({ theme, setThemeName, isDark: theme.isDark }),
    [theme, setThemeName],
  );

  const card = (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.badgeRow}>
        {journal.secure && <Feather name="key" size={12} color={theme.colors.textSecondary} />}
        {journal.biometric && <Feather name="lock" size={12} color={theme.colors.textSecondary} />}
        {!hasBadges && <View style={styles.badgeSpacer} />}
      </View>
      <View style={styles.iconContainer}>
        <Feather
          name={(journal.icon || 'book') as React.ComponentProps<typeof Feather>['name']}
          size={42}
          color={theme.colors.text}
        />
      </View>
      <Text
        style={[styles.name, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
        numberOfLines={1}
      >
        {journal.title}
      </Text>
    </Card>
  );

  if (overrideTheme) {
    return <ThemeContext.Provider value={themeContextValue}>{card}</ThemeContext.Provider>;
  }

  return card;
}

const styles = StyleSheet.create({
  card: {
    width: 140,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 5,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 14,
  },
  badgeSpacer: {
    height: 12,
  },
  iconContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
});
