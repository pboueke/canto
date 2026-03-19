import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { BackButton } from '@/components/common/BackButton';
import type { Journal } from '@/models';
import type { SyncStatus } from '@/lib/sync/manager';

interface JournalHeaderProps {
  journal: Journal;
  onPressSettings?: () => void;
  onPressExport?: () => void;
  onPressSync?: () => void;
  syncStatus?: SyncStatus;
  isSyncEnabled?: boolean;
  hasUnsyncedChanges?: boolean;
}

const UNSYNCED_COLOR = '#F59E0B'; // amber/orange
const SYNCED_COLOR = '#22C55E'; // green

function SyncDot({
  status,
  isSyncEnabled,
  hasUnsyncedChanges,
}: {
  status: SyncStatus;
  isSyncEnabled: boolean;
  hasUnsyncedChanges: boolean;
}) {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status === 'syncing') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: -1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      shakeAnim.setValue(0);
    }
  }, [status, shakeAnim]);

  if (!isSyncEnabled) return null;

  const dotColor =
    status === 'syncing' || status === 'error' || hasUnsyncedChanges
      ? UNSYNCED_COLOR
      : SYNCED_COLOR;

  const translateX = shakeAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-1.5, 0, 1.5],
  });

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          backgroundColor: dotColor,
          transform: [{ translateX }],
        },
      ]}
    />
  );
}

export function JournalHeader({
  journal,
  onPressSettings,
  onPressExport,
  onPressSync,
  syncStatus = 'idle',
  isSyncEnabled = false,
  hasUnsyncedChanges = false,
}: JournalHeaderProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

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
      <BackButton />
      <Feather
        name={(journal.icon || 'book') as React.ComponentProps<typeof Feather>['name']}
        size={22}
        color={theme.colors.text}
      />
      <Text
        style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
        numberOfLines={1}
      >
        {journal.title}
      </Text>
      <View style={styles.actions}>
        <Pressable onPress={onPressSync} style={styles.actionButton}>
          <View>
            <Feather
              name="cloud"
              size={20}
              color={syncStatus === 'syncing' ? theme.colors.primary : theme.colors.text}
            />
            <SyncDot
              status={syncStatus}
              isSyncEnabled={isSyncEnabled}
              hasUnsyncedChanges={hasUnsyncedChanges}
            />
          </View>
        </Pressable>
        <Pressable onPress={onPressExport} style={styles.actionButton}>
          <Feather name="archive" size={20} color={theme.colors.text} />
        </Pressable>
        <Pressable onPress={onPressSettings} style={styles.actionButton}>
          <Feather name="settings" size={20} color={theme.colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 10,
    gap: 10,
  },
  title: {
    fontSize: 20,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 15,
  },
  actionButton: {
    padding: 4,
  },
  dot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
