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
});
