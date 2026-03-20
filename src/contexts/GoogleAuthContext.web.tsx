import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * Web stub for Google Auth — @react-native-google-signin web support
 * is sponsors-only and throws at import time. This provides the same
 * context shape with no-op functions and null user.
 */

export interface GoogleUser {
  email: string;
  name: string;
  photo?: string;
}

interface GoogleAuthState {
  user: GoogleUser | null;
  accessToken: string | null;
  getAccessToken: () => Promise<string | null>;
  isSignedIn: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const GoogleAuthCtx = createContext<GoogleAuthState>({
  user: null,
  accessToken: null,
  getAccessToken: async () => null,
  isSignedIn: false,
  isLoading: false,
  signIn: async () => {},
  signOut: async () => {},
});

export function useGoogleAuth() {
  return useContext(GoogleAuthCtx);
}

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  return (
    <GoogleAuthCtx.Provider
      value={{
        user: null,
        accessToken: null,
        getAccessToken: async () => null,
        isSignedIn: false,
        isLoading: false,
        signIn: async () => {
          console.warn('[Canto] Google Sign-In is not available on web');
        },
        signOut: async () => {},
      }}
    >
      {children}
    </GoogleAuthCtx.Provider>
  );
}
