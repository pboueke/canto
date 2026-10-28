import { useState, useEffect } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { getLocalStore } from '@/hooks/useStorage';
import * as deviceKeyCustody from '@/lib/encryption/device';
import { RotationBlockedError } from '@/lib/storage/device-key-rotation';
import { RotationInterruptedError } from '@/lib/storage/integrity';
import { getBlockScreenshots, setBlockScreenshots } from '@/lib/privacy';
import { confirmDestructive, notify } from '@/lib/dialogs';
import type { Dictionary } from '@/i18n/dictionaries';
import { webModalContent } from '@/styles/web';

const AUTO_LOCK_KEY = 'canto_auto_lock_timeout';

export const AUTO_LOCK_OPTIONS = [
  { label: 'autoLock1m' as const, value: 60_000 },
  { label: 'autoLock5m' as const, value: 300_000 },
  { label: 'autoLock15m' as const, value: 900_000 },
  { label: 'autoLockOff' as const, value: 0 },
];

const DEFAULT_AUTO_LOCK = 900_000; // 15 minutes

export async function getAutoLockTimeout(): Promise<number> {
  const raw = await AsyncStorage.getItem(AUTO_LOCK_KEY);
  if (raw === null) return DEFAULT_AUTO_LOCK;
  const val = parseInt(raw, 10);
  return isNaN(val) ? DEFAULT_AUTO_LOCK : val;
}

/**
 * Localized outcome of a failed rotation. Never forwards raw error text, which
 * could carry paths. Blocked rotations changed nothing; an interrupted one
 * keeps both keys and finishes on restart.
 */
export function rotationErrorMessage(t: Dictionary, error: unknown): string {
  if (error instanceof RotationInterruptedError) return t.security.rotateInterrupted;
  if (error instanceof RotationBlockedError) {
    switch (error.reason) {
      case 'UNRECOVERED_DATA':
        return t.security.rotateBlockedUnrecovered;
      case 'UNREADABLE_DATA':
        return t.security.rotateBlockedUnreadable;
      case 'INSUFFICIENT_SPACE':
        return t.security.rotateBlockedSpace;
      case 'ROTATION_PENDING':
        return t.security.rotateBlockedPending;
      case 'UNSUPPORTED_DATA':
        return t.security.rotateBlockedUnsupported;
      case 'OTHER_TABS_OPEN':
        return t.security.rotateBlockedOtherTabs;
    }
  }
  return t.security.rotateFailed;
}

interface SecuritySettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SecuritySettingsModal({ visible, onClose }: SecuritySettingsModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [autoLock, setAutoLock] = useState(DEFAULT_AUTO_LOCK);
  const [blockScreenshots, setBlockScreenshotsState] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    if (visible) {
      getAutoLockTimeout().then(setAutoLock);
      getBlockScreenshots().then(setBlockScreenshotsState);
    }
  }, [visible]);

  async function handleAutoLockChange(value: number) {
    setAutoLock(value);
    await AsyncStorage.setItem(AUTO_LOCK_KEY, String(value));
  }

  async function handleBlockScreenshotsChange(value: boolean) {
    setBlockScreenshotsState(value);
    await setBlockScreenshots(value);
  }

  async function handleRotateKey() {
    confirmDestructive(
      t.security.rotateDeviceKey,
      t.security.rotateWarning,
      { confirm: t.security.rotateConfirm, cancel: t.common.cancel },
      async () => {
        setRotating(true);
        try {
          const store = await getLocalStore();
          if (!store.rotateDeviceKey) throw new Error('Device-key rotation is unavailable');
          // The store owns the whole cutover: it keeps the previous key until
          // the re-encrypted data is applied and verified, and swaps the
          // cached key before any queued write can run.
          await store.rotateDeviceKey(deviceKeyCustody);
          notify(t.security.rotateSuccess);
        } catch (err) {
          notify(t.security.rotateDeviceKey, rotationErrorMessage(t, err));
        } finally {
          setRotating(false);
        }
      },
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
            webModalContent,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
            {t.security.title}
          </Text>

          {rotating ? (
            <View style={styles.busyContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text
                style={[
                  styles.busyText,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.security.rotating}
              </Text>
              <Text
                style={[
                  styles.busyHint,
                  { color: theme.colors.error, fontFamily: theme.fonts.bold },
                ]}
              >
                {t.security.doNotClose}
              </Text>
            </View>
          ) : (
            <>
              {/* Auto-lock timeout */}
              <Text
                style={[
                  styles.sectionLabel,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
                ]}
              >
                {t.security.autoLock}
              </Text>
              <View
                style={[
                  styles.pills,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                {AUTO_LOCK_OPTIONS.map((opt) => {
                  const selected = autoLock === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.pill, selected && { backgroundColor: theme.colors.primary }]}
                      onPress={() => handleAutoLockChange(opt.value)}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          {
                            color: selected ? theme.colors.foreground : theme.colors.text,
                            fontFamily: selected ? theme.fonts.bold : theme.fonts.regular,
                          },
                        ]}
                      >
                        {t.security[opt.label]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Block screenshots */}
              {Platform.OS !== 'web' && (
                <>
                  <View style={styles.switchRow}>
                    <Text
                      style={[
                        styles.switchLabel,
                        { color: theme.colors.text, fontFamily: theme.fonts.regular },
                      ]}
                    >
                      {t.security.blockScreenshots}
                    </Text>
                    <Switch
                      value={blockScreenshots}
                      onValueChange={handleBlockScreenshotsChange}
                      trackColor={{ true: theme.colors.primary }}
                      accessibilityLabel={t.security.blockScreenshots}
                    />
                  </View>
                  <Text
                    style={[
                      styles.rotateExplain,
                      { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                    ]}
                  >
                    {t.security.blockScreenshotsHint}
                  </Text>
                </>
              )}

              {/* Rotate device key */}
              <Text
                style={[
                  styles.sectionLabel,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
                ]}
              >
                {t.security.rotateDeviceKey}
              </Text>
              <Text
                style={[
                  styles.rotateExplain,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.security.rotateExplain}
              </Text>
              <Pressable style={styles.dangerRow} onPress={handleRotateKey}>
                <Feather name="refresh-cw" size={18} color={theme.colors.error} />
                <Text
                  style={[
                    styles.dangerLabel,
                    { color: theme.colors.error, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {t.security.rotateDeviceKey}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.closeBtn, { backgroundColor: theme.colors.highlight }]}
                onPress={onClose}
              >
                <Text
                  style={[
                    styles.closeBtnText,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {t.common.close}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 30,
  },
  content: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  pills: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pillText: {
    fontSize: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginLeft: 4,
  },
  switchLabel: {
    fontSize: 14,
    flex: 1,
  },
  rotateExplain: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
    marginLeft: 4,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    marginBottom: 16,
  },
  dangerLabel: {
    fontSize: 14,
  },
  closeBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
  },
  busyContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 12,
  },
  busyText: {
    fontSize: 14,
  },
  busyHint: {
    fontSize: 12,
  },
});
