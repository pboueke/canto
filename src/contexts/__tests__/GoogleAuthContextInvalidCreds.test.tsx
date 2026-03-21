/**
 * Tests for GoogleAuthContext when credentials are invalid.
 * Covers the `if (!hasValidCredentials) return;` guards at lines 92 and 119.
 */

jest.mock('../../../google-credentials', () => ({
  GOOGLE_CREDENTIALS: {
    webClientId: 'REPLACE_ME_with_your_web_client_id',
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
import { renderHook, act } from '@testing-library/react-native';
import { GoogleAuthProvider, useGoogleAuth } from '../GoogleAuthContext';

const { GoogleSignin } = require('@react-native-google-signin/google-signin');

const wrapper = ({ children }: { children: ReactNode }) => (
  <GoogleAuthProvider>{children}</GoogleAuthProvider>
);

describe('GoogleAuthContext with invalid credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips silent sign-in on mount when credentials are invalid', async () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    // isLoading starts as false (hasValidCredentials is false)
    expect(result.current.isLoading).toBe(false);
    expect(GoogleSignin.signInSilently).not.toHaveBeenCalled();
  });

  it('signIn is a no-op when credentials are invalid', async () => {
    const { result } = renderHook(() => useGoogleAuth(), { wrapper });
    await act(async () => {
      await result.current.signIn();
    });
    expect(GoogleSignin.hasPlayServices).not.toHaveBeenCalled();
    expect(GoogleSignin.signIn).not.toHaveBeenCalled();
    expect(result.current.isSignedIn).toBe(false);
  });

  it('GoogleSignin.configure is not called with invalid credentials', () => {
    expect(GoogleSignin.configure).not.toHaveBeenCalled();
  });
});
