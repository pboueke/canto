/**
 * Serializes mutating LocalStore calls with device-key rotation. A rotation
 * first waits for writes already in flight, then blocks later writes until its
 * durable data transaction completes. This prevents old-device-key ciphertext
 * being committed after the rotation scan and before the fallback key can be
 * discarded.
 */
export class DeviceKeyWriteBarrier {
  private activeWriters = 0;
  private activeReaders = 0;
  private rotating = false;
  private operationsDrained: (() => void) | undefined;
  private rotationWaiters: (() => void)[] = [];

  private waitForRotation(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.rotationWaiters.push(resolve);
    });
  }

  private operationFinished(): void {
    if (this.activeWriters === 0 && this.activeReaders === 0) this.operationsDrained?.();
  }

  async read<T>(operation: () => Promise<T>): Promise<T> {
    // Enter synchronously before the first await. A rotation begun immediately
    // afterwards waits for this read instead of changing device ciphertext under
    // an active sync/preview reader.
    while (this.rotating) await this.waitForRotation();
    this.activeReaders++;
    try {
      return await operation();
    } finally {
      this.activeReaders--;
      this.operationFinished();
    }
  }

  async write<T>(operation: () => Promise<T>): Promise<T> {
    // Enter synchronously before the first await. A rotation begun immediately
    // afterwards must see this writer and wait for it rather than scan first.
    while (this.rotating) await this.waitForRotation();
    this.activeWriters++;
    try {
      return await operation();
    } finally {
      this.activeWriters--;
      this.operationFinished();
    }
  }

  async rotate<T>(operation: () => Promise<T>): Promise<T> {
    while (this.rotating) await this.waitForRotation();
    this.rotating = true;
    if (this.activeWriters > 0 || this.activeReaders > 0) {
      await new Promise<void>((resolve) => {
        this.operationsDrained = resolve;
      });
      this.operationsDrained = undefined;
    }
    try {
      return await operation();
    } finally {
      this.rotating = false;
      const waiters = this.rotationWaiters;
      this.rotationWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }
}

/** Wrap LocalStore reads and writes so a device-key rotation never races either. */
export function serializeDeviceKeyWrites<T extends object>(store: T): T {
  const barrier = new DeviceKeyWriteBarrier();
  const mutable = store as Record<string, unknown>;
  const readerMethods = new Set([
    'listJournals',
    'getJournal',
    'getPage',
    'getAttachment',
    'getAttachmentStorageSize',
    'forEachAttachmentChunk',
  ]);
  for (const [name, original] of Object.entries(mutable)) {
    if (name === 'reencryptAll') continue;
    if (typeof original !== 'function') continue;
    const guard = readerMethods.has(name)
      ? barrier.read.bind(barrier)
      : barrier.write.bind(barrier);
    mutable[name] = (...args: unknown[]) =>
      guard(() => (original as (...inner: unknown[]) => Promise<unknown>).apply(store, args));
  }
  const rotate = mutable.reencryptAll;
  if (typeof rotate === 'function') {
    mutable.reencryptAll = (...args: unknown[]) =>
      barrier.rotate(() =>
        (rotate as (...inner: unknown[]) => Promise<unknown>).apply(store, args),
      );
  }
  return store;
}
