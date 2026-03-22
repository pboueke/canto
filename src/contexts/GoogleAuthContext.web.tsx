import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthSessionResult } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GOOGLE_CREDENTIALS } from '../../google-credentials';

WebBrowser.maybeCompleteAuthSession();

const SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
];

const STORAGE_KEY = 'canto-google-auth';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/userinfo/v2/me';

export type RetentionDays = 0 | 1 | 7 | 30;

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
  retentionDays: RetentionDays;
  setRetentionDays: (days: RetentionDays) => void;
}

interface StoredAuth {
  accessToken: string;
  tokenExpiresAt: number;
  user: GoogleUser;
  storedAt: number;
  retentionDays: RetentionDays;
}

const AUTH_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
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

function isValidStoredAuth(data: unknown): data is StoredAuth {
  if (!data || typeof data !== 'object') return false;
  const o = data as Record<string, unknown>;
  return (
    typeof o.accessToken === 'string' &&
    typeof o.storedAt === 'number' &&
    typeof o.retentionDays === 'number'
  );
}

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!isValidStoredAuth(data)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    // Check retention policy
    if (data.retentionDays > 0) {
      const expiresAt = data.storedAt + data.retentionDays * 24 * 60 * 60 * 1000;
      if (Date.now() > expiresAt) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
    }
    return data;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writeStoredAuth(auth: StoredAuth): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

function clearStoredAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}

async function fetchUserInfo(token: string): Promise<GoogleUser | null> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const info = await res.json();
    return {
      email: info.email,
      name: info.name ?? info.email,
      photo: info.picture ?? undefined,
    };
  } catch {
    return null;
  }
}

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retentionDays, setRetentionDaysState] = useState<RetentionDays>(7);

  const tokenExpiresAtRef = useRef<number>(0);
  const promptAsyncRef = useRef<(() => Promise<AuthSessionResult>) | null>(null);

  // Implicit flow: returns access token directly in the URL hash, no code exchange needed.
  // Google's web OAuth clients require a client_secret for authorization code flow,
  // which is not safe to embed in a SPA. Implicit flow avoids this.
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_CREDENTIALS.webClientId,
    scopes: SCOPES,
  });

  // Keep promptAsync ref current for silent re-auth
  useEffect(() => {
    promptAsyncRef.current = promptAsync;
  }, [promptAsync]);

  // Restore session from localStorage on mount
  useEffect(() => {
    (async () => {
      const stored = readStoredAuth();
      if (!stored) {
        setIsLoading(false);
        return;
      }
      setRetentionDaysState(stored.retentionDays);

      // Check if the stored access token is still valid
      if (stored.tokenExpiresAt > Date.now()) {
        // Verify the token still works by fetching user info
        const userInfo = await fetchUserInfo(stored.accessToken);
        if (userInfo) {
          setAccessToken(stored.accessToken);
          tokenExpiresAtRef.current = stored.tokenExpiresAt;
          setUser(userInfo);
          setIsLoading(false);
          return;
        }
      }

      // Token expired or invalid — clear and require re-auth
      // Keep user info so UI can show "session expired" state
      clearStoredAuth();
      setIsLoading(false);
    })();
  }, []);

  // Handle auth response after user signs in (implicit flow)
  useEffect(() => {
    if (response?.type !== 'success') return;

    const { authentication } = response;
    if (!authentication?.accessToken) return;

    const token = authentication.accessToken;
    const expiresIn = authentication.expiresIn ?? 3600;

    (async () => {
      setAccessToken(token);
      tokenExpiresAtRef.current = Date.now() + expiresIn * 1000;

      const userInfo = await fetchUserInfo(token);
      if (userInfo) {
        setUser(userInfo);
        writeStoredAuth({
          accessToken: token,
          tokenExpiresAt: tokenExpiresAtRef.current,
          user: userInfo,
          storedAt: Date.now(),
          retentionDays,
        });
      }
    })();
  }, [response]); // retentionDays intentionally excluded — use current value at call time

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    // If token is still fresh, return it
    if (accessToken && Date.now() < tokenExpiresAtRef.current) {
      return accessToken;
    }

    // Token expired — try silent re-auth (user already granted consent)
    if (promptAsyncRef.current) {
      try {
        const result = await withTimeout(
          promptAsyncRef.current(),
          AUTH_TIMEOUT_MS,
          'Silent re-auth',
        );
        if (result.type === 'success' && result.authentication?.accessToken) {
          const newToken = result.authentication.accessToken;
          const expiresIn = result.authentication.expiresIn ?? 3600;
          setAccessToken(newToken);
          tokenExpiresAtRef.current = Date.now() + expiresIn * 1000;
          return newToken;
        }
      } catch {
        // Silent re-auth failed — user needs to sign in again
      }
    }

    // Could not refresh — clear state
    setAccessToken(null);
    setUser(null);
    clearStoredAuth();
    return null;
  }, [accessToken]);

  const signIn = useCallback(async () => {
    if (!request) return;
    await promptAsync();
  }, [request, promptAsync]);

  const signOut = useCallback(async () => {
    setUser(null);
    setAccessToken(null);
    tokenExpiresAtRef.current = 0;
    clearStoredAuth();
  }, []);

  const setRetentionDays = useCallback((days: RetentionDays) => {
    setRetentionDaysState(days);
    const stored = readStoredAuth();
    if (stored) {
      writeStoredAuth({ ...stored, retentionDays: days, storedAt: Date.now() });
    }
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
        retentionDays,
        setRetentionDays,
      }}
    >
      {children}
    </GoogleAuthCtx.Provider>
  );
}
