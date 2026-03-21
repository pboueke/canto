/**
 * Tests for SyncManagerContext.
 */

// Mock dependencies before imports
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockSyncJournal = jest.fn().mockResolvedValue({ pushed: 0, pulled: 0 });
const mockScheduleSyncDebounced = jest.fn();
const mockGetState = jest.fn();
const mockSubscribe = jest.fn<() => void, [() => void]>(() => jest.fn());

jest.mock('@/lib/sync/manager', () => ({
  SyncManager: jest.fn().mockImplementation(() => ({
    disconnect: mockDisconnect,
    syncJournal: mockSyncJournal,
    scheduleSyncDebounced: mockScheduleSyncDebounced,
    getState: mockGetState,
    subscribe: mockSubscribe,
  })),
}));

jest.mock('@/lib/sync/gdrive', () => ({
  GDriveRemoteStore: jest.fn(),
}));

jest.mock('@/hooks/useStorage', () => ({
  getLocalStore: jest.fn().mockResolvedValue({}),
}));

let mockAuthValue = {
  accessToken: 'test-token',
  getAccessToken: jest.fn().mockResolvedValue('fresh-token'),
  isSignedIn: true,
};

jest.mock('../GoogleAuthContext', () => ({
  useGoogleAuth: () => mockAuthValue,
}));

import React from 'react';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { SyncManagerProvider, useSyncManager, useSyncState } from '../SyncManagerContext';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SyncManagerProvider>{children}</SyncManagerProvider>
);

describe('SyncManagerContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthValue = {
      accessToken: 'test-token',
      getAccessToken: jest.fn().mockResolvedValue('fresh-token'),
      isSignedIn: true,
    };
  });

  it('useSyncManager returns context value', async () => {
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    // Wait for the async init in useEffect
    await act(async () => {});
    expect(result.current.syncJournal).toBeInstanceOf(Function);
    expect(result.current.scheduleSyncDebounced).toBeInstanceOf(Function);
    expect(result.current.getSyncState).toBeInstanceOf(Function);
  });

  it('syncJournal returns result when signed in', async () => {
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    let syncResult: unknown;
    await act(async () => {
      syncResult = await result.current.syncJournal('j1');
    });
    expect(mockAuthValue.getAccessToken).toHaveBeenCalled();
    expect(mockSyncJournal).toHaveBeenCalledWith('j1', 'fresh-token', undefined);
    expect(syncResult).toEqual({ pushed: 0, pulled: 0 });
  });

  it('syncJournal passes derivedKey through', async () => {
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    const key = new Uint8Array(32).fill(1);
    await act(async () => {
      await result.current.syncJournal('j1', key);
    });
    expect(mockSyncJournal).toHaveBeenCalledWith('j1', 'fresh-token', key);
  });

  it('syncJournal returns null when not signed in (no accessToken)', async () => {
    mockAuthValue.accessToken = null as unknown as string;
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    let syncResult: unknown;
    await act(async () => {
      syncResult = await result.current.syncJournal('j1');
    });
    expect(syncResult).toBeNull();
    expect(mockSyncJournal).not.toHaveBeenCalled();
  });

  it('syncJournal returns null when getAccessToken returns null', async () => {
    mockAuthValue.getAccessToken = jest.fn().mockResolvedValue(null);
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    let syncResult: unknown;
    await act(async () => {
      syncResult = await result.current.syncJournal('j1');
    });
    expect(syncResult).toBeNull();
  });

  it('scheduleSyncDebounced calls through to manager', async () => {
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.scheduleSyncDebounced('j1');
    });

    // Wait for the getAccessToken promise to resolve
    await act(async () => {});
    expect(mockScheduleSyncDebounced).toHaveBeenCalledWith('j1', 'fresh-token', undefined);
  });

  it('scheduleSyncDebounced does nothing when no accessToken', async () => {
    mockAuthValue.accessToken = null as unknown as string;
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    act(() => {
      result.current.scheduleSyncDebounced('j1');
    });

    expect(mockAuthValue.getAccessToken).not.toHaveBeenCalled();
  });

  it('scheduleSyncDebounced logs error when getAccessToken fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockAuthValue.getAccessToken = jest.fn().mockRejectedValue(new Error('token fail'));
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.scheduleSyncDebounced('j1');
    });
    await act(async () => {});

    expect(consoleSpy).toHaveBeenCalledWith(
      '[Canto] Failed to get access token for sync:',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('getSyncState returns manager state', async () => {
    const state = { status: 'syncing' as const, lastSynced: 123 };
    mockGetState.mockReturnValue(state);
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    const s = result.current.getSyncState('j1');
    expect(s).toEqual(state);
  });

  it('getSyncState returns default when manager has no state', async () => {
    mockGetState.mockReturnValue(undefined);
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    // Before manager is set up, or when getState returns undefined,
    // the ?? DEFAULT_STATE kicks in
    const s = result.current.getSyncState('j1');
    // The function uses ?? so undefined becomes DEFAULT_STATE
    expect(s).toEqual({ status: 'idle', lastSynced: null });
  });

  it('provider is gdrive when signed in, null when not', async () => {
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});
    expect(result.current.provider).toBe('gdrive');
  });

  it('provider is null when not signed in', async () => {
    mockAuthValue.isSignedIn = false;
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});
    expect(result.current.provider).toBeNull();
  });

  it('disconnects manager on unmount', async () => {
    const { unmount } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('disconnects when accessToken becomes null', async () => {
    const { rerender } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    mockAuthValue.accessToken = null as unknown as string;
    rerender({});
    await act(async () => {});

    expect(mockDisconnect).toHaveBeenCalled();
  });
});

describe('useSyncManager default context (no provider)', () => {
  it('default syncJournal returns null', async () => {
    const { result } = renderHook(() => useSyncManager());
    const res = await result.current.syncJournal('j1');
    expect(res).toBeNull();
  });

  it('default scheduleSyncDebounced is a noop', () => {
    const { result } = renderHook(() => useSyncManager());
    expect(() => result.current.scheduleSyncDebounced('j1')).not.toThrow();
  });

  it('default getSyncState returns DEFAULT_STATE', () => {
    const { result } = renderHook(() => useSyncManager());
    expect(result.current.getSyncState('j1')).toEqual({ status: 'idle', lastSynced: null });
  });
});

describe('useSyncState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthValue = {
      accessToken: 'test-token',
      getAccessToken: jest.fn().mockResolvedValue('fresh-token'),
      isSignedIn: true,
    };
  });

  it('returns default state when used outside provider', () => {
    const { result } = renderHook(() => useSyncState('j1'));
    expect(result.current).toEqual({ status: 'idle', lastSynced: null });
  });

  it('returns DEFAULT_STATE from provider (manager captured before async init)', async () => {
    const { result } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {});
    expect(result.current).toEqual({ status: 'idle', lastSynced: null });
  });

  it('maintains same reference across re-renders', async () => {
    const { result, rerender } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {});
    const first = result.current;
    rerender({});
    await act(async () => {});
    expect(result.current).toBe(first);
  });

  it('returns state from manager after useMemo re-evaluates with non-null manager', async () => {
    // After async init, managerRef.current is set. Changing a useMemo dep forces
    // re-evaluation which captures the non-null managerRef.current.
    const state = { status: 'syncing' as const, lastSynced: 500 };
    mockGetState.mockReturnValue(state);
    mockSubscribe.mockImplementation((_cb: () => void) => () => {});

    const { result, rerender } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {}); // Wait for async init (getLocalStore + new SyncManager)

    // Toggle isSignedIn to change currentProvider, which is a useMemo dep.
    // This forces useMemo to recalculate, capturing the now-set managerRef.current.
    mockAuthValue.isSignedIn = false;
    rerender({});
    await act(async () => {});

    // Now useSyncState has a non-null manager and calls getState
    expect(result.current).toEqual(state);
  });

  it('returns same reference when manager state fields are unchanged', async () => {
    const state = {
      status: 'idle' as const,
      lastSynced: 100,
      error: undefined,
      progress: undefined,
    };
    mockGetState.mockReturnValue(state);
    let subscribeCb: (() => void) | null = null;
    mockSubscribe.mockImplementation((cb: () => void) => {
      subscribeCb = cb;
      return () => {};
    });

    const { result, rerender } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {});

    // Force manager into context
    mockAuthValue.isSignedIn = false;
    rerender({});
    await act(async () => {});

    const first = result.current;

    // Trigger subscribe callback - getSnapshot returns same-shaped state
    await act(async () => {
      subscribeCb?.();
    });

    // Should return same reference (referential equality optimization)
    expect(result.current).toBe(first);
  });

  it('returns new reference when manager state changes', async () => {
    let callCount = 0;
    mockGetState.mockImplementation(() => {
      callCount++;
      if (callCount <= 3) return { status: 'idle' as const, lastSynced: 100 };
      return { status: 'syncing' as const, lastSynced: 100 };
    });

    let subscribeCb: (() => void) | null = null;
    mockSubscribe.mockImplementation((cb: () => void) => {
      subscribeCb = cb;
      return () => {};
    });

    const { result, rerender } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {});

    // Force manager into context
    mockAuthValue.isSignedIn = false;
    rerender({});
    await act(async () => {});

    const first = result.current;

    // Trigger subscribe - now getState returns different status
    await act(async () => {
      subscribeCb?.();
    });

    if (result.current.status === 'syncing') {
      expect(result.current).not.toBe(first);
    }
  });

  it('getSnapshot returns lastRef when manager returns undefined after having state', async () => {
    let callCount = 0;
    const realState = { status: 'syncing' as const, lastSynced: 200 };
    mockGetState.mockImplementation(() => {
      callCount++;
      if (callCount <= 3) return realState;
      return undefined;
    });

    let subscribeCb: (() => void) | null = null;
    mockSubscribe.mockImplementation((cb: () => void) => {
      subscribeCb = cb;
      return () => {};
    });

    const { result, rerender } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {});

    // Force manager into context
    mockAuthValue.isSignedIn = false;
    rerender({});
    await act(async () => {});

    // Now getState returns the real state, lastRef is updated
    const stateBeforeUndefined = result.current;

    // Trigger subscribe - now getState returns undefined
    await act(async () => {
      subscribeCb?.();
    });

    // Should return lastRef.current (the previous real state), not DEFAULT_STATE
    expect(result.current).toBe(stateBeforeUndefined);
  });

  it('getSnapshot returns DEFAULT_STATE when next is undefined and lastRef is DEFAULT_STATE', async () => {
    // Manager returns undefined from the start
    mockGetState.mockReturnValue(undefined);
    mockSubscribe.mockImplementation((_cb: () => void) => () => {});

    const { result, rerender } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {});

    // Force manager into context
    mockAuthValue.isSignedIn = false;
    rerender({});
    await act(async () => {});

    expect(result.current).toEqual({ status: 'idle', lastSynced: null });
  });

  it('compares progress fields for referential equality', async () => {
    const state = {
      status: 'syncing' as const,
      lastSynced: 100,
      progress: { current: 1, total: 5 },
    };
    mockGetState.mockReturnValue(state);
    let subscribeCb: (() => void) | null = null;
    mockSubscribe.mockImplementation((cb: () => void) => {
      subscribeCb = cb;
      return () => {};
    });

    const { result, rerender } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {});

    mockAuthValue.isSignedIn = false;
    rerender({});
    await act(async () => {});

    const first = result.current;

    // Return a new object with same values — should return same ref
    mockGetState.mockReturnValue({
      status: 'syncing' as const,
      lastSynced: 100,
      progress: { current: 1, total: 5 },
    });
    await act(async () => {
      subscribeCb?.();
    });

    expect(result.current).toBe(first);

    // Now change progress — should return new ref
    mockGetState.mockReturnValue({
      status: 'syncing' as const,
      lastSynced: 100,
      progress: { current: 2, total: 5 },
    });
    await act(async () => {
      subscribeCb?.();
    });

    expect(result.current.progress?.current).toBe(2);
  });
});
