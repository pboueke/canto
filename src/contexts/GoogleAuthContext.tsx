import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

const Google = require('expo-auth-session/build/providers/Google');
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { GOOGLE_CREDENTIALS } from '../../google-credentials';

try {
  WebBrowser.maybeCompleteAuthSession();
} catch {
  // Safe to ignore — only relevant when returning from auth redirect
}

const REFRESH_TOKEN_KEY = 'canto.google.refreshToken';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USER_INFO_URL = 'https://www.googleapis.com/userinfo/v2/me';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
];

export interface GoogleUser {
  email: string;
  name: string;
  photo?: string;
}

interface GoogleAuthState {
  user: GoogleUser | null;
  accessToken: string | null;
  isSignedIn: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const GoogleAuthCtx = createContext<GoogleAuthState>({
  user: null,
  accessToken: null,
  isSignedIn: false,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function useGoogleAuth() {
  return useContext(GoogleAuthCtx);
}

const hasValidCredentials =
  GOOGLE_CREDENTIALS.webClientId && !GOOGLE_CREDENTIALS.webClientId.startsWith('REPLACE_ME');

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(hasValidCredentials);

  const [request, response, promptAsync] = Google.useAuthRequest(
    hasValidCredentials
      ? {
          webClientId: GOOGLE_CREDENTIALS.webClientId,
          androidClientId: GOOGLE_CREDENTIALS.androidClientId,
          iosClientId: GOOGLE_CREDENTIALS.iosClientId,
          scopes: SCOPES,
          extraParams: { access_type: 'offline' },
        }
      : { clientId: 'disabled' },
  );

  const fetchUserInfo = useCallback(async (token: string): Promise<GoogleUser | null> => {
    try {
      const res = await fetch(USER_INFO_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return { email: data.email, name: data.name, photo: data.picture };
    } catch {
      return null;
    }
  }, []);

  const refreshAccessToken = useCallback(async (refreshToken: string): Promise<string | null> => {
    try {
      const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CREDENTIALS.webClientId,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.access_token ?? null;
    } catch {
      return null;
    }
  }, []);

  // Try silent refresh on mount
  useEffect(() => {
    if (!hasValidCredentials) return;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (stored) {
          const token = await refreshAccessToken(stored);
          if (token) {
            setAccessToken(token);
            const userInfo = await fetchUserInfo(token);
            if (userInfo) setUser(userInfo);
          } else {
            // Refresh token expired
            await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshAccessToken, fetchUserInfo]);

  // Handle auth response — the Google provider auto-exchanges the code
  useEffect(() => {
    if (response?.type !== 'success') return;
    const authentication = response.authentication;

    if (authentication?.accessToken) {
      setAccessToken(authentication.accessToken);
      fetchUserInfo(authentication.accessToken).then((userInfo) => {
        if (userInfo) setUser(userInfo);
      });
      // Store refresh token if available
      if (authentication.refreshToken) {
        SecureStore.setItemAsync(REFRESH_TOKEN_KEY, authentication.refreshToken);
      }
    } else {
      // Fallback: manual code exchange if auto-exchange didn't provide authentication
      const code = response.params?.code;
      if (!code) return;
      console.warn(
        '[Canto] Auto code exchange did not return authentication, falling back to manual exchange',
      );
    }
  }, [response, fetchUserInfo]);

  const signIn = useCallback(async () => {
    if (!request || !hasValidCredentials) return;
    await promptAsync();
  }, [request, promptAsync]);

  const signOut = useCallback(async () => {
    setUser(null);
    setAccessToken(null);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  }, []);

  return (
    <GoogleAuthCtx.Provider
      value={{
        user,
        accessToken,
        isSignedIn: !!accessToken,
        isLoading,
        signIn,
        signOut,
      }}
    >
      {children}
    </GoogleAuthCtx.Provider>
  );
}
