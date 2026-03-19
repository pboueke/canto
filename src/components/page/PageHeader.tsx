import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '@/hooks/useTheme';
import { BackButton } from '@/components/common/BackButton';

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
        <Pressable onPress={() => setShowDatePicker(true)}>{dateContent}</Pressable>
      ) : (
        dateContent
      )}

      {isEditing && onDateChange ? (
        <Pressable onPress={() => setShowTimePicker(true)}>{timeContent}</Pressable>
      ) : (
        timeContent
      )}

      {showDatePicker && (
        <DateTimePicker value={currentDate} mode="date" onChange={handleDateChange} />
      )}
      {showTimePicker && (
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
