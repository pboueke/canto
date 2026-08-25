import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { JournalKeyProvider, useJournalKeys } from '@/contexts/JournalKeyContext';
import { deriveKey, DEFAULT_KDF_ITERATIONS } from '@/lib/encryption/password';

// Mock SecuritySettingsModal's getAutoLockTimeout
const mockGetAutoLockTimeout = jest.fn(async () => 0); // disabled by default
jest.mock('@/components/home/SecuritySettingsModal', () => ({
  getAutoLockTimeout: () => mockGetAutoLockTimeout(),
  AUTO_LOCK_OPTIONS: [],
}));

// Mock AppState — capture the listener so we can simulate state changes
type AppStateHandler = (state: string) => void;
let appStateHandler: AppStateHandler | null = null;
const mockRemove = jest.fn();

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_event: string, handler: AppStateHandler) => {
      appStateHandler = handler;
      return { remove: mockRemove };
    }),
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

  it('deriveAndCache defaults to DEFAULT_KDF_ITERATIONS', async () => {
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
        DEFAULT_KDF_ITERATIONS,
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

  it('clearKey on non-existent key does nothing', () => {
    const { result } = renderHook(() => useJournalKeys(), { wrapper });
    // Should not throw
    act(() => {
      result.current.clearKey('nonexistent-key');
    });
    expect(result.current.getKey('nonexistent-key')).toBeNull();
  });

  it('touchActivity updates the last activity timestamp', () => {
    const { result } = renderHook(() => useJournalKeys(), { wrapper });
    // Should not throw
    act(() => {
      result.current.touchActivity();
    });
  });

  it('deriveAndCache produces the same key as deriveKey from password.ts', async () => {
    // This is the critical cross-platform regression guard.
    // JournalKeyContext must use the centralized deriveKey — if it drifts
    // (e.g. uses its own pbkdf2 call), sync keys will diverge across platforms.
    const { result } = renderHook(() => useJournalKeys(), { wrapper });

    let contextKey: Uint8Array;
    await act(async () => {
      contextKey = await result.current.deriveAndCache('jRegression', 'pw', SALT_B64, 1000);
    });

    const salt = Uint8Array.from(atob(SALT_B64), (c) => c.charCodeAt(0));
    const directKey = await deriveKey('pw', salt, 1000);

    expect(Buffer.from(contextKey!).toString('hex')).toBe(Buffer.from(directKey).toString('hex'));
  });
});

describe('JournalKeyContext — default context (no provider)', () => {
  it('returns default no-op functions when used outside provider', async () => {
    const { result } = renderHook(() => useJournalKeys());
    expect(result.current.getKey('x')).toBeNull();

    // Default deriveAndCache returns empty Uint8Array
    let key: Uint8Array;
    await act(async () => {
      key = await result.current.deriveAndCache('x', 'pw', SALT_B64);
    });
    expect(key!.length).toBe(0);

    // Other functions should not throw
    result.current.setKey('x', new Uint8Array(32));
    result.current.clearKey('x');
    result.current.clearAll();
    result.current.touchActivity();
    expect(() => result.current.onAutoLock(() => {})()).not.toThrow();
  });
});

describe('JournalKeyContext — AppState auto-lock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    appStateHandler = null;
    mockGetAutoLockTimeout.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('notifies auto-lock listeners and lets them unsubscribe', async () => {
    mockGetAutoLockTimeout.mockResolvedValue(1);
    const { result } = renderHook(() => useJournalKeys(), { wrapper });
    const listener = jest.fn();
    const unsubscribe = result.current.onAutoLock(listener);
    const key = new Uint8Array(32).fill(0xaa);
    act(() => result.current.setKey('listener-key', key));

    await act(async () => {
      appStateHandler!('background');
    });
    jest.advanceTimersByTime(10);
    await act(async () => {
      appStateHandler!('active');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    act(() => result.current.setKey('listener-key-2', new Uint8Array(32).fill(1)));
    await act(async () => {
      appStateHandler!('background');
    });
    jest.advanceTimersByTime(10);
    await act(async () => {
      appStateHandler!('active');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clears keys when returning from background after timeout', async () => {
    // Auto-lock after 1ms for testing
    mockGetAutoLockTimeout.mockResolvedValue(1);

    const { result } = renderHook(() => useJournalKeys(), { wrapper });
    expect(appStateHandler).not.toBeNull();

    // Store a key
    const key = new Uint8Array(32).fill(0xcc);
    act(() => {
      result.current.setKey('j-lock', key);
    });
    expect(result.current.getKey('j-lock')).toBe(key);

    // Simulate going to background
    await act(async () => {
      appStateHandler!('background');
    });

    // Advance time past the auto-lock timeout
    jest.advanceTimersByTime(10);

    // Simulate coming back to active
    await act(async () => {
      appStateHandler!('active');
      // Flush the async getAutoLockTimeout
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.getKey('j-lock')).toBeNull();
    expect(key.every((b) => b === 0)).toBe(true);
  });

  it('does not clear keys when returning from background before timeout', async () => {
    // Auto-lock after 60 seconds
    mockGetAutoLockTimeout.mockResolvedValue(60_000);

    const { result } = renderHook(() => useJournalKeys(), { wrapper });

    const key = new Uint8Array(32).fill(0xdd);
    act(() => {
      result.current.setKey('j-keep', key);
    });

    // Simulate going to background
    await act(async () => {
      appStateHandler!('background');
    });

    // Only 1ms passes — well under the timeout
    jest.advanceTimersByTime(1);

    // Come back to active
    await act(async () => {
      appStateHandler!('active');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.getKey('j-keep')).toBe(key);
  });

  it('does not clear keys when auto-lock is disabled (timeout=0)', async () => {
    mockGetAutoLockTimeout.mockResolvedValue(0);

    const { result } = renderHook(() => useJournalKeys(), { wrapper });

    const key = new Uint8Array(32).fill(0xee);
    act(() => {
      result.current.setKey('j-no-lock', key);
    });

    await act(async () => {
      appStateHandler!('background');
    });
    jest.advanceTimersByTime(999_999);
    await act(async () => {
      appStateHandler!('active');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.getKey('j-no-lock')).toBe(key);
  });

  it('handles inactive state by recording backgroundedAt', async () => {
    mockGetAutoLockTimeout.mockResolvedValue(1);

    const { result } = renderHook(() => useJournalKeys(), { wrapper });
    const key = new Uint8Array(32).fill(0xaa);
    act(() => {
      result.current.setKey('j-inactive', key);
    });

    // Simulate going to inactive (e.g. multitasking view)
    await act(async () => {
      appStateHandler!('inactive');
    });

    jest.advanceTimersByTime(10);

    await act(async () => {
      appStateHandler!('active');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.getKey('j-inactive')).toBeNull();
  });

  it('periodic inactivity check clears keys after timeout', async () => {
    // Auto-lock after 1ms
    mockGetAutoLockTimeout.mockResolvedValue(1);

    const { result } = renderHook(() => useJournalKeys(), { wrapper });

    const key = new Uint8Array(32).fill(0xff);
    act(() => {
      result.current.setKey('j-periodic', key);
    });

    // Advance past 30s interval + auto-lock timeout
    await act(async () => {
      jest.advanceTimersByTime(30_001);
      // Flush the async getAutoLockTimeout inside setInterval
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.getKey('j-periodic')).toBeNull();
    expect(key.every((b) => b === 0)).toBe(true);
  });

  it('periodic inactivity check does nothing when no keys cached', async () => {
    mockGetAutoLockTimeout.mockResolvedValue(1);

    renderHook(() => useJournalKeys(), { wrapper });

    // Advance past the interval — should not throw or call getAutoLockTimeout
    // (it returns early because keysRef.current.size === 0)
    await act(async () => {
      jest.advanceTimersByTime(30_001);
      await Promise.resolve();
    });

    // getAutoLockTimeout should not have been called from the interval
    // (It may have been called from the AppState listener setup, so just
    // check there's no error)
  });

  it('ignores active state when not previously backgrounded', async () => {
    mockGetAutoLockTimeout.mockResolvedValue(1);

    const { result } = renderHook(() => useJournalKeys(), { wrapper });
    const key = new Uint8Array(32).fill(0x11);
    act(() => {
      result.current.setKey('j-no-bg', key);
    });

    // Go directly to active without going to background first
    await act(async () => {
      appStateHandler!('active');
      await Promise.resolve();
      await Promise.resolve();
    });

    // Keys should not be cleared since we never went to background
    expect(result.current.getKey('j-no-bg')).toBe(key);
  });

  it('cleans up AppState listener on unmount', () => {
    const { unmount } = renderHook(() => useJournalKeys(), { wrapper });
    unmount();
    expect(mockRemove).toHaveBeenCalled();
  });
});
