import { useState, useEffect } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { getLocalStore, getEncryptionService } from '@/hooks/useStorage';
import { rotateKey } from '@/lib/encryption/device';
import { aesGcmEncrypt, aesGcmDecrypt } from '@/lib/encryption/utils';

const AUTO_LOCK_KEY = 'canto_auto_lock_timeout';

export const AUTO_LOCK_OPTIONS = [
  { label: 'autoLock1m' as const, value: 60_000 },
  { label: 'autoLock5m' as const, value: 300_000 },
  { label: 'autoLock15m' as const, value: 900_000 },
  { label: 'autoLockOff' as const, value: 0 },
];

const DEFAULT_AUTO_LOCK = 300_000; // 5 minutes

export async function getAutoLockTimeout(): Promise<number> {
  const raw = await AsyncStorage.getItem(AUTO_LOCK_KEY);
  if (raw === null) return DEFAULT_AUTO_LOCK;
  const val = parseInt(raw, 10);
  return isNaN(val) ? DEFAULT_AUTO_LOCK : val;
}

interface SecuritySettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SecuritySettingsModal({ visible, onClose }: SecuritySettingsModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [autoLock, setAutoLock] = useState(DEFAULT_AUTO_LOCK);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    if (visible) {
      getAutoLockTimeout().then(setAutoLock);
    }
  }, [visible]);

  async function handleAutoLockChange(value: number) {
    setAutoLock(value);
    await AsyncStorage.setItem(AUTO_LOCK_KEY, String(value));
  }

  async function handleRotateKey() {
    Alert.alert(t.security.rotateDeviceKey, t.security.rotateWarning, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.security.rotateConfirm,
        style: 'destructive',
        onPress: async () => {
          setRotating(true);
          try {
            const store = await getLocalStore();
            const encryption = getEncryptionService();

            // Grab the SecureStore key BEFORE rotation (may differ from
            // the singleton's cached key if a previous rotation partially
            // failed — re-encrypting the index but not journal data).
            const { oldKey: secureStoreKey, newKey } = await rotateKey();

            // Try the singleton's cached key first (for journal data that
            // was never re-encrypted), fall back to the SecureStore key
            // (for the index or any file that WAS re-encrypted previously).
            const oldDecrypt = async (ciphertext: string) => {
              try {
                return await encryption.decrypt(ciphertext);
              } catch {
                return await aesGcmDecrypt(ciphertext, secureStoreKey);
              }
            };

            const oldEncrypt = (plaintext: string) => aesGcmEncrypt(plaintext, newKey);
            const newEncrypt = (plaintext: string) => aesGcmEncrypt(plaintext, newKey);

            await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);
            // Clear the singleton's cached device key so it picks up the new one
            encryption.clearSession();
            Alert.alert(t.security.rotateSuccess);
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : String(err));
          } finally {
            setRotating(false);
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
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
