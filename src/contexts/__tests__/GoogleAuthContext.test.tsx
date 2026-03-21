/**
 * Tests for the native Google Auth context (GoogleAuthContext.tsx).
 * Mocks @react-native-google-signin/google-signin.
 */

jest.mock('../../../google-credentials', () => ({
  GOOGLE_CREDENTIALS: {
    webClientId: 'test-web-client-id.apps.googleusercontent.com',
  },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    getTokens: jest.fn(),
    signInSilently: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    hasPlayServices: jest.fn(),
  },
  isSuccessResponse: (r: { type: string }) => r.type === 'success',
  statusCodes: {
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  },
}));

import React from 'react';
import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { GoogleAuthProvider, useGoogleAuth } from '../GoogleAuthContext';

const { GoogleSignin } = require('@react-native-google-signin/google-signin');
const mockGoogleSignin = GoogleSignin as Record<string, jest.Mock>;

const wrapper = ({ children }: { children: ReactNode }) => (
  <GoogleAuthProvider>{children}</GoogleAuthProvider>
);

describe('GoogleAuthContext (native)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: silent sign-in returns SIGN_IN_REQUIRED
    mockGoogleSignin.signInSilently.mockRejectedValue({ code: 'SIGN_IN_REQUIRED' });
  });

  it('renders provider and provides default state', async () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.retentionDays).toBe(7);
  });

  it('restores session via silent sign-in on mount (success)', async () => {
    mockGoogleSignin.signInSilently.mockResolvedValue({
      type: 'success',
      data: { user: { email: 'user@test.com', name: 'Test User', photo: 'https://photo.url' } },
    });
    mockGoogleSignin.getTokens.mockResolvedValue({ accessToken: 'token-123' });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual({
      email: 'user@test.com',
      name: 'Test User',
      photo: 'https://photo.url',
    });
    expect(result.current.accessToken).toBe('token-123');
    expect(result.current.isSignedIn).toBe(true);
  });

  it('handles silent sign-in with null name/photo', async () => {
    mockGoogleSignin.signInSilently.mockResolvedValue({
      type: 'success',
      data: { user: { email: 'user@test.com', name: null, photo: null } },
    });
    mockGoogleSignin.getTokens.mockResolvedValue({ accessToken: 'token-456' });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual({
      email: 'user@test.com',
      name: 'user@test.com', // falls back to email
      photo: undefined, // null becomes undefined
    });
  });

  it('handles silent sign-in SIGN_IN_REQUIRED silently', async () => {
    mockGoogleSignin.signInSilently.mockRejectedValue({ code: 'SIGN_IN_REQUIRED' });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isSignedIn).toBe(false);
  });

  it('warns on unexpected silent sign-in error', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    mockGoogleSignin.signInSilently.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(consoleSpy).toHaveBeenCalledWith('[Canto] Silent sign-in error:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('handles non-success silent sign-in response', async () => {
    mockGoogleSignin.signInSilently.mockResolvedValue({ type: 'cancelled' });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
  });

  it('signIn — success path', async () => {
    mockGoogleSignin.signInSilently.mockRejectedValue({ code: 'SIGN_IN_REQUIRED' });
    mockGoogleSignin.hasPlayServices.mockResolvedValue(true);
    mockGoogleSignin.signIn.mockResolvedValue({
      type: 'success',
      data: { user: { email: 'login@test.com', name: 'Login User', photo: null } },
    });
    mockGoogleSignin.getTokens.mockResolvedValue({ accessToken: 'login-token' });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.user?.email).toBe('login@test.com');
    expect(result.current.accessToken).toBe('login-token');
    expect(result.current.isSignedIn).toBe(true);
  });

  it('signIn — non-success response (e.g. dismissed)', async () => {
    mockGoogleSignin.signInSilently.mockRejectedValue({ code: 'SIGN_IN_REQUIRED' });
    mockGoogleSignin.hasPlayServices.mockResolvedValue(true);
    mockGoogleSignin.signIn.mockResolvedValue({ type: 'cancelled' });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isSignedIn).toBe(false);
  });

  it('signIn — user cancelled', async () => {
    mockGoogleSignin.signInSilently.mockRejectedValue({ code: 'SIGN_IN_REQUIRED' });
    mockGoogleSignin.hasPlayServices.mockResolvedValue(true);
    mockGoogleSignin.signIn.mockRejectedValue({ code: 'SIGN_IN_CANCELLED' });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isSignedIn).toBe(false);
  });

  it('signIn — unexpected error logs to console', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockGoogleSignin.signInSilently.mockRejectedValue({ code: 'SIGN_IN_REQUIRED' });
    mockGoogleSignin.hasPlayServices.mockResolvedValue(true);
    mockGoogleSignin.signIn.mockRejectedValue(new Error('unknown error'));

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signIn();
    });

    expect(consoleSpy).toHaveBeenCalledWith('[Canto] Sign-in error:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('signOut clears user and token', async () => {
    // First sign in
    mockGoogleSignin.signInSilently.mockResolvedValue({
      type: 'success',
      data: { user: { email: 'u@t.com', name: 'U', photo: null } },
    });
    mockGoogleSignin.getTokens.mockResolvedValue({ accessToken: 'tok' });
    mockGoogleSignin.signOut.mockResolvedValue(null);

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
    expect(result.current.isSignedIn).toBe(false);
  });

  it('signOut handles error from GoogleSignin.signOut gracefully', async () => {
    mockGoogleSignin.signInSilently.mockResolvedValue({
      type: 'success',
      data: { user: { email: 'u@t.com', name: 'U', photo: null } },
    });
    mockGoogleSignin.getTokens.mockResolvedValue({ accessToken: 'tok' });
    mockGoogleSignin.signOut.mockRejectedValue(new Error('signout fail'));

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      await result.current.signOut();
    });

    // Should still clear local state despite error
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
  });

  it('getAccessToken returns token from GoogleSignin.getTokens', async () => {
    mockGoogleSignin.signInSilently.mockRejectedValue({ code: 'SIGN_IN_REQUIRED' });
    mockGoogleSignin.getTokens.mockResolvedValue({ accessToken: 'fresh-token' });

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let token: string | null = null;
    await act(async () => {
      token = await result.current.getAccessToken();
    });

    expect(token).toBe('fresh-token');
  });

  it('getAccessToken returns null on error', async () => {
    mockGoogleSignin.signInSilently.mockRejectedValue({ code: 'SIGN_IN_REQUIRED' });
    mockGoogleSignin.getTokens.mockRejectedValue(new Error('token fail'));

    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let token: string | null = 'not-null';
    await act(async () => {
      token = await result.current.getAccessToken();
    });

    expect(token).toBeNull();
  });

  it('setRetentionDays is a no-op on native', () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    // Should not throw
    result.current.setRetentionDays(30);
    expect(result.current.retentionDays).toBe(7); // always 7 on native
  });
});

describe('GoogleAuthContext default (no provider)', () => {
  it('returns default context values when used outside provider', async () => {
    const { result } = renderHook(() => useGoogleAuth());
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.isLoading).toBe(true);

    // Default callbacks should be safe to call
    const token = await result.current.getAccessToken();
    expect(token).toBeNull();
    await result.current.signIn();
    await result.current.signOut();
    result.current.setRetentionDays(30);
  });
});
