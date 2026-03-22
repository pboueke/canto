import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { BackButton } from '@/components/common/BackButton';

// Only import native DateTimePicker on non-web platforms
const DateTimePicker =
  Platform.OS !== 'web' ? require('@react-native-community/datetimepicker').default : null;
type DateTimePickerEvent = { type: string; nativeEvent: { timestamp: number } };

interface PageHeaderProps {
  date: string;
  time: string;
  dateValue?: Date;
  isEditing?: boolean;
  onDateChange?: (date: Date) => void;
  onBack?: () => void;
}

export function PageHeader({
  date,
  time,
  dateValue,
  isEditing,
  onDateChange,
  onBack,
}: PageHeaderProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  const currentDate = dateValue ?? new Date();

  const handleDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate && onDateChange) {
      const merged = new Date(currentDate);
      merged.setFullYear(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
      );
      onDateChange(merged);
    }
  };

  const handleTimeChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedDate && onDateChange) {
      const merged = new Date(currentDate);
      merged.setHours(selectedDate.getHours(), selectedDate.getMinutes());
      onDateChange(merged);
    }
  };

  const dateContent = (
    <View style={styles.dateSection}>
      <Feather name="calendar" size={16} color={theme.colors.text} />
      <Text
        style={[styles.dateText, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}
      >
        {date}
      </Text>
      {isEditing && <Feather name="edit-3" size={12} color={theme.colors.textSecondary} />}
    </View>
  );

  const timeContent = (
    <View style={styles.timeSection}>
      <Feather name="clock" size={16} color={theme.colors.text} />
      <Text
        style={[styles.timeText, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}
      >
        {time}
      </Text>
      {isEditing && <Feather name="edit-3" size={12} color={theme.colors.textSecondary} />}
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.headerBackground,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: theme.borderWidth,
          paddingTop: insets.top + 5,
        },
      ]}
    >
      <BackButton onBack={onBack} />

      {isEditing && onDateChange ? (
        <Pressable
          onPress={() => {
            if (Platform.OS === 'web' && dateInputRef.current) {
              dateInputRef.current.showPicker();
            } else {
              setShowDatePicker(true);
            }
          }}
        >
          {dateContent}
        </Pressable>
      ) : (
        dateContent
      )}

      {isEditing && onDateChange ? (
        <Pressable
          onPress={() => {
            if (Platform.OS === 'web' && timeInputRef.current) {
              timeInputRef.current.showPicker();
            } else {
              setShowTimePicker(true);
            }
          }}
        >
          {timeContent}
        </Pressable>
      ) : (
        timeContent
      )}

      {Platform.OS === 'web' && isEditing && onDateChange && (
        <>
          <input
            ref={dateInputRef}
            type="date"
            value={currentDate.toISOString().slice(0, 10)}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              const [y, m, d] = val.split('-').map(Number);
              const merged = new Date(currentDate);
              merged.setFullYear(y, m - 1, d);
              onDateChange(merged);
            }}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          />
          <input
            ref={timeInputRef}
            type="time"
            value={`${String(currentDate.getHours()).padStart(2, '0')}:${String(currentDate.getMinutes()).padStart(2, '0')}`}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              const [h, min] = val.split(':').map(Number);
              const merged = new Date(currentDate);
              merged.setHours(h, min);
              onDateChange(merged);
            }}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          />
        </>
      )}

      {Platform.OS !== 'web' && showDatePicker && DateTimePicker && (
        <DateTimePicker value={currentDate} mode="date" onChange={handleDateChange} />
      )}
      {Platform.OS !== 'web' && showTimePicker && DateTimePicker && (
        <DateTimePicker value={currentDate} mode="time" onChange={handleTimeChange} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: undefined,
    paddingHorizontal: 15,
    paddingBottom: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  dateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 20,
  },
  timeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 15,
  },
  timeText: {
    fontSize: 15,
  },
});
