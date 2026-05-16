import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeContext, useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useJournal } from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { useCalendarScroll } from '@/contexts/CalendarScrollContext';
import { CalendarHeader } from '@/components/journal/CalendarHeader';
import { AnniversaryRow } from '@/components/journal/AnniversaryRow';
import { MonthPreview } from '@/components/journal/MonthPreview';
import { pageToPreview } from 'canto-data';
import { type ThemeName, themes } from '@/styles/themes';
import { useFontPrefs } from '@/contexts/FontPrefsContext';
import { applyFontPrefs } from '@/lib/font';
import { getAnniversaryPages, getMonthsWithPages, monthRange } from '@/lib/calendar';

export default function JournalCalendarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme: globalTheme, setThemeName } = useTheme();
  const { t } = useI18n();
  const { fontFamily, fontSize } = useFontPrefs();
  const { getKey } = useJournalKeys();
  const insets = useSafeAreaInsets();
  const { getOffset, setOffset } = useCalendarScroll();

  const derivedKey = id ? getKey(id) : null;
  const { journal, loading } = useJournal(id, derivedKey);

  const overrideName = journal?.settings.themeOverride as ThemeName | undefined;
  const overrideRawTheme = overrideName && overrideName in themes ? themes[overrideName] : null;
  const theme = overrideRawTheme
    ? applyFontPrefs(overrideRawTheme, fontFamily, fontSize)
    : globalTheme;
  const isDark = theme.isDark;

  const pages = useMemo(() => {
    if (!journal) return [];
    return journal.pages.filter((p) => !p.deleted).map(pageToPreview);
  }, [journal]);

  const sort = journal?.settings.sort ?? 'descending';
  const months = useMemo(() => getMonthsWithPages(pages, sort), [pages, sort]);
  const anniversaryCount = useMemo(() => getAnniversaryPages(pages, new Date()).length, [pages]);

  const scrollRef = useRef<ScrollView | null>(null);
  const scrolledToInitialRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    if (!loading && journal && !scrolledToInitialRef.current) {
      const offset = getOffset(id);
      if (offset > 0) {
        scrollRef.current?.scrollTo({ y: offset, animated: false });
      }
      scrolledToInitialRef.current = true;
    }
  }, [loading, journal, id, getOffset]);

  useEffect(() => {
    if (!loading && !journal) {
      router.replace('/');
    }
  }, [loading, journal]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!id) return;
      setOffset(id, e.nativeEvent.contentOffset.y);
    },
    [id, setOffset],
  );

  const onPressAnniversary = useCallback(() => {
    if (!id) return;
    router.dismissAll();
    router.push(`/journal/${id}?anniversary=1`);
  }, [id]);

  const onPressMonth = useCallback(
    ({ year, month }: { year: number; month: number }) => {
      if (!id) return;
      const { start, end } = monthRange(year, month);
      router.dismissAll();
      router.push(`/journal/${id}?dateStart=${start}&dateEnd=${end}`);
    },
    [id],
  );

  const themeContextValue = useMemo(
    () => ({ theme, setThemeName, isDark }),
    [theme, setThemeName, isDark],
  );

  if (loading && !journal) {
    return (
      <ThemeContext.Provider value={themeContextValue}>
        <View
          style={[
            styles.centered,
            { backgroundColor: theme.colors.background, paddingTop: insets.top },
          ]}
        >
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </ThemeContext.Provider>
    );
  }

  if (!journal) {
    return (
      <ThemeContext.Provider value={themeContextValue}>
        <View
          style={[
            styles.centered,
            { backgroundColor: theme.colors.background, paddingTop: insets.top },
          ]}
        >
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={themeContextValue}>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <CalendarHeader journal={journal} />
        {months.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>
              {t.calendar.noPages}
            </Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={64}
            contentContainerStyle={styles.scrollContent}
          >
            <AnniversaryRow count={anniversaryCount} onPress={onPressAnniversary} />
            {months.map((m) => (
              <MonthPreview
                key={`${m.year}-${m.month}`}
                year={m.year}
                month={m.month}
                daysWithPages={m.daysWithPages}
                onPress={onPressMonth}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    fontSize: 16,
    textAlign: 'center',
  },
});
