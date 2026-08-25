export interface RetryOptions {
  attempts: number;
  delaysMs: number[];
  /** Runs after a failed attempt and before the delay/retry, e.g. to refresh credentials. */
  onAttempt?: (attemptNumber: number, error: unknown) => void | Promise<void>;
}

export function retryWithBackoff<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  function run(attempt: number): Promise<T> {
    return fn().then(
      (value) => value,
      (err: unknown) => {
        const isLastAttempt = attempt >= opts.attempts;
        if (isLastAttempt) {
          return Promise.reject(err);
        }

        const delayIndex = Math.min(attempt - 1, opts.delaysMs.length - 1);
        const ms = opts.delaysMs[delayIndex];
        return Promise.resolve(opts.onAttempt?.(attempt, err))
          .then(() => new Promise<void>((r) => setTimeout(r, ms)))
          .then(() => run(attempt + 1));
      },
    );
  }

  return run(1);
}
