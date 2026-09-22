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
  /**
   * Reentrancy depth of guarded writes. A writer may call a guarded reader
   * method (deletePage -> getPage); that read must never wait for the rotation
   * that is itself waiting for the active writer, or the pair deadlocks.
   */
  private guardedWriteDepth = 0;
  /**
   * Serializes mutations (index/catalog/metadata/page/journal writes) so no
   * last-writer-wins snapshot can silently drop another committed mutation.
   * Reads are never queued behind writes; only device-key rotation is.
   */
  private mutationTail: Promise<void> = Promise.resolve();

  private isInsideGuardedWrite(): boolean {
    return this.guardedWriteDepth > 0;
  }

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
    // an active sync/preview reader. A read issued by an already-active guarded
    // writer must not wait: the rotation is waiting for that writer, so waiting
    // here would deadlock the pair.
    while (this.rotating && !this.isInsideGuardedWrite()) await this.waitForRotation();
    this.activeReaders++;
    try {
      return await operation();
    } finally {
      this.activeReaders--;
      this.operationFinished();
    }
  }

  async write<T>(operation: () => Promise<T>): Promise<T> {
    // The rotate() flag and the mutation-tail handoff both happen in one
    // synchronous block, so a rotation cannot slip between the lock check and
    // the enqueue of this mutation.
    while (this.rotating) await this.waitForRotation();
    const previous = this.mutationTail;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.mutationTail = gate;

    await previous;
    this.activeWriters++;
    this.guardedWriteDepth++;
    try {
      return await operation();
    } finally {
      this.guardedWriteDepth--;
      this.activeWriters--;
      this.operationFinished();
      release?.();
    }
  }

  async rotate<T>(operation: () => Promise<T>): Promise<T> {
    while (this.rotating) await this.waitForRotation();
    this.rotating = true;
    // Serialized mutations enqueued before the rotation flag must finish
    // before the rotation scan starts. Writes arriving after the flag wait on
    // rotationWaiters instead.
    await this.mutationTail;
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
    // Read-only recovery scan: never queued behind the mutation tail, but a
    // device-key rotation still waits for it. The confirmed restore is a
    // mutation and intentionally stays on the serialized write path.
    'scanJournalPages',
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
