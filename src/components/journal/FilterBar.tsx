import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

const DateTimePicker =
  Platform.OS !== 'web' ? require('@react-native-community/datetimepicker').default : null;
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import type { Filter } from '@/data';
import { FilterModal } from './FilterModal';

interface FilterBarProps {
  filter: Filter;
  isActive: boolean;
  availableTags: string[];
  onSetQuery: (query: string) => void;
  onSetDateStart: (date: string | undefined) => void;
  onSetDateEnd: (date: string | undefined) => void;
  onToggleProperty: (prop: 'hasFile' | 'hasImage' | 'hasComments' | 'hasLocation') => void;
  onToggleTag: (tag: string) => void;
  onClearFilters: () => void;
}

export function FilterBar({
  filter,
  isActive,
  availableTags,
  onSetQuery,
  onSetDateStart,
  onSetDateEnd,
  onToggleProperty,
  onToggleTag,
  onClearFilters,
}: FilterBarProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [showFilterModal, setShowFilterModal] = useState(false);
  const dateStartRef = useRef<HTMLInputElement>(null);
  const dateEndRef = useRef<HTMLInputElement>(null);
  const [showDateStart, setShowDateStart] = useState(false);
  const [showDateEnd, setShowDateEnd] = useState(false);
  const [localQuery, setLocalQuery] = useState(filter.query);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local query when filter is cleared externally
  useEffect(() => {
    if (filter.query === '' && localQuery !== '') setLocalQuery('');
  }, [filter.query]);

  const handleQueryChange = useCallback(
    (text: string) => {
      setLocalQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onSetQuery(text), 200);
    },
    [onSetQuery],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleClearQuery = useCallback(() => {
    setLocalQuery('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSetQuery('');
  }, [onSetQuery]);

  const formatDate = (iso: string | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.filterRow, borderBottomColor: theme.colors.border },
      ]}
    >
      <View style={styles.row}>
        <Pressable
          style={[styles.filterBtn, { backgroundColor: theme.colors.surface }]}
          onPress={() => setShowFilterModal(true)}
          accessibilityLabel={t.a11y.filterButton}
          accessibilityRole="button"
        >
          <Feather name="filter" size={14} color={theme.colors.primary} />
        </Pressable>

        <View
          style={[
            styles.searchContainer,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Feather name="search" size={13} color={theme.colors.textSecondary} />
          <TextInput
            style={[
              styles.searchInput,
              { color: theme.colors.text, fontFamily: theme.fonts.regular },
            ]}
            placeholder={t.filterBar.searchPlaceholder}
            placeholderTextColor={theme.colors.textSecondary}
            value={localQuery}
            onChangeText={handleQueryChange}
            returnKeyType="search"
            accessibilityLabel={t.a11y.searchPages}
          />
          {localQuery !== '' && (
            <Pressable
              onPress={handleClearQuery}
              accessibilityLabel={t.a11y.clearSearch}
              accessibilityRole="button"
            >
              <Feather name="x" size={13} color={theme.colors.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* Date filters */}
        <Pressable
          style={[
            styles.dateBtn,
            {
              backgroundColor: filter.dateStart ? theme.colors.primary : theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={() => {
            if (Platform.OS === 'web' && dateStartRef.current) {
              dateStartRef.current.showPicker();
            } else {
              setShowDateStart(true);
            }
          }}
        >
          <Feather
            name="calendar"
            size={13}
            color={filter.dateStart ? '#fff' : theme.colors.textSecondary}
          />
          <Text
            style={[
              styles.dateLabel,
              {
                color: filter.dateStart ? '#fff' : theme.colors.textSecondary,
                fontFamily: theme.fonts.light,
              },
            ]}
          >
            {formatDate(filter.dateStart) ?? t.filterBar.from}
          </Text>
          {filter.dateStart && (
            <Pressable hitSlop={8} onPress={() => onSetDateStart(undefined)}>
              <Feather name="x" size={10} color="#fff" />
            </Pressable>
          )}
        </Pressable>

        <Pressable
          style={[
            styles.dateBtn,
            {
              backgroundColor: filter.dateEnd ? theme.colors.primary : theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={() => {
            if (Platform.OS === 'web' && dateEndRef.current) {
              dateEndRef.current.showPicker();
            } else {
              setShowDateEnd(true);
            }
          }}
        >
          <Feather
            name="calendar"
            size={13}
            color={filter.dateEnd ? '#fff' : theme.colors.textSecondary}
          />
          <Text
            style={[
              styles.dateLabel,
              {
                color: filter.dateEnd ? '#fff' : theme.colors.textSecondary,
                fontFamily: theme.fonts.light,
              },
            ]}
          >
            {formatDate(filter.dateEnd) ?? t.filterBar.to}
          </Text>
          {filter.dateEnd && (
            <Pressable hitSlop={8} onPress={() => onSetDateEnd(undefined)}>
              <Feather name="x" size={10} color="#fff" />
            </Pressable>
          )}
        </Pressable>

        {isActive && (
          <Pressable
            style={[styles.clearBtn, { backgroundColor: theme.colors.error }]}
            onPress={onClearFilters}
          >
            <Feather name="x" size={14} color="#fff" />
          </Pressable>
        )}
      </View>

      {/* Active filter badges row — only shown when property/tag filters are active */}
      {(filter.properties.hasImage ||
        filter.properties.hasFile ||
        filter.properties.hasLocation ||
        filter.properties.tags.length > 0) && (
        <View style={styles.badgeRow}>
          {filter.properties.hasImage && (
            <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
              <Feather name="image" size={11} color="#fff" />
            </View>
          )}
          {filter.properties.hasFile && (
            <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
              <Feather name="paperclip" size={11} color="#fff" />
            </View>
          )}
          {filter.properties.hasLocation && (
            <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
              <Feather name="map-pin" size={11} color="#fff" />
            </View>
          )}
          {filter.properties.tags.length > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.colors.tag.active }]}>
              <Text style={[styles.badgeText, { fontFamily: theme.fonts.bold }]}>
                {filter.properties.tags.length} tag{filter.properties.tags.length > 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {Platform.OS === 'web' && (
        <>
          <input
            ref={dateStartRef}
            type="date"
            value={filter.dateStart ? new Date(filter.dateStart).toISOString().slice(0, 10) : ''}
            onChange={(e) => {
              if (e.target.value) onSetDateStart(new Date(e.target.value).toISOString());
            }}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          />
          <input
            ref={dateEndRef}
            type="date"
            value={filter.dateEnd ? new Date(filter.dateEnd).toISOString().slice(0, 10) : ''}
            onChange={(e) => {
              if (e.target.value) onSetDateEnd(new Date(e.target.value).toISOString());
            }}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          />
        </>
      )}

      {Platform.OS !== 'web' && showDateStart && DateTimePicker && (
        <DateTimePicker
          value={filter.dateStart ? new Date(filter.dateStart) : new Date()}
          mode="date"
          display="calendar"
          onChange={(_e: unknown, date?: Date) => {
            setShowDateStart(false);
            if (date) onSetDateStart(date.toISOString());
          }}
        />
      )}

      {Platform.OS !== 'web' && showDateEnd && DateTimePicker && (
        <DateTimePicker
          value={filter.dateEnd ? new Date(filter.dateEnd) : new Date()}
          mode="date"
          display="calendar"
          onChange={(_e: unknown, date?: Date) => {
            setShowDateEnd(false);
            if (date) onSetDateEnd(date.toISOString());
          }}
        />
      )}

      <FilterModal
        visible={showFilterModal}
        filter={filter}
        availableTags={availableTags}
        onToggleProperty={onToggleProperty}
        onToggleTag={onToggleTag}
        onClose={() => setShowFilterModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 5,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  filterBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    borderRadius: 7,
    paddingHorizontal: 6,
    gap: 5,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  dateBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
  },
  dateLabel: {
    fontSize: 10,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 5,
    paddingLeft: 33,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
  },
});
