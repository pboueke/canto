import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { usePagination } from '@/hooks/usePagination';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeContext, useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useJournal, useCreatePage } from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { useFilter } from '@/hooks/useFilter';
import { JournalHeader } from '@/components/journal/JournalHeader';
import { PageListItem } from '@/components/journal/PageListItem';
import { FilterBar } from '@/components/journal/FilterBar';
import { JournalSettings } from '@/components/journal/JournalSettings';
import { ExportMenu } from '@/components/journal/ExportMenu';
import { ExportJournalModal } from '@/components/journal/ExportJournalModal';
import { SyncModal } from '@/components/journal/SyncModal';
import { FloatingActionButton } from '@/components/common/FloatingActionButton';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';
import { useSyncManager, useSyncState } from '@/contexts/SyncManagerContext';
import { pageToPreview } from '@/models';
import { type ThemeName, themes } from '@/styles/themes';

export default function JournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme: globalTheme, setThemeName } = useTheme();
  const { t } = useI18n();
  const { getKey, deriveAndCache } = useJournalKeys();
  const insets = useSafeAreaInsets();

  const derivedKey = id ? getKey(id) : null;
  const { journal, loading, refresh } = useJournal(id, derivedKey);
  const { create: createPage } = useCreatePage(id, derivedKey);
  const { isSignedIn } = useGoogleAuth();
  const { syncJournal } = useSyncManager();
  const syncState = useSyncState(id ?? '');
  const [showSettings, setShowSettings] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // Auto-sync on focus if configured
      if (journal?.settings.autoSync && journal.settings.remoteSync && isSignedIn) {
        syncJournal(journal.id, derivedKey ?? undefined);
      }
    }, [
      refresh,
      journal?.settings.autoSync,
      journal?.settings.remoteSync,
      isSignedIn,
      journal?.id,
      derivedKey,
      syncJournal,
    ]),
  );

  // Safety net: auto-derive key for non-secure journals that have salt
  useEffect(() => {
    if (journal && journal.salt && !journal.secure && !getKey(journal.id)) {
      deriveAndCache(journal.id, '', journal.salt, journal.kdfIterations);
    }
  }, [journal, getKey, deriveAndCache]);

  // Redirect to home if journal not found
  useEffect(() => {
    if (!loading && !journal) {
      router.replace('/');
    }
  }, [loading, journal]);

  const overrideName = journal?.settings.themeOverride as ThemeName | undefined;
  const overrideTheme = overrideName && overrideName in themes ? themes[overrideName] : null;
  const theme = overrideTheme ?? globalTheme;
  const isDark = theme.isDark;

  const pages = useMemo(() => {
    if (!journal) return [];
    const sorted = journal.pages
      .filter((p) => !p.deleted)
      .sort((a, b) => {
        if (journal.settings.sort === 'ascending') {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        }
        if (journal.settings.sort === 'descending') {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        return 0;
      })
      .map(pageToPreview);
    return sorted;
  }, [journal]);

  // Collect all tags from journal for filter
  const availableTags = useMemo(() => {
    if (!journal) return [];
    const tagSet = new Set<string>();
    for (const page of journal.pages) {
      if (!page.deleted) {
        for (const tag of page.tags) {
          tagSet.add(tag.toLowerCase());
        }
      }
    }
    return Array.from(tagSet).sort();
  }, [journal]);

  const {
    filter,
    filteredPages,
    isActive: filterIsActive,
    setQuery,
    setDateStart,
    setDateEnd,
    toggleProperty,
    toggleTag,
    clearFilters,
  } = useFilter(pages);

  const { visiblePages, loadMore, hasMore } = usePagination(filteredPages, 15);

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
        </View>
      </ThemeContext.Provider>
    );
  }

  if (showSettings) {
    return (
      <ThemeContext.Provider value={themeContextValue}>
        <JournalSettings
          journal={journal}
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
          onPressSettings={() => setShowSettings(true)}
          onPressExport={() => setShowExportMenu(true)}
          onPressSync={() => setShowSyncModal(true)}
          syncStatus={syncState.status}
          isSyncEnabled={journal.settings.syncProvider === 'gdrive'}
          hasUnsyncedChanges={
            syncState.lastSynced == null ||
            journal.pages.some((p) => p.modified > syncState.lastSynced!)
          }
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

        {filteredPages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.empty, { color: theme.colors.textSecondary }]}>
              {filterIsActive ? `${t.journal.filter}: 0` : t.journal.noPages}
            </Text>
          </View>
        ) : (
          <FlatList
            data={visiblePages}
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
              <PageListItem page={item} journalId={journal.id} settings={journal.settings} />
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

        <ExportMenu
          visible={showExportMenu}
          onClose={() => setShowExportMenu(false)}
          onExport={() => setShowExportModal(true)}
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
});
