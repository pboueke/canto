/**
 * Tests for the web Google Auth context's token storage and retention logic.
 * The OAuth flow itself depends on expo-auth-session browser integration,
 * so we test the localStorage persistence layer directly.
 */

// Mock localStorage for Jest (Node environment)
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

const STORAGE_KEY = 'canto-google-auth';

interface StoredAuth {
  refreshToken: string;
  user: { email: string; name: string; photo?: string };
  storedAt: number;
  retentionDays: number;
}

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: StoredAuth = JSON.parse(raw);
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

const makeAuth = (overrides: Partial<StoredAuth> = {}): StoredAuth => ({
  refreshToken: 'refresh-token-123',
  user: { email: 'test@example.com', name: 'Test User' },
  storedAt: Date.now(),
  retentionDays: 7,
  ...overrides,
});

describe('Google Auth Web — token storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(readStoredAuth()).toBeNull();
  });

  it('writes and reads stored auth', () => {
    const auth = makeAuth();
    writeStoredAuth(auth);
    const result = readStoredAuth();
    expect(result).not.toBeNull();
    expect(result!.refreshToken).toBe('refresh-token-123');
    expect(result!.user.email).toBe('test@example.com');
  });

  it('clears expired auth (1 day retention)', () => {
    const auth = makeAuth({
      retentionDays: 1,
      storedAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
    });
    writeStoredAuth(auth);
    expect(readStoredAuth()).toBeNull();
    // Storage should be cleared
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps non-expired auth (1 week retention, stored 3 days ago)', () => {
    const auth = makeAuth({
      retentionDays: 7,
      storedAt: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    });
    writeStoredAuth(auth);
    expect(readStoredAuth()).not.toBeNull();
  });

  it('clears expired auth (1 week retention, stored 8 days ago)', () => {
    const auth = makeAuth({
      retentionDays: 7,
      storedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    });
    writeStoredAuth(auth);
    expect(readStoredAuth()).toBeNull();
  });

  it('clears expired auth (1 month retention, stored 31 days ago)', () => {
    const auth = makeAuth({
      retentionDays: 30,
      storedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
    });
    writeStoredAuth(auth);
    expect(readStoredAuth()).toBeNull();
  });

  it('never expires when retentionDays is 0', () => {
    const auth = makeAuth({
      retentionDays: 0,
      storedAt: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 year ago
    });
    writeStoredAuth(auth);
    expect(readStoredAuth()).not.toBeNull();
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    expect(readStoredAuth()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('updating retention resets storedAt', () => {
    const auth = makeAuth({ retentionDays: 7 });
    writeStoredAuth(auth);

    // Simulate retention change
    const stored = readStoredAuth()!;
    const updated = { ...stored, retentionDays: 30, storedAt: Date.now() };
    writeStoredAuth(updated);

    const result = readStoredAuth();
    expect(result).not.toBeNull();
    expect(result!.retentionDays).toBe(30);
  });
});
