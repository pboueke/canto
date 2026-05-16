import { retryWithBackoff } from '../retry';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('succeeds on first try — returns immediately, no onAttempt calls', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const onAttempt = jest.fn();

    const promise = retryWithBackoff(fn, {
      attempts: 5,
      delaysMs: [100, 200, 400, 800],
      onAttempt,
    });
    await jest.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(onAttempt).not.toHaveBeenCalled();
  });

  it('fails twice then succeeds on attempt 3 — onAttempt called with (1, err) and (2, err)', async () => {
    const err1 = new Error('fail 1');
    const err2 = new Error('fail 2');
    const fn = jest
      .fn()
      .mockImplementationOnce(async () => {
        throw err1;
      })
      .mockImplementationOnce(async () => {
        throw err2;
      })
      .mockResolvedValueOnce('success');
    const onAttempt = jest.fn();

    const promise = retryWithBackoff(fn, {
      attempts: 5,
      delaysMs: [100, 200, 400, 800],
      onAttempt,
    });
    await jest.advanceTimersByTimeAsync(300);
    await expect(promise).resolves.toBe('success');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onAttempt).toHaveBeenNthCalledWith(1, 1, err1);
    expect(onAttempt).toHaveBeenNthCalledWith(2, 2, err2);
  });

  it('fails all 5 attempts — rejects with last error, onAttempt called 4 times', async () => {
    let callCount = 0;
    const fn = jest.fn().mockImplementation(async () => {
      callCount++;
      throw new Error(`fail ${callCount}`);
    });
    const onAttempt = jest.fn();

    // Attach rejection handler before advancing timers so the final rejection
    // is never seen as unhandled by Node's unhandledRejection tracking.
    const promise = retryWithBackoff(fn, {
      attempts: 5,
      delaysMs: [100, 200, 400, 800],
      onAttempt,
    });
    const settled = promise.then(
      (v) => ({ ok: true as const, value: v }),
      (e: unknown) => ({ ok: false as const, error: e }),
    );

    await jest.advanceTimersByTimeAsync(1500);
    const result = await settled;

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: unknown }).error).toEqual(new Error('fail 5'));
    expect(fn).toHaveBeenCalledTimes(5);
    expect(onAttempt).toHaveBeenCalledTimes(4);
  });

  it('respects delaysMs — first failure waits 100ms, second waits 200ms', async () => {
    const err = new Error('fail');
    const fn = jest
      .fn()
      .mockImplementationOnce(async () => {
        throw err;
      })
      .mockImplementationOnce(async () => {
        throw err;
      })
      .mockResolvedValueOnce('done');

    const promise = retryWithBackoff(fn, { attempts: 3, delaysMs: [100, 200] });

    // After first failure, 100ms delay starts. Advancing 99ms — fn should NOT have been called again.
    await jest.advanceTimersByTimeAsync(99);
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance 1ms more to fire the 100ms timer — second attempt runs and fails.
    await jest.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // After second failure, 200ms delay starts. Advancing 199ms — fn should NOT have been called again.
    await jest.advanceTimersByTimeAsync(199);
    expect(fn).toHaveBeenCalledTimes(2);

    // Advance 1ms more to fire the 200ms timer — third attempt runs and succeeds.
    await jest.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('reuses last delay if delaysMs is shorter than attempts-1 — all 4 waits use 50ms', async () => {
    const fn = jest.fn().mockImplementation(async () => {
      throw new Error('fail');
    });

    const promise = retryWithBackoff(fn, { attempts: 5, delaysMs: [50] });

    // Attach rejection handler before advancing timers to prevent unhandledRejection.
    const settled = promise.then(
      (v) => ({ ok: true as const, value: v }),
      (e: unknown) => ({ ok: false as const, error: e }),
    );

    // After each failure (except the last), a 50ms wait occurs. Total waits = 4.
    // Advance 199ms — should have fired 3 timeouts (3*50=150ms) but not the 4th.
    await jest.advanceTimersByTimeAsync(199);
    expect(fn).toHaveBeenCalledTimes(4);

    // Advance 1ms more — 4th timeout fires, 5th attempt runs.
    await jest.advanceTimersByTimeAsync(1);
    const result = await settled;

    expect(result.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(5);
  });
});
