import { validatePasswordStrength } from '../encryption/password';
import { createUnlockRateLimiter } from '../encryption/ratelimit';

describe('validatePasswordStrength', () => {
  it('rejects password shorter than 8 characters', () => {
    const result = validatePasswordStrength('short');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('rejects empty password', () => {
    const result = validatePasswordStrength('');
    expect(result.valid).toBe(false);
  });

  it('rejects 7-character password', () => {
    const result = validatePasswordStrength('1234567');
    expect(result.valid).toBe(false);
  });

  it('accepts 8-character password', () => {
    const result = validatePasswordStrength('12345678');
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('accepts long password', () => {
    const result = validatePasswordStrength('a'.repeat(100));
    expect(result.valid).toBe(true);
  });
});

describe('createUnlockRateLimiter', () => {
  it('allows up to 5 attempts', () => {
    const limiter = createUnlockRateLimiter();
    for (let i = 0; i < 5; i++) {
      expect(limiter.attempt()).toBe(true);
    }
  });

  it('blocks on 6th attempt', () => {
    const limiter = createUnlockRateLimiter();
    for (let i = 0; i < 5; i++) {
      limiter.attempt();
    }
    expect(limiter.attempt()).toBe(false);
  });

  it('reports lockout remaining after lockout', () => {
    const limiter = createUnlockRateLimiter();
    for (let i = 0; i < 6; i++) {
      limiter.attempt();
    }
    expect(limiter.lockoutRemaining()).toBeGreaterThan(0);
  });

  it('reset clears attempts and lockout', () => {
    const limiter = createUnlockRateLimiter();
    for (let i = 0; i < 6; i++) {
      limiter.attempt();
    }
    limiter.reset();
    expect(limiter.attempt()).toBe(true);
    expect(limiter.lockoutRemaining()).toBe(0);
  });

  it('reports zero lockout when not locked', () => {
    const limiter = createUnlockRateLimiter();
    expect(limiter.lockoutRemaining()).toBe(0);
  });
});
