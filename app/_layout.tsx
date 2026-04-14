import 'react-native-get-random-values'; // CSPRNG polyfill — must be first import
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ThemeContext } from '@/hooks/useTheme';
import { I18nContext } from '@/hooks/useI18n';
import { JournalKeyProvider, useJournalKeys } from '@/contexts/JournalKeyContext';
import { AutoLockModal } from '@/components/common/AutoLockModal';
import { GoogleAuthProvider } from '@/contexts/GoogleAuthContext';
import { SyncManagerProvider } from '@/contexts/SyncManagerContext';
import { CalendarScrollProvider } from '@/contexts/CalendarScrollContext';
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
        <GoogleAuthProvider>
          <JournalKeyProvider>
            <SyncManagerProvider>
              <CalendarScrollProvider>
                <AppContent theme={theme} isDark={isDark} />
              </CalendarScrollProvider>
            </SyncManagerProvider>
          </JournalKeyProvider>
        </GoogleAuthProvider>
      </I18nContext.Provider>
    </ThemeContext.Provider>
  );
}

function AppContent({ theme, isDark }: { theme: CantoTheme; isDark: boolean }) {
  const { touchActivity } = useJournalKeys();

  return (
    <View
      style={[layoutStyles.outer, { backgroundColor: isDark ? '#1a1a1a' : '#e8e8e8' }]}
      onStartShouldSetResponderCapture={() => {
        touchActivity();
        return false;
      }}
    >
      <View
        style={[
          layoutStyles.inner,
          Platform.OS === 'web' && layoutStyles.innerWeb,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.headerBackground },
            headerTintColor: theme.colors.text,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="journal/[id]/index"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="journal/[id]/calendar"
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
      </View>
      <AutoLockModal />
    </View>
  );
}

const MAX_APP_WIDTH = 1200;

const layoutStyles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: Platform.OS === 'web' ? 'center' : undefined,
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? MAX_APP_WIDTH : undefined,
  },
  innerWeb: {
    boxShadow: '0 0 20px rgba(0, 0, 0, 0.15)',
  },
});
