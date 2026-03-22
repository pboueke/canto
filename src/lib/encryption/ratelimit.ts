import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'canto_unlock_rate_limit';

interface RateLimitState {
  attempts: number;
  lockedUntil: number;
}

function getLockoutDuration(attempts: number): number {
  if (attempts > 15) return 30 * 60_000; // 30 minutes
  if (attempts > 10) return 5 * 60_000; // 5 minutes
  if (attempts > 5) return 30_000; // 30 seconds
  return 0;
}

export interface UnlockRateLimiter {
  /** Returns true if the attempt is allowed, false if rate-limited. */
  attempt(): Promise<boolean>;
  /** Reset the limiter (e.g. after successful unlock). */
  reset(): Promise<void>;
  /** Returns remaining lockout time in ms, or 0 if not locked. */
  lockoutRemaining(): Promise<number>;
}

async function loadState(): Promise<RateLimitState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { attempts: 0, lockedUntil: 0 };
  try {
    return JSON.parse(raw) as RateLimitState;
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

async function saveState(state: RateLimitState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createUnlockRateLimiter(): UnlockRateLimiter {
  // Mutex to serialize concurrent attempt() calls
  let pending: Promise<unknown> = Promise.resolve();

  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = pending.then(fn, fn);
    pending = next;
    return next;
  }

  return {
    attempt(): Promise<boolean> {
      return serialize(async () => {
        const state = await loadState();
        const now = Date.now();

        if (now < state.lockedUntil) {
          return false;
        }

        // Lockout expired, reset
        if (state.lockedUntil > 0) {
          state.attempts = 0;
          state.lockedUntil = 0;
        }

        state.attempts++;
        const lockout = getLockoutDuration(state.attempts);
        if (lockout > 0) {
          state.lockedUntil = now + lockout;
          await saveState(state);
          return false;
        }

        await saveState(state);
        return true;
      });
    },

    async reset(): Promise<void> {
      await AsyncStorage.removeItem(STORAGE_KEY);
    },

    async lockoutRemaining(): Promise<number> {
      const state = await loadState();
      const now = Date.now();
      if (now < state.lockedUntil) {
        return state.lockedUntil - now;
      }
      return 0;
    },
  };
}
