/**
 * Tests for the web Google Auth context.
 * expo-auth-session and expo-web-browser are mocked via jest.config.js moduleNameMapper.
 */

jest.mock('../../../google-credentials', () => ({
  GOOGLE_CREDENTIALS: {
    webClientId: 'test-web-client-id.apps.googleusercontent.com',
    androidClientId: 'test-android.apps.googleusercontent.com',
    iosClientId: 'test-ios.apps.googleusercontent.com',
  },
}));

// Override the default useAuthRequest mock so we can control request/response/promptAsync
let mockResponse: unknown = null;
let mockRequest: unknown = null;
let mockPromptAsync: jest.Mock | null = jest.fn().mockResolvedValue({ type: 'dismiss' });

const promptAsync = () => mockPromptAsync!;

jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: () => [mockRequest, mockResponse, mockPromptAsync],
}));

// Mock global fetch for fetchUserInfo
const mockFetch = jest.fn();
Object.defineProperty(global, 'fetch', { value: mockFetch, writable: true });

// Mock localStorage
const storageMap = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => {
    storageMap.set(key, val);
  },
  removeItem: (key: string) => {
    storageMap.delete(key);
  },
  clear: () => {
    storageMap.clear();
  },
  get length() {
    return storageMap.size;
  },
  key: (index: number) => [...storageMap.keys()][index] ?? null,
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

import { renderHook, act } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { GoogleAuthProvider, useGoogleAuth } from '../GoogleAuthContext.web';

const wrapper = ({ children }: { children: ReactNode }) => (
  <GoogleAuthProvider>{children}</GoogleAuthProvider>
);

describe('GoogleAuthContext.web', () => {
  beforeEach(() => {
    storageMap.clear();
    mockResponse = null;
    mockRequest = null;
    mockPromptAsync = jest.fn().mockResolvedValue({ type: 'dismiss' });
    mockFetch.mockReset();
  });

  it('provides null user initially', () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  it('provides null accessToken initially', () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    expect(result.current.accessToken).toBeNull();
  });

  it('isSignedIn is false initially', () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    expect(result.current.isSignedIn).toBe(false);
  });

  it('isLoading starts true then becomes false (no stored session)', async () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isLoading).toBe(false);
  });

  it('getAccessToken returns null when not signed in', async () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    const token = await result.current.getAccessToken();
    expect(token).toBeNull();
  });

  it('signIn does not throw when request is null', async () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {
      await expect(result.current.signIn()).resolves.toBeUndefined();
    });
  });

  it('signOut clears state', async () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
    expect(result.current.isSignedIn).toBe(false);
  });

  it('provides default retentionDays of 7', () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    expect(result.current.retentionDays).toBe(7);
  });

  it('setRetentionDays updates the value', async () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {
      result.current.setRetentionDays(30);
    });
    expect(result.current.retentionDays).toBe(30);
  });

  it('readStoredAuth rejects invalid shape and removes key', async () => {
    storageMap.set('canto-google-auth', JSON.stringify({ garbage: true }));
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});
    // Invalid shape should be cleared — user stays signed out
    expect(result.current.isSignedIn).toBe(false);
    expect(storageMap.has('canto-google-auth')).toBe(false);
  });

  it('readStoredAuth rejects non-JSON and removes key', async () => {
    storageMap.set('canto-google-auth', 'not-json');
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isSignedIn).toBe(false);
    expect(storageMap.has('canto-google-auth')).toBe(false);
  });

  it('readStoredAuth clears expired retention', async () => {
    const expired = {
      accessToken: 'old-token',
      tokenExpiresAt: Date.now() + 3600_000,
      user: { email: 'u@t.com', name: 'U' },
      storedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
      retentionDays: 7,
    };
    storageMap.set('canto-google-auth', JSON.stringify(expired));
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isSignedIn).toBe(false);
    expect(storageMap.has('canto-google-auth')).toBe(false);
  });

  it('readStoredAuth allows retentionDays=0 (no expiry)', async () => {
    const stored = {
      accessToken: 'forever-token',
      tokenExpiresAt: Date.now() + 3600_000,
      user: { email: 'u@t.com', name: 'U' },
      storedAt: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 year ago
      retentionDays: 0,
    };
    storageMap.set('canto-google-auth', JSON.stringify(stored));

    // fetchUserInfo succeeds — token is valid
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ email: 'u@t.com', name: 'U', picture: null }),
    });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.accessToken).toBe('forever-token');
  });

  it('restores session from localStorage with valid token', async () => {
    const stored = {
      accessToken: 'stored-token',
      tokenExpiresAt: Date.now() + 3600_000,
      user: { email: 'stored@t.com', name: 'Stored' },
      storedAt: Date.now(),
      retentionDays: 7,
    };
    storageMap.set('canto-google-auth', JSON.stringify(stored));

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ email: 'stored@t.com', name: 'Stored', picture: 'https://pic' }),
    });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.accessToken).toBe('stored-token');
    expect(result.current.user).toEqual({
      email: 'stored@t.com',
      name: 'Stored',
      photo: 'https://pic',
    });
  });

  it('clears stored session when token is expired', async () => {
    const stored = {
      accessToken: 'expired-token',
      tokenExpiresAt: Date.now() - 1000, // already expired
      user: { email: 'u@t.com', name: 'U' },
      storedAt: Date.now(),
      retentionDays: 7,
    };
    storageMap.set('canto-google-auth', JSON.stringify(stored));

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    expect(result.current.isSignedIn).toBe(false);
    expect(storageMap.has('canto-google-auth')).toBe(false);
  });

  it('clears stored session when fetchUserInfo returns not ok', async () => {
    const stored = {
      accessToken: 'bad-token',
      tokenExpiresAt: Date.now() + 3600_000,
      user: { email: 'u@t.com', name: 'U' },
      storedAt: Date.now(),
      retentionDays: 7,
    };
    storageMap.set('canto-google-auth', JSON.stringify(stored));

    mockFetch.mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    expect(result.current.isSignedIn).toBe(false);
  });

  it('handles fetchUserInfo network failure gracefully', async () => {
    const stored = {
      accessToken: 'net-fail-token',
      tokenExpiresAt: Date.now() + 3600_000,
      user: { email: 'u@t.com', name: 'U' },
      storedAt: Date.now(),
      retentionDays: 7,
    };
    storageMap.set('canto-google-auth', JSON.stringify(stored));

    mockFetch.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    expect(result.current.isSignedIn).toBe(false);
  });

  it('handles auth response success and stores session', async () => {
    mockResponse = {
      type: 'success',
      authentication: {
        accessToken: 'new-auth-token',
        expiresIn: 7200,
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ email: 'new@t.com', name: 'New User', picture: null }),
    });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    expect(result.current.accessToken).toBe('new-auth-token');
    expect(result.current.user).toEqual({
      email: 'new@t.com',
      name: 'New User',
      photo: undefined,
    });
    expect(result.current.isSignedIn).toBe(true);

    // Should have stored in localStorage
    const raw = storageMap.get('canto-google-auth');
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.accessToken).toBe('new-auth-token');
  });

  it('handles auth response with null authentication', async () => {
    mockResponse = {
      type: 'success',
      authentication: null,
    };

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    expect(result.current.isSignedIn).toBe(false);
  });

  it('ignores non-success auth response', async () => {
    mockResponse = { type: 'error' };

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    expect(result.current.isSignedIn).toBe(false);
  });

  it('auth response with default expiresIn when not provided', async () => {
    mockResponse = {
      type: 'success',
      authentication: {
        accessToken: 'default-exp-token',
        // no expiresIn — should default to 3600
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ email: 'x@t.com', name: 'X' }),
    });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    expect(result.current.accessToken).toBe('default-exp-token');
  });

  it('signIn calls promptAsync when request is available', async () => {
    mockRequest = { url: 'https://auth.google.com' }; // truthy request
    promptAsync().mockResolvedValue({ type: 'dismiss' });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    await act(async () => {
      await result.current.signIn();
    });

    expect(mockPromptAsync).toHaveBeenCalled();
  });

  it('signOut clears localStorage', async () => {
    // Pre-set a stored session
    storageMap.set(
      'canto-google-auth',
      JSON.stringify({
        accessToken: 'tok',
        tokenExpiresAt: Date.now() + 3600_000,
        user: { email: 'u@t.com', name: 'U' },
        storedAt: Date.now(),
        retentionDays: 7,
      }),
    );

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ email: 'u@t.com', name: 'U' }),
    });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.isSignedIn).toBe(false);
    expect(storageMap.has('canto-google-auth')).toBe(false);
  });

  it('getAccessToken returns fresh token when not expired', async () => {
    // Set up a signed-in state via auth response
    mockResponse = {
      type: 'success',
      authentication: { accessToken: 'fresh-tok', expiresIn: 3600 },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ email: 'u@t.com', name: 'U' }),
    });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    let token: string | null = null;
    await act(async () => {
      token = await result.current.getAccessToken();
    });
    expect(token).toBe('fresh-tok');
  });

  it('getAccessToken tries silent re-auth when token expired', async () => {
    promptAsync().mockResolvedValue({
      type: 'success',
      authentication: { accessToken: 'refreshed-tok', expiresIn: 3600 },
    });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    // Token is null (no session), so getAccessToken should try re-auth
    let token: string | null = null;
    await act(async () => {
      token = await result.current.getAccessToken();
    });

    expect(token).toBe('refreshed-tok');
  });

  it('getAccessToken clears state when silent re-auth fails', async () => {
    promptAsync().mockResolvedValue({ type: 'dismiss' });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    let token: string | null = 'initial';
    await act(async () => {
      token = await result.current.getAccessToken();
    });

    expect(token).toBeNull();
    expect(result.current.isSignedIn).toBe(false);
  });

  it('getAccessToken clears state when silent re-auth throws', async () => {
    promptAsync().mockRejectedValue(new Error('auth timeout'));

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    let token: string | null = 'initial';
    await act(async () => {
      token = await result.current.getAccessToken();
    });

    expect(token).toBeNull();
  });

  it('setRetentionDays updates stored auth if present', async () => {
    const stored = {
      accessToken: 'tok',
      tokenExpiresAt: Date.now() + 3600_000,
      user: { email: 'u@t.com', name: 'U' },
      storedAt: Date.now(),
      retentionDays: 7,
    };
    storageMap.set('canto-google-auth', JSON.stringify(stored));

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ email: 'u@t.com', name: 'U' }),
    });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.setRetentionDays(30);
    });

    expect(result.current.retentionDays).toBe(30);
    const raw = storageMap.get('canto-google-auth');
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.retentionDays).toBe(30);
  });

  it('getAccessToken returns null when promptAsyncRef is null', async () => {
    // promptAsync is set on mount via useEffect. When promptAsyncRef.current is null,
    // getAccessToken falls through to clearing state.
    // Our mock sets promptAsync to a function, so this tests the "no accessToken +
    // promptAsync returns dismiss" path which clears state.
    promptAsync().mockResolvedValue({ type: 'dismiss' });
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    let token: string | null = 'x';
    await act(async () => {
      token = await result.current.getAccessToken();
    });
    expect(token).toBeNull();
  });

  it('isValidStoredAuth rejects null data', async () => {
    storageMap.set('canto-google-auth', JSON.stringify(null));
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isSignedIn).toBe(false);
  });

  it('isValidStoredAuth rejects non-object data', async () => {
    storageMap.set('canto-google-auth', JSON.stringify(42));
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isSignedIn).toBe(false);
  });

  it('isValidStoredAuth rejects when accessToken is not string', async () => {
    storageMap.set(
      'canto-google-auth',
      JSON.stringify({ accessToken: 123, storedAt: Date.now(), retentionDays: 7 }),
    );
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isSignedIn).toBe(false);
    expect(storageMap.has('canto-google-auth')).toBe(false);
  });

  it('isValidStoredAuth rejects when storedAt is not number', async () => {
    storageMap.set(
      'canto-google-auth',
      JSON.stringify({ accessToken: 'tok', storedAt: 'bad', retentionDays: 7 }),
    );
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});
    expect(result.current.isSignedIn).toBe(false);
    expect(storageMap.has('canto-google-auth')).toBe(false);
  });

  it('auth response does not set user when fetchUserInfo fails', async () => {
    mockResponse = {
      type: 'success',
      authentication: { accessToken: 'tok', expiresIn: 3600 },
    };
    mockFetch.mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    expect(result.current.accessToken).toBe('tok');
    expect(result.current.user).toBeNull();
    expect(storageMap.has('canto-google-auth')).toBe(false);
  });

  it('fetchUserInfo falls back to email when name is null', async () => {
    mockResponse = {
      type: 'success',
      authentication: { accessToken: 'tok', expiresIn: 3600 },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ email: 'noname@t.com', name: null, picture: null }),
    });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    expect(result.current.user?.name).toBe('noname@t.com');
    expect(result.current.user?.photo).toBeUndefined();
  });

  it('getAccessToken silent re-auth with no expiresIn defaults to 3600', async () => {
    promptAsync().mockResolvedValue({
      type: 'success',
      authentication: { accessToken: 'reauth-tok' }, // no expiresIn
    });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    let token: string | null = null;
    await act(async () => {
      token = await result.current.getAccessToken();
    });

    expect(token).toBe('reauth-tok');
  });

  it('getAccessToken handles withTimeout rejection when re-auth hangs', async () => {
    jest.useFakeTimers();
    // Make promptAsync never resolve to trigger the timeout
    mockPromptAsync = jest.fn().mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {
      jest.runAllTimers();
    });

    let token: string | null = 'initial';
    const tokenPromise = act(async () => {
      token = await result.current.getAccessToken();
    });

    // Advance past AUTH_TIMEOUT_MS (15000)
    jest.advanceTimersByTime(16_000);
    await tokenPromise;

    // Timeout causes catch block, falls through to clearing state
    expect(token).toBeNull();
    jest.useRealTimers();
  });

  it('getAccessToken clears state when promptAsyncRef is null', async () => {
    // Set promptAsync to null so promptAsyncRef.current becomes null
    mockPromptAsync = null;

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {});

    let token: string | null = 'initial';
    await act(async () => {
      token = await result.current.getAccessToken();
    });

    // With no promptAsync, falls through to clearing state
    expect(token).toBeNull();
    expect(result.current.isSignedIn).toBe(false);
  });
});

describe('GoogleAuthContext.web — default context (no provider)', () => {
  it('returns default values when used outside provider', async () => {
    const { result } = renderHook(() => useGoogleAuth());
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
    expect(result.current.isSignedIn).toBe(false);

    const token = await result.current.getAccessToken();
    expect(token).toBeNull();

    await result.current.signIn();
    await result.current.signOut();
    result.current.setRetentionDays(30);
  });
});
