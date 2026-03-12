import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import type { LangCode } from '@/i18n/dictionaries';

export default function HomeScreen() {
  const { theme, toggleTheme, isDark } = useTheme();
  const { lang, setLang, t } = useI18n();

  const nextLang: LangCode = lang === 'en' ? 'pt' : 'en';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.primary }]}>{t.app.name}</Text>
      <Text style={[styles.tagline, { color: theme.colors.textSecondary }]}>{t.app.tagline}</Text>

      <View style={styles.controls}>
        <Pressable
          style={[styles.button, { backgroundColor: theme.colors.buttonSubmit }]}
          onPress={toggleTheme}
        >
          <Text style={styles.buttonText}>
            {isDark ? t.settings.lightMode : t.settings.darkMode}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.button, { backgroundColor: theme.colors.accent }]}
          onPress={() => setLang(nextLang)}
        >
          <Text style={styles.buttonText}>
            {t.settings.language}: {nextLang.toUpperCase()}
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.info, { color: theme.colors.textSecondary }]}>{t.home.noJournals}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 18,
    marginBottom: 48,
  },
  controls: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 48,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  info: {
    fontSize: 14,
    textAlign: 'center',
  },
});
