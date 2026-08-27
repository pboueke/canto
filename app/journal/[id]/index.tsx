import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { usePagination } from '@/hooks/usePagination';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeContext, useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useJournalOverview, useCreatePage } from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { useFilter } from '@/hooks/useFilter';
import { JournalHeader } from '@/components/journal/JournalHeader';
import { PageListItem } from '@/components/journal/PageListItem';
import { FilterBar } from '@/components/journal/FilterBar';
import { JournalSettings } from '@/components/journal/JournalSettings';
import { ExportJournalModal } from '@/components/journal/ExportJournalModal';
import { SyncModal } from '@/components/journal/SyncModal';
import { FloatingActionButton } from '@/components/common/FloatingActionButton';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';
import { useSyncManager, useSyncState } from '@/contexts/SyncManagerContext';
import { type ThemeName, themes } from '@/styles/themes';
import { useFontPrefs } from '@/contexts/FontPrefsContext';
import { applyFontPrefs } from '@/lib/font';
import { getAnniversaryPages } from '@/lib/calendar';

export default function JournalScreen() {
  const params = useLocalSearchParams<{
    id: string;
    anniversary?: string;
    dateStart?: string;
    dateEnd?: string;
  }>();
  const { id } = params;
  const { theme: globalTheme, setThemeName } = useTheme();
  const { t } = useI18n();
  const { fontFamily, fontSize } = useFontPrefs();
  const { getKey, deriveAndCache } = useJournalKeys();
  const insets = useSafeAreaInsets();

  // URL params are read once on mount to seed the filter.
  const initialFilter = useRef({
    anniversary: params.anniversary === '1',
    dateStart: params.dateStart,
    dateEnd: params.dateEnd,
  }).current;

  const derivedKey = id ? getKey(id) : null;
  const {
    overview,
    loading,
    status: overviewStatus,
    migrationProgress,
    refresh,
  } = useJournalOverview(id, derivedKey);
  const journal = overview?.metadata ?? null;
  const [showSettings, setShowSettings] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const { create: createPage } = useCreatePage(id, derivedKey);
  const { isSignedIn } = useGoogleAuth();
  const { syncJournal } = useSyncManager();
  const syncState = useSyncState(id ?? '');

  const lastSyncedModified = useRef<number | null>(null);

  // A visible chunked source is never used for a list thumbnail. Sync is held
  // until every eligible initial thumbnail has actually entered its loader.
  const thumbnailStarts = useRef(new Set<string>());
  const [thumbnailStartVersion, setThumbnailStartVersion] = useState(0);
  const onThumbnailLoadStart = useCallback((pageId: string) => {
    if (!thumbnailStarts.current.has(pageId)) {
      thumbnailStarts.current.add(pageId);
      setThumbnailStartVersion((version) => version + 1);
    }
  }, []);

  useEffect(() => {
    if (journal && journal.salt && !journal.secure && !getKey(journal.id)) {
      deriveAndCache(journal.id, '', journal.salt, journal.kdfIterations);
    }
  }, [journal, getKey, deriveAndCache]);

  useEffect(() => {
    if (!loading && !journal) {
      router.replace('/');
    }
  }, [loading, journal]);

  const overrideName = journal?.settings.themeOverride as ThemeName | undefined;
  const overrideRawTheme = overrideName && overrideName in themes ? themes[overrideName] : null;
  const theme = overrideRawTheme
    ? applyFontPrefs(overrideRawTheme, fontFamily, fontSize)
    : globalTheme;
  const isDark = theme.isDark;

  const pages = useMemo(() => {
    if (!journal || !overview) return [];
    const sorted = overview.pages
      .filter((p) => !p.deleted)
      .sort((a, b) => {
        if (journal.settings.sort === 'ascending') {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        }
        if (journal.settings.sort === 'descending') {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        return 0;
      });
    return sorted;
  }, [overview, journal?.settings.sort]);

  const hasAnniversaries = useMemo(
    () => getAnniversaryPages(pages, new Date()).length > 0,
    [pages],
  );

  const availableTags = useMemo(() => {
    return overview?.tags ?? [];
  }, [overview]);

  const {
    filter,
    anniversary,
    filteredPages,
    isActive: filterIsActive,
    setQuery,
    setDateStart,
    setDateEnd,
    toggleProperty,
    toggleTag,
    clearFilters,
  } = useFilter(pages, initialFilter);

  const { visiblePages, loadMore, hasMore } = usePagination(filteredPages, 15, (page) => page.id);
  const initialThumbnailIds = useMemo(
    () =>
      visiblePages
        .filter(
          (page) =>
            !page.thumbnail &&
            !!page.firstImage &&
            !page.firstImageChunked &&
            (journal?.settings.previewThumbnail ?? true),
        )
        .map((page) => page.id),
    [visiblePages, journal?.settings.previewThumbnail],
  );

  useFocusEffect(
    useCallback(() => {
      if (!journal?.settings.autoSync || !journal.settings.remoteSync || !isSignedIn) return;
      // Do not race a queued InteractionManager callback. Every initially
      // visible legacy thumbnail has called into its actual loader first.
      if (!initialThumbnailIds.every((pageId) => thumbnailStarts.current.has(pageId))) return;

      const latestModified = overview?.latestModified ?? 0;
      if (lastSyncedModified.current === latestModified) return;
      lastSyncedModified.current = latestModified;
      void (async () => {
        const outcome = await syncJournal(journal.id, derivedKey ?? undefined);
        if (outcome.kind === 'completed') {
          // Sync writes remote pages directly through LocalStore, bypassing the
          // hook mutation helpers that normally invalidate this overview.
          // Reload it now so newly downloaded entries appear without leaving
          // and reopening the journal.
          const refreshed = await refresh();
          if (refreshed) lastSyncedModified.current = refreshed.latestModified;
        }
        if (outcome.kind === 'failed' && outcome.errorCode === 'password-changed-elsewhere') {
          setShowSyncModal(true);
        }
      })();
    }, [
      journal?.settings.autoSync,
      journal?.settings.remoteSync,
      journal?.settings.previewThumbnail,
      journal?.id,
      overview?.latestModified,
      isSignedIn,
      initialThumbnailIds,
      thumbnailStartVersion,
      derivedKey,
      syncJournal,
      refresh,
    ]),
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
            styles.container,
            styles.centered,
            { backgroundColor: theme.colors.background, paddingTop: insets.top },
          ]}
        >
          <ActivityIndicator size="large" color={theme.colors.primary} />
          {overviewStatus === 'migrating' && migrationProgress && (
            <Text style={[styles.optimizing, { color: theme.colors.textSecondary }]}>
              {t.common.loading} {migrationProgress.current}/{migrationProgress.total}
            </Text>
          )}
        </View>
      </ThemeContext.Provider>
    );
  }

  if (!journal) {
    return (
      <ThemeContext.Provider value={themeContextValue}>
        <View
          style={[
            styles.container,
            styles.centered,
            { backgroundColor: theme.colors.background, paddingTop: insets.top },
          ]}
        >
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </ThemeContext.Provider>
    );
  }

  if (showSettings && journal) {
    return (
      <ThemeContext.Provider value={themeContextValue}>
        <JournalSettings
          journal={journal}
          pageCount={pages.length}
          derivedKey={derivedKey}
          onClose={() => setShowSettings(false)}
          onJournalChanged={refresh}
        />
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={themeContextValue}>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <JournalHeader
          journal={journal}
          onPressCalendar={() => router.push(`/journal/${journal.id}/calendar`)}
          onPressSettings={() => setShowSettings(true)}
          onPressExport={() => setShowExportModal(true)}
          onPressSync={() => setShowSyncModal(true)}
          syncStatus={syncState.status}
          isSyncEnabled={journal.settings.syncProvider === 'gdrive'}
          hasUnsyncedChanges={
            syncState.lastSynced == null || (overview?.latestModified ?? 0) > syncState.lastSynced
          }
          hasAnniversaries={hasAnniversaries}
        />

        {journal.settings.filterBar && (
          <FilterBar
            filter={filter}
            isActive={filterIsActive}
            availableTags={availableTags}
            onSetQuery={setQuery}
            onSetDateStart={setDateStart}
            onSetDateEnd={setDateEnd}
            onToggleProperty={toggleProperty}
            onToggleTag={toggleTag}
            onClearFilters={clearFilters}
          />
        )}

        {anniversary && (
          <View style={[styles.anniversaryBanner, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.anniversaryText, { fontFamily: theme.fonts.bold }]}>
              {t.journal.anniversary}
            </Text>
          </View>
        )}

        {filteredPages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>
              {filterIsActive ? `${t.journal.filter}: 0` : t.journal.noPages}
            </Text>
          </View>
        ) : (
          <FlatList
            data={visiblePages}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              hasMore ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.primary}
                  style={styles.loadingMore}
                />
              ) : null
            }
            renderItem={({ item }) => (
              <PageListItem
                page={item}
                journalId={journal.id}
                settings={journal.settings}
                onThumbnailLoadStart={onThumbnailLoadStart}
              />
            )}
          />
        )}

        <FloatingActionButton
          icon="+"
          onPress={async () => {
            const pageId = await createPage();
            if (pageId) {
              const themeParam = overrideName ? `&themeOverride=${overrideName}` : '';
              router.push(`/page/${pageId}?journalId=${journal.id}&edit=true${themeParam}`);
            }
          }}
          backgroundColor={theme.colors.popAction.new.background}
          color={theme.colors.popAction.new.text}
        />

        <ExportJournalModal
          visible={showExportModal}
          journal={journal}
          derivedKey={derivedKey}
          onClose={() => setShowExportModal(false)}
        />

        <SyncModal
          visible={showSyncModal}
          journal={journal}
          derivedKey={derivedKey}
          onClose={() => setShowSyncModal(false)}
          onJournalChanged={refresh}
        />
      </View>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 10,
    paddingBottom: 100,
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
  loadingMore: {
    paddingVertical: 20,
  },
  optimizing: {
    marginTop: 12,
    fontSize: 14,
  },
  anniversaryBanner: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  anniversaryText: {
    color: '#fff',
    fontSize: 13,
  },
});
