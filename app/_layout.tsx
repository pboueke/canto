import { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { ThemeContext } from '@/hooks/useTheme';
import { I18nContext } from '@/hooks/useI18n';
import { type CantoTheme, lightTheme, darkTheme } from '@/styles/themes';
import { type LangCode, dictionaries } from '@/i18n/dictionaries';

const THEME_KEY = 'canto:theme';
const LANG_KEY = 'canto:lang';

export default function RootLayout() {
  const [theme, setTheme] = useState<CantoTheme>(lightTheme);
  const [lang, setLangState] = useState<LangCode>('en');

  useEffect(() => {
    const loadPreferences = async () => {
      const [savedTheme, savedLang] = await Promise.all([
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(LANG_KEY),
      ]);
      if (savedTheme === 'dark') setTheme(darkTheme);
      if (savedLang === 'pt') setLangState('pt');
    };
    loadPreferences();
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev.name === 'light' ? darkTheme : lightTheme;
      AsyncStorage.setItem(THEME_KEY, next.name);
      return next;
    });
  }, []);

  const setLang = useCallback((newLang: LangCode) => {
    setLangState(newLang);
    AsyncStorage.setItem(LANG_KEY, newLang);
  }, []);

  const isDark = theme.name === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark }}>
      <I18nContext.Provider value={{ lang, setLang, t: dictionaries[lang] }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.text,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
      </I18nContext.Provider>
    </ThemeContext.Provider>
  );
}
