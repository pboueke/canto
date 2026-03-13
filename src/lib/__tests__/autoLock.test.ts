/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAutoLockTimeout, AUTO_LOCK_OPTIONS } from '@/components/home/SecuritySettingsModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTO_LOCK_KEY = 'canto_auto_lock_timeout';

describe('getAutoLockTimeout', () => {
  beforeEach(() => {
    (globalThis as any).__asyncStoreClear();
  });

  it('returns default 300_000 when no stored value', async () => {
    expect(await getAutoLockTimeout()).toBe(300_000);
  });

  it('reads stored value', async () => {
    await AsyncStorage.setItem(AUTO_LOCK_KEY, '60000');
    expect(await getAutoLockTimeout()).toBe(60_000);
  });

  it('returns default when NaN stored', async () => {
    await AsyncStorage.setItem(AUTO_LOCK_KEY, 'not-a-number');
    expect(await getAutoLockTimeout()).toBe(300_000);
  });

  it('returns 0 when disabled', async () => {
    await AsyncStorage.setItem(AUTO_LOCK_KEY, '0');
    expect(await getAutoLockTimeout()).toBe(0);
  });
});

describe('AUTO_LOCK_OPTIONS', () => {
  it('has 4 entries', () => {
    expect(AUTO_LOCK_OPTIONS).toHaveLength(4);
  });

  it('contains 1m, 5m, 15m, off values', () => {
    const values = AUTO_LOCK_OPTIONS.map((o) => o.value);
    expect(values).toEqual([60_000, 300_000, 900_000, 0]);
  });

  it('has unique labels', () => {
    const labels = AUTO_LOCK_OPTIONS.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
