/**
 * Tests for the web Google Auth context stub.
 * Ensures the no-op provider gives correct default values and never crashes.
 */
import { renderHook, act } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { GoogleAuthProvider, useGoogleAuth } from '../GoogleAuthContext.web';

const wrapper = ({ children }: { children: ReactNode }) => (
  <GoogleAuthProvider>{children}</GoogleAuthProvider>
);

describe('GoogleAuthContext.web', () => {
  it('provides null user', () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  it('provides null accessToken', () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    expect(result.current.accessToken).toBeNull();
  });

  it('isSignedIn is false', () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    expect(result.current.isSignedIn).toBe(false);
  });

  it('isLoading is false', () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    expect(result.current.isLoading).toBe(false);
  });

  it('getAccessToken returns null', async () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    const token = await result.current.getAccessToken();
    expect(token).toBeNull();
  });

  it('signIn does not throw', async () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {
      await expect(result.current.signIn()).resolves.toBeUndefined();
    });
  });

  it('signOut does not throw', async () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {
      await expect(result.current.signOut()).resolves.toBeUndefined();
    });
  });

  it('signIn logs a warning', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {
      await result.current.signIn();
    });
    expect(warnSpy).toHaveBeenCalledWith('[Canto] Google Sign-In is not available on web');
    warnSpy.mockRestore();
  });
});
