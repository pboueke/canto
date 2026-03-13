import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import type { Filter } from '@/models';
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
  const [showDateStart, setShowDateStart] = useState(false);
  const [showDateEnd, setShowDateEnd] = useState(false);

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
            value={filter.query}
            onChangeText={onSetQuery}
            returnKeyType="search"
          />
          {filter.query !== '' && (
            <Pressable onPress={() => onSetQuery('')}>
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
          onPress={() => setShowDateStart(true)}
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
          onPress={() => setShowDateEnd(true)}
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

      {showDateStart && (
        <DateTimePicker
          value={filter.dateStart ? new Date(filter.dateStart) : new Date()}
          mode="date"
          display="calendar"
          onChange={(_e, date) => {
            setShowDateStart(false);
            if (date) onSetDateStart(date.toISOString());
          }}
        />
      )}

      {showDateEnd && (
        <DateTimePicker
          value={filter.dateEnd ? new Date(filter.dateEnd) : new Date()}
          mode="date"
          display="calendar"
          onChange={(_e, date) => {
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
