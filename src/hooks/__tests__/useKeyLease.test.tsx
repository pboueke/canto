import React, { useState } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { JournalKeyProvider, useJournalKeys, type KeyLease } from '@/contexts/JournalKeyContext';
import { useKeyLease } from '@/hooks/useKeyLease';

const mockPurgeAttachmentDisplayCache = jest.fn();
const mockPurgeEncryptedAttachmentDisplayCache = jest.fn();
jest.mock('@/lib/attachment-display', () => ({
  purgeAttachmentDisplayCache: () => mockPurgeAttachmentDisplayCache(),
  purgeEncryptedAttachmentDisplayCache: () => mockPurgeEncryptedAttachmentDisplayCache(),
}));

const mockGetAutoLockTimeout = jest.fn(async () => 0);
jest.mock('@/components/home/SecuritySettingsModal', () => ({
  getAutoLockTimeout: () => mockGetAutoLockTimeout(),
  AUTO_LOCK_OPTIONS: [],
}));

type AppStateHandler = (state: string) => void;
let appStateHandler: AppStateHandler | null = null;
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_event: string, handler: AppStateHandler) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(JournalKeyProvider, null, children);
}

interface HarnessValue {
  keys: ReturnType<typeof useJournalKeys>;
  locked: boolean;
  lease: KeyLease | null;
  mountEditor: () => void;
  unmountEditor: () => void;
}
function useHarness(journalId: string): HarnessValue {
  const keys = useJournalKeys();
  // The editor mounts only after navigation (the journal is unlocked then).
  const [editorMounted, setEditorMounted] = useState(false);
  const { locked, lease } = useKeyLease(editorMounted ? journalId : null);
  return {
    keys,
    locked,
    lease,
    mountEditor: () => setEditorMounted(true),
    unmountEditor: () => setEditorMounted(false),
  };
}

describe('useKeyLease', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetAutoLockTimeout.mockReset();
    mockGetAutoLockTimeout.mockResolvedValue(1);
    appStateHandler = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is unlocked while a lease is bound to the current key epoch', async () => {
    const { result } = renderHook(() => useHarness('j1'), { wrapper });
    await act(async () => {});
    expect(result.current.locked).toBe(true);

    // Unlock, then navigate into the editor.
    act(() => result.current.keys.setKey('j1', new Uint8Array(32).fill(7)));
    act(() => result.current.mountEditor());
    await act(async () => {});
    expect(result.current.locked).toBe(false);
    expect(result.current.lease).toMatchObject({ journalId: 'j1' });
  });

  it('is locked when the journal has never been unlocked', async () => {
    const { result } = renderHook(() => useHarness('never-unlocked'), { wrapper });
    await act(async () => {});
    act(() => result.current.mountEditor());
    await act(async () => {});
    expect(result.current.locked).toBe(true);
    expect(result.current.lease).toBeNull();
  });

  it('reacts to an auto-lock revocation and returns to locked state', async () => {
    const { result } = renderHook(() => useHarness('j-live'), { wrapper });
    await act(async () => {});
    act(() => result.current.keys.setKey('j-live', new Uint8Array(32).fill(9)));
    act(() => result.current.mountEditor());
    await act(async () => {});
    expect(result.current.locked).toBe(false);

    // Background beyond the auto-lock threshold, then foreground.
    await act(async () => {
      appStateHandler!('background');
    });
    jest.advanceTimersByTime(10);
    await act(async () => {
      appStateHandler!('active');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.locked).toBe(true);
    expect(result.current.lease).toBeNull();
  });

  it('a fresh mount after re-unlock binds a valid lease again', async () => {
    const { result } = renderHook(() => useHarness('j-re'), { wrapper });
    await act(async () => {});
    act(() => result.current.keys.setKey('j-re', new Uint8Array(32).fill(11)));
    act(() => result.current.mountEditor());
    await act(async () => {});
    expect(result.current.locked).toBe(false);

    // Auto-lock revokes the lease.
    act(() => result.current.keys.clearAll());
    await act(async () => {});
    expect(result.current.locked).toBe(true);

    // User unlocks again and re-enters the editor (fresh mount capturing the
    // new epoch), so the editor is writable once more.
    act(() => result.current.keys.setKey('j-re', new Uint8Array(32).fill(12)));
    act(() => result.current.unmountEditor());
    act(() => result.current.mountEditor());
    await act(async () => {});
    expect(result.current.locked).toBe(false);
  });
});
