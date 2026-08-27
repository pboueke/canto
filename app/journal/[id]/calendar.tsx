import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeContext, useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useJournalOverview } from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { useCalendarScroll } from '@/contexts/CalendarScrollContext';
import { CalendarHeader } from '@/components/journal/CalendarHeader';
import { AnniversaryRow } from '@/components/journal/AnniversaryRow';
import { MonthPreview } from '@/components/journal/MonthPreview';
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
  const { getScrollAnchor, setScrollAnchor } = useCalendarScroll();

  const derivedKey = id ? getKey(id) : null;
  const { overview, loading } = useJournalOverview(id, derivedKey);
  const journal = overview?.metadata ?? null;

  const overrideName = journal?.settings.themeOverride as ThemeName | undefined;
  const overrideRawTheme = overrideName && overrideName in themes ? themes[overrideName] : null;
  const theme = overrideRawTheme
    ? applyFontPrefs(overrideRawTheme, fontFamily, fontSize)
    : globalTheme;
  const isDark = theme.isDark;

  const pages = useMemo(() => {
    return overview?.pages.filter((page) => !page.deleted) ?? [];
  }, [overview]);

  const sort = journal?.settings.sort ?? 'descending';
  const months = useMemo(() => getMonthsWithPages(pages, sort), [pages, sort]);
  const anniversaryCount = useMemo(() => getAnniversaryPages(pages, new Date()).length, [pages]);

  const scrollRef = useRef<FlatList<(typeof months)[number]> | null>(null);
  const scrolledToInitialRef = useRef(false);
  const scrollOffsetRef = useRef(0);
  const monthLayoutsRef = useRef(new Map<string, number>());
  const journalIdRef = useRef(id);
  journalIdRef.current = id;

  useEffect(() => {
    if (!id) return;
    if (!loading && journal && !scrolledToInitialRef.current) {
      const anchor = getScrollAnchor(id);
      const index = anchor
        ? months.findIndex((month) => `${month.year}-${month.month}` === anchor.monthKey)
        : -1;
      if (index >= 0) {
        scrollRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0 });
        if (anchor?.relativeOffset) {
          // scrollToIndex establishes a stable month-relative baseline even if
          // earlier month cards changed height since the previous visit.
          setTimeout(() => {
            scrollRef.current?.scrollToOffset({
              offset: Math.max(0, scrollOffsetRef.current + anchor.relativeOffset),
              animated: false,
            });
          }, 0);
        }
      }
      scrolledToInitialRef.current = true;
    }
  }, [loading, journal, id, getScrollAnchor, months]);

  useEffect(() => {
    if (!loading && !journal) {
      router.replace('/');
    }
  }, [loading, journal]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const journalId = journalIdRef.current;
    if (!journalId) return;
    const firstMonth = viewableItems.find((item) => item.isViewable && item.item);
    if (firstMonth?.item) {
      const monthKey = `${firstMonth.item.year}-${firstMonth.item.month}`;
      const top = monthLayoutsRef.current.get(monthKey);
      setScrollAnchor(journalId, {
        monthKey,
        relativeOffset: top === undefined ? 0 : Math.max(0, scrollOffsetRef.current - top),
      });
    }
  }).current;

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

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
          <FlatList
            ref={scrollRef}
            data={months}
            keyExtractor={(month) => `${month.year}-${month.month}`}
            initialNumToRender={3}
            maxToRenderPerBatch={4}
            windowSize={5}
            removeClippedSubviews
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{ itemVisiblePercentThreshold: 25 }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                scrollRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0 });
              }, 0);
            }}
            contentContainerStyle={styles.scrollContent}
            ListHeaderComponent={
              <AnniversaryRow count={anniversaryCount} onPress={onPressAnniversary} />
            }
            renderItem={({ item: m }) => {
              const monthKey = `${m.year}-${m.month}`;
              return (
                <View
                  onLayout={(event) => {
                    monthLayoutsRef.current.set(monthKey, event.nativeEvent.layout.y);
                  }}
                >
                  <MonthPreview
                    year={m.year}
                    month={m.month}
                    daysWithPages={m.daysWithPages}
                    onPress={onPressMonth}
                  />
                </View>
              );
            }}
          />
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
