import { serializeDeviceKeyWrites } from '../write-barrier';

type Operation = () => Promise<unknown>;

/**
 * The write barrier serializes mutations (index/catalog/metadata/page/journal
 * commits) so no last-writer-wins snapshot can silently drop another committed
 * mutation, while reads are never queued behind writes.
 */
describe('serializeDeviceKeyWrites mutation queue', () => {
  function deferred<T>(): {
    promise: Promise<T>;
    resolve: (v: T) => void;
    reject: (e: unknown) => void;
  } {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  /**
   * Underlying methods execute the operation callback passed through the
   * barrier exactly like real LocalStore methods do under the wrapper.
   */
  function makeStore() {
    const run = async (operation?: Operation): Promise<unknown> => {
      if (operation) await operation();
      return undefined;
    };
    const mutate = jest.fn(run);
    // 'getPage' is a recognized reader name in the barrier; reads must never
    // be queued behind the mutation tail.
    const getPage = jest.fn(async (operation?: Operation): Promise<unknown> => {
      if (operation) await operation();
      return 'page';
    });
    const reencryptAll = jest.fn(run);
    const wrapped = serializeDeviceKeyWrites({ mutate, getPage, reencryptAll });
    return { wrapped, mutate, getPage, reencryptAll };
  }

  /** Drain the entire microtask queue (promise continuations and gate releases). */
  async function flush(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  it('runs the read-only recovery scan concurrent with mutations and serializes the confirmed restore', async () => {
    const gate = deferred<void>();
    const scanEntered = deferred<void>();
    const order: string[] = [];

    const mutateStarted = deferred<void>();
    const mutate = jest.fn(async () => {
      order.push('mutate:start');
      mutateStarted.resolve(undefined);
      await gate.promise;
      order.push('mutate:end');
    });
    const scanJournalPages = jest.fn(async (..._args: unknown[]) => {
      order.push('scan');
      scanEntered.resolve(undefined);
    });
    const restoreJournalCatalog = jest.fn(async (..._args: unknown[]) => {
      order.push('restore');
    });
    const wrapped = serializeDeviceKeyWrites({ mutate, scanJournalPages, restoreJournalCatalog });

    const mutation = wrapped.mutate();
    await mutateStarted.promise;
    const scan = wrapped.scanJournalPages('j1');
    await scanEntered.promise;
    // The read-only scan must run while the mutation is still in flight; it is
    // never queued behind the mutation tail.
    expect(order).toEqual(['mutate:start', 'scan']);

    const restore = wrapped.restoreJournalCatalog('j1');
    await flush();
    // The confirmed restore is a mutation: it waits for the active mutation to
    // drain so the published catalog cannot interleave with an in-flight write.
    expect(order).toEqual(['mutate:start', 'scan']);

    gate.resolve();
    await Promise.all([mutation, scan, restore]);
    expect(order).toEqual(['mutate:start', 'scan', 'mutate:end', 'restore']);
  });

  it('runs overlapping mutations strictly one at a time in submission order', async () => {
    const { wrapped } = makeStore();
    const order: string[] = [];
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];

    const first = wrapped.mutate(async () => {
      order.push('first:start');
      await gates[0].promise;
      order.push('first:end');
    });
    const second = wrapped.mutate(async () => {
      order.push('second:start');
      await gates[1].promise;
      order.push('second:end');
    });
    const third = wrapped.mutate(async () => {
      order.push('third:start');
      await gates[2].promise;
      order.push('third:end');
    });

    // Drain the microtask queue until the first mutation starts.
    await flush();
    expect(order).toEqual(['first:start']);
    // The second and third mutations must remain queued, not overlapped.
    expect(order).not.toContain('second:start');

    gates[0].resolve();
    await flush();
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);

    gates[1].resolve();
    gates[2].resolve();
    await Promise.all([first, second, third]);
    expect(order).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
      'third:start',
      'third:end',
    ]);
  });

  it('a failed mutation does not poison the mutations queued behind it', async () => {
    const { wrapped } = makeStore();
    const first = wrapped.mutate(async () => {
      throw new Error('first failed');
    });
    const second = wrapped.mutate(async () => 'second ok');

    await expect(first).rejects.toThrow('first failed');
    // The queued mutation still runs to completion and resolves (its value is
    // the store method's own, exactly like real LocalStore methods).
    await expect(second).resolves.toBeUndefined();
  });

  it('a rotation waits for queued mutations and blocks nothing that committed before it', async () => {
    const { wrapped } = makeStore();
    const gate = deferred<void>();
    const order: string[] = [];

    const slowMutation = wrapped.mutate(async () => {
      order.push('mutation');
      await gate.promise;
    });

    const rotation = wrapped.reencryptAll(async () => {
      order.push('rotation');
    });

    // The rotation was requested while the mutation is still queued/in flight;
    // its scan must only run after the mutation tail drains.
    gate.resolve();
    await Promise.all([slowMutation, rotation]);
    expect(order).toEqual(['mutation', 'rotation']);
  });

  it('does not serialize recognized readers behind mutations', async () => {
    const { wrapped, getPage } = makeStore();
    const gate = deferred<void>();
    const readStarted = deferred<void>();

    const mutation = wrapped.mutate(async () => {
      await gate.promise;
    });
    const reader = wrapped.getPage(async () => {
      readStarted.resolve(undefined);
      return 'page';
    });

    // The reader must enter while the mutation is still blocked.
    await readStarted.promise;
    gate.resolve();
    await Promise.all([mutation, reader]);
    expect(getPage).toHaveBeenCalled();
  });

  it('a guarded read issued inside an active writer never waits for the rotation waiting on that writer', async () => {
    const { wrapped, getPage } = makeStore();
    const gate = deferred<void>();
    const order: string[] = [];
    const readEntered = deferred<void>();

    // The writer enters the barrier, blocks on a gate, then performs an
    // internal read through the wrapped reader method (deletePage -> getPage).
    const mutation = wrapped.mutate(async () => {
      order.push('write:start');
      await gate.promise;
      const result = await wrapped.getPage(async () => {
        readEntered.resolve(undefined);
        order.push('read:ran');
        return 'page';
      });
      order.push(`write:read=${result}`);
    });

    // The rotation starts while the write is already in flight; it must wait
    // for this writer to drain before running its scan.
    const rotation = wrapped.reencryptAll(async () => {
      order.push('rotation:ran');
    });

    // Unblock the writer and wait until its internal read completed. This is
    // the exact point where the pre-fix code deadlocked: the read waited on
    // rotationWaiters while the rotation waited on the active writer.
    gate.resolve();
    await readEntered.promise;
    await Promise.all([mutation, rotation]);

    expect(order).toEqual(['write:start', 'read:ran', 'write:read=page', 'rotation:ran']);
    expect(getPage).toHaveBeenCalled();
  }, 5000);
});
