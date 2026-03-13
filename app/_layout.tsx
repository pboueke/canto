import 'react-native-get-random-values'; // CSPRNG polyfill — must be first import
import { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ThemeContext } from '@/hooks/useTheme';
import { I18nContext } from '@/hooks/useI18n';
import { JournalKeyProvider } from '@/contexts/JournalKeyContext';
import { type CantoTheme, type ThemeName, themes, lightTheme } from '@/styles/themes';
import { type LangCode, dictionaries } from '@/i18n/dictionaries';

SplashScreen.preventAutoHideAsync();

const THEME_KEY = 'canto:theme';
const LANG_KEY = 'canto:lang';

export default function RootLayout() {
  const [theme, setTheme] = useState<CantoTheme>(lightTheme);
  const [lang, setLangState] = useState<LangCode>('en');
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [fontsLoaded] = useFonts({
    'Lato-Regular': require('@/assets/fonts/Lato-Regular.ttf'),
    'Lato-Bold': require('@/assets/fonts/Lato-Bold.ttf'),
    'Lato-Light': require('@/assets/fonts/Lato-Light.ttf'),
    'Lato-Italic': require('@/assets/fonts/Lato-Italic.ttf'),
    'Merriweather-Regular': require('@/assets/fonts/Merriweather-Regular.ttf'),
    'Merriweather-Bold': require('@/assets/fonts/Merriweather-Bold.ttf'),
  });

  useEffect(() => {
    const loadPreferences = async () => {
      const [savedTheme, savedLang] = await Promise.all([
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(LANG_KEY),
      ]);
      if (savedTheme && savedTheme in themes) {
        setTheme(themes[savedTheme as ThemeName]);
      }
      if (savedLang && savedLang in dictionaries) {
        setLangState(savedLang as LangCode);
      }
      setPrefsLoaded(true);
    };
    loadPreferences();
  }, []);

  useEffect(() => {
    if (fontsLoaded && prefsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, prefsLoaded]);

  const setThemeName = useCallback((name: ThemeName) => {
    const next = themes[name];
    if (next) {
      setTheme(next);
      AsyncStorage.setItem(THEME_KEY, name);
    }
  }, []);

  const setLang = useCallback((newLang: LangCode) => {
    setLangState(newLang);
    AsyncStorage.setItem(LANG_KEY, newLang);
  }, []);

  if (!fontsLoaded || !prefsLoaded) return null;

  const isDark = theme.isDark;

  return (
    <ThemeContext.Provider value={{ theme, setThemeName, isDark }}>
      <I18nContext.Provider value={{ lang, setLang, t: dictionaries[lang] }}>
        <JournalKeyProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.colors.headerBackground },
              headerTintColor: theme.colors.text,
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen
              name="journal/[id]"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="page/[id]"
              options={{
                headerShown: false,
              }}
            />
          </Stack>
        </JournalKeyProvider>
      </I18nContext.Provider>
    </ThemeContext.Provider>
  );
}
