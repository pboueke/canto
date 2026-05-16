export interface RetryOptions {
  attempts: number;
  delaysMs: number[];
  onAttempt?: (attemptNumber: number, error: unknown) => void;
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

        opts.onAttempt?.(attempt, err);

        const delayIndex = Math.min(attempt - 1, opts.delaysMs.length - 1);
        const ms = opts.delaysMs[delayIndex];
        return new Promise<void>((r) => setTimeout(r, ms)).then(() => run(attempt + 1));
      },
    );
  }

  return run(1);
}
