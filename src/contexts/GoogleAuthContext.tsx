import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { GOOGLE_CREDENTIALS } from '../../google-credentials';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
];

export type RetentionDays = 0 | 1 | 7 | 30;

export interface GoogleUser {
  email: string;
  name: string;
  photo?: string;
}

interface GoogleAuthState {
  user: GoogleUser | null;
  accessToken: string | null;
  /** Always returns a fresh token (Google Play Services handles refresh). Use this for API calls. */
  getAccessToken: () => Promise<string | null>;
  isSignedIn: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Web only — session retention period. No-op on native. */
  retentionDays: RetentionDays;
  setRetentionDays: (days: RetentionDays) => void;
}

const GoogleAuthCtx = createContext<GoogleAuthState>({
  user: null,
  accessToken: null,
  getAccessToken: async () => null,
  isSignedIn: false,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
  retentionDays: 7,
  setRetentionDays: () => {},
});

export function useGoogleAuth() {
  return useContext(GoogleAuthCtx);
}

const hasValidCredentials =
  !!GOOGLE_CREDENTIALS.webClientId && !GOOGLE_CREDENTIALS.webClientId.startsWith('REPLACE_ME');

if (hasValidCredentials) {
  GoogleSignin.configure({
    webClientId: GOOGLE_CREDENTIALS.webClientId,
    scopes: SCOPES,
  });
}

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(hasValidCredentials);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const { accessToken: token } = await GoogleSignin.getTokens();
      setAccessToken(token);
      return token;
    } catch {
      return null;
    }
  }, []);

  const setUserFromSignIn = useCallback(
    (data: { user: { email: string; name: string | null; photo: string | null } }) => {
      setUser({
        email: data.user.email,
        name: data.user.name ?? data.user.email,
        photo: data.user.photo ?? undefined,
      });
    },
    [],
  );

  // Try silent sign-in on mount (restores previous session)
  useEffect(() => {
    if (!hasValidCredentials) return;
    (async () => {
      try {
        const response = await GoogleSignin.signInSilently();
        if (response.type === 'success') {
          setUserFromSignIn(response.data);
          await getAccessToken();
        }
      } catch (error: unknown) {
        // No previous session — user needs to sign in manually
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code: string }).code === statusCodes.SIGN_IN_REQUIRED
        ) {
          // Expected — no-op
        } else {
          console.warn('[Canto] Silent sign-in error:', error);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [getAccessToken, setUserFromSignIn]);

  const signIn = useCallback(async () => {
    if (!hasValidCredentials) return;
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (isSuccessResponse(response)) {
        setUserFromSignIn(response.data);
        await getAccessToken();
      }
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === statusCodes.SIGN_IN_CANCELLED
      ) {
        // User cancelled — no-op
      } else {
        console.error('[Canto] Sign-in error:', error);
      }
    }
  }, [getAccessToken, setUserFromSignIn]);

  const signOut = useCallback(async () => {
    try {
      await GoogleSignin.signOut();
    } catch {
      // Best-effort
    }
    setUser(null);
    setAccessToken(null);
  }, []);

  return (
    <GoogleAuthCtx.Provider
      value={{
        user,
        accessToken,
        getAccessToken,
        isSignedIn: !!accessToken,
        isLoading,
        signIn,
        signOut,
        retentionDays: 7,
        setRetentionDays: () => {},
      }}
    >
      {children}
    </GoogleAuthCtx.Provider>
  );
}
