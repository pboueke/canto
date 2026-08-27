/**
 * Tests for SyncManagerContext.
 */

// Mock dependencies before imports
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockDispose = jest.fn();
const mockRunJournalSync = jest.fn().mockResolvedValue({ kind: 'completed', result: {} });
const mockScheduleSyncDebounced = jest.fn();
const mockCancelSync = jest.fn();
const mockGetState = jest.fn();
const mockSubscribe = jest.fn<() => void, [() => void]>(() => jest.fn());

jest.mock('@/lib/sync/manager', () => ({
  SyncManager: jest.fn().mockImplementation(() => ({
    disconnect: mockDisconnect,
    dispose: mockDispose,
    runJournalSync: mockRunJournalSync,
    scheduleSyncDebounced: mockScheduleSyncDebounced,
    cancelSync: mockCancelSync,
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
import type { SyncState } from '@/lib/sync/manager';
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
    expect(mockRunJournalSync).toHaveBeenCalledWith(
      'j1',
      'fresh-token',
      undefined,
      expect.any(Function),
    );
    expect(syncResult).toEqual({ kind: 'completed', result: {} });
  });

  it('syncJournal passes derivedKey through', async () => {
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    const key = new Uint8Array(32).fill(1);
    await act(async () => {
      await result.current.syncJournal('j1', key);
    });
    expect(mockRunJournalSync).toHaveBeenCalledWith('j1', 'fresh-token', key, expect.any(Function));
  });

  it('syncJournal returns null when not signed in (no accessToken)', async () => {
    mockAuthValue.accessToken = null as unknown as string;
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    let syncResult: unknown;
    await act(async () => {
      syncResult = await result.current.syncJournal('j1');
    });
    expect(syncResult).toEqual({ kind: 'authentication-required' });
    expect(mockRunJournalSync).not.toHaveBeenCalled();
  });

  it('syncJournal returns null when getAccessToken returns null', async () => {
    mockAuthValue.getAccessToken = jest.fn().mockResolvedValue(null);
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    let syncResult: unknown;
    await act(async () => {
      syncResult = await result.current.syncJournal('j1');
    });
    expect(syncResult).toEqual({ kind: 'authentication-required' });
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

  it('cancels the active journal run through the manager', async () => {
    const { result } = renderHook(() => useSyncManager(), { wrapper });
    await act(async () => {});

    act(() => result.current.cancelSync('j1'));

    expect(mockCancelSync).toHaveBeenCalledWith('j1');
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
  it('default syncJournal reports that the provider is not ready', async () => {
    const { result } = renderHook(() => useSyncManager());
    const res = await result.current.syncJournal('j1');
    expect(res).toEqual({ kind: 'not-ready' });
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

  it('subscribes to the manager after asynchronous provider initialization', async () => {
    const state = { status: 'syncing' as const, lastSynced: 500 };
    mockGetState.mockReturnValue(state);
    mockSubscribe.mockImplementation((_cb: () => void) => () => {});

    const { result } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {});
    expect(result.current).toEqual(state);
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('maintains same reference across re-renders', async () => {
    const { result, rerender } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {});
    const first = result.current;
    rerender({});
    await act(async () => {});
    expect(result.current).toBe(first);
  });

  it('returns state from manager without an unrelated provider re-render', async () => {
    const state = { status: 'syncing' as const, lastSynced: 500 };
    mockGetState.mockReturnValue(state);
    mockSubscribe.mockImplementation((_cb: () => void) => () => {});

    const { result, rerender } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {}); // Wait for async init (getLocalStore + new SyncManager)

    rerender({});
    await act(async () => {});

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
    let state: SyncState = { status: 'idle', lastSynced: 100 };
    mockGetState.mockImplementation(() => state);

    let subscribeCb: (() => void) | null = null;
    mockSubscribe.mockImplementation((cb: () => void) => {
      subscribeCb = cb;
      return () => {};
    });

    const { result } = renderHook(() => useSyncState('j1'), { wrapper });
    await act(async () => {});

    const first = result.current;
    state = { status: 'syncing', lastSynced: 100 };

    await act(async () => {
      subscribeCb?.();
    });

    expect(result.current).toEqual(state);
    expect(result.current).not.toBe(first);
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
