import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { JournalKeyProvider, useJournalKeys } from '@/contexts/JournalKeyContext';
import { LEGACY_KDF_ITERATIONS } from '@/lib/encryption/password';

// Mock SecuritySettingsModal's getAutoLockTimeout to avoid AppState side effects
jest.mock('@/components/home/SecuritySettingsModal', () => ({
  getAutoLockTimeout: jest.fn(async () => 0), // disabled
  AUTO_LOCK_OPTIONS: [],
}));

// Mock AppState to prevent side effects
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(JournalKeyProvider, null, children);
}

// Use a fixed base64 salt (16 bytes → base64)
const SALT_B64 = btoa(String.fromCharCode(...new Uint8Array(16).fill(0xab)));

describe('JournalKeyContext', () => {
  it('deriveAndCache returns 32-byte key', async () => {
    const { result } = renderHook(() => useJournalKeys(), { wrapper });

    let key: Uint8Array;
    await act(async () => {
      key = await result.current.deriveAndCache('j1', 'password', SALT_B64, 1000);
    });
    expect(key!.length).toBe(32);
    expect(key!).toBeInstanceOf(Uint8Array);
  });

  it('deriveAndCache caches key — getKey returns same value', async () => {
    const { result } = renderHook(() => useJournalKeys(), { wrapper });

    let derived: Uint8Array;
    await act(async () => {
      derived = await result.current.deriveAndCache('j2', 'password', SALT_B64, 1000);
    });

    const cached = result.current.getKey('j2');
    expect(cached).toBe(derived!);
  });

  it('deriveAndCache defaults to LEGACY_KDF_ITERATIONS', async () => {
    const { result } = renderHook(() => useJournalKeys(), { wrapper });

    let keyDefault: Uint8Array;
    let keyExplicit: Uint8Array;
    await act(async () => {
      keyDefault = await result.current.deriveAndCache('j3a', 'password', SALT_B64);
    });
    await act(async () => {
      keyExplicit = await result.current.deriveAndCache(
        'j3b',
        'password',
        SALT_B64,
        LEGACY_KDF_ITERATIONS,
      );
    });

    expect(Buffer.from(keyDefault!).toString('hex')).toBe(
      Buffer.from(keyExplicit!).toString('hex'),
    );
  });

  it('deriveAndCache with custom iterations differs from default', async () => {
    const { result } = renderHook(() => useJournalKeys(), { wrapper });

    let keyDefault: Uint8Array;
    let keyCustom: Uint8Array;
    await act(async () => {
      keyDefault = await result.current.deriveAndCache('j4a', 'password', SALT_B64);
    });
    await act(async () => {
      keyCustom = await result.current.deriveAndCache('j4b', 'password', SALT_B64, 5000);
    });

    expect(Buffer.from(keyDefault!).toString('hex')).not.toBe(
      Buffer.from(keyCustom!).toString('hex'),
    );
  });

  it('setKey stores key retrievable via getKey', async () => {
    const { result } = renderHook(() => useJournalKeys(), { wrapper });
    const key = new Uint8Array(32).fill(42);

    act(() => {
      result.current.setKey('j5', key);
    });

    expect(result.current.getKey('j5')).toBe(key);
  });

  it('getKey returns null for unknown journalId', () => {
    const { result } = renderHook(() => useJournalKeys(), { wrapper });
    expect(result.current.getKey('nonexistent')).toBeNull();
  });

  it('clearKey zeros and removes key', async () => {
    const { result } = renderHook(() => useJournalKeys(), { wrapper });
    const key = new Uint8Array(32).fill(0xff);

    act(() => {
      result.current.setKey('j6', key);
    });
    expect(result.current.getKey('j6')).toBe(key);

    act(() => {
      result.current.clearKey('j6');
    });
    expect(result.current.getKey('j6')).toBeNull();
    // Key should be zeroed
    expect(key.every((b) => b === 0)).toBe(true);
  });

  it('clearAll zeros all stored keys', async () => {
    const { result } = renderHook(() => useJournalKeys(), { wrapper });
    const k1 = new Uint8Array(32).fill(0xaa);
    const k2 = new Uint8Array(32).fill(0xbb);

    act(() => {
      result.current.setKey('j7a', k1);
      result.current.setKey('j7b', k2);
    });

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.getKey('j7a')).toBeNull();
    expect(result.current.getKey('j7b')).toBeNull();
    expect(k1.every((b) => b === 0)).toBe(true);
    expect(k2.every((b) => b === 0)).toBe(true);
  });
});
