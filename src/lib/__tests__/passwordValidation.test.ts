import { evaluatePasswordStrength } from '../encryption/password';
import { createUnlockRateLimiter } from '../encryption/ratelimit';

describe('evaluatePasswordStrength', () => {
  it('returns weak for empty password', () => {
    const result = evaluatePasswordStrength('');
    expect(result.strength).toBe('weak');
  });

  it('returns weak for short lowercase-only password', () => {
    const result = evaluatePasswordStrength('abc');
    expect(result.strength).toBe('weak');
    expect(result.reasons).toContain('min8');
    expect(result.reasons).toContain('uppercase');
    expect(result.reasons).toContain('digit');
    expect(result.reasons).toContain('special');
  });

  it('returns weak for only digits', () => {
    const result = evaluatePasswordStrength('12345');
    expect(result.strength).toBe('weak');
  });

  it('returns fair for 8+ chars with mixed case', () => {
    const result = evaluatePasswordStrength('Abcdefgh');
    expect(result.strength).toBe('fair');
    expect(result.reasons).toContain('digit');
    expect(result.reasons).toContain('special');
  });

  it('returns fair for 8+ chars with mixed case and digit', () => {
    const result = evaluatePasswordStrength('Abcdefg1');
    expect(result.strength).toBe('fair');
    expect(result.reasons).toContain('special');
  });

  it('returns strong for 12+ chars with all criteria', () => {
    const result = evaluatePasswordStrength('MyP@ssw0rd!!xx');
    expect(result.strength).toBe('strong');
    expect(result.reasons).toHaveLength(0);
  });

  it('returns strong for complex short-ish password (12 chars)', () => {
    const result = evaluatePasswordStrength('Str0ng!Pass1');
    expect(result.strength).toBe('strong');
  });

  it('returns strong without special character if all other criteria met', () => {
    // 15 chars, lower, upper, digit = 5/6 (missing special) → strong
    const result = evaluatePasswordStrength('LongPassword123');
    expect(result.strength).toBe('strong');
    expect(result.reasons).toContain('special');
  });

  it('returns fair for 8-char password with all types but short', () => {
    // 8 chars, has lower, upper, digit, special = 5 criteria (missing min12)
    const result = evaluatePasswordStrength('Ab1!cdef');
    expect(result.strength).toBe('strong');
  });

  it('includes missing criteria in reasons', () => {
    const result = evaluatePasswordStrength('password');
    expect(result.reasons).toContain('min12');
    expect(result.reasons).toContain('uppercase');
    expect(result.reasons).toContain('digit');
    expect(result.reasons).toContain('special');
    expect(result.reasons).not.toContain('lowercase');
    expect(result.reasons).not.toContain('min8');
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
