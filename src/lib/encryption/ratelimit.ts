const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

export interface UnlockRateLimiter {
  /** Returns true if the attempt is allowed, false if rate-limited. */
  attempt(): boolean;
  /** Reset the limiter (e.g. after successful unlock). */
  reset(): void;
  /** Returns remaining lockout time in ms, or 0 if not locked. */
  lockoutRemaining(): number;
}

export function createUnlockRateLimiter(): UnlockRateLimiter {
  let attempts = 0;
  let lockedUntil = 0;

  return {
    attempt(): boolean {
      const now = Date.now();
      if (now < lockedUntil) {
        return false;
      }
      if (lockedUntil > 0 && now >= lockedUntil) {
        // Lockout expired, reset
        attempts = 0;
        lockedUntil = 0;
      }
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        lockedUntil = now + LOCKOUT_MS;
        return false;
      }
      return true;
    },

    reset(): void {
      attempts = 0;
      lockedUntil = 0;
    },

    lockoutRemaining(): number {
      const now = Date.now();
      if (now < lockedUntil) {
        return lockedUntil - now;
      }
      return 0;
    },
  };
}
