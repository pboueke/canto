import {
  _resetTabRegistration,
  registerOpenTab,
  withRotationLock,
  withStartupLock,
} from '../tab-coordination.web';
import * as native from '../tab-coordination';

/** Minimal Web Locks: shared locks coexist, exclusive locks queue per name. */
function createLockManager() {
  const held: { name: string; mode: string }[] = [];
  const tails = new Map<string, Promise<unknown>>();
  return {
    held,
    async request<T>(
      name: string,
      options: { mode: 'shared' | 'exclusive' },
      callback: () => Promise<T>,
    ): Promise<T> {
      const entry = { name, mode: options.mode };
      if (options.mode === 'shared') {
        held.push(entry);
        return callback();
      }
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(async () => {
        held.push(entry);
        try {
          return await callback();
        } finally {
          held.splice(held.indexOf(entry), 1);
        }
      });
      tails.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
    async query() {
      return { held: [...held] };
    },
  };
}

function setLocks(manager: unknown) {
  Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: manager });
}

describe('web tab coordination', () => {
  afterEach(() => {
    setLocks(undefined);
    _resetTabRegistration();
  });

  it('runs operations directly when the browser has no Web Locks', async () => {
    setLocks(undefined);
    registerOpenTab();
    await expect(withStartupLock(async () => 'started')).resolves.toBe('started');
    await expect(withRotationLock(async () => 'rotated')).resolves.toBe('rotated');
  });

  it('registers this tab once and rotates while it is the only tab', async () => {
    const manager = createLockManager();
    setLocks(manager);
    registerOpenTab();
    registerOpenTab();
    expect(manager.held.filter((lock) => lock.name === 'canto-open-tab')).toHaveLength(1);
    await expect(withRotationLock(async () => 'rotated')).resolves.toBe('rotated');
  });

  it('refuses to rotate while another tab is open', async () => {
    const manager = createLockManager();
    setLocks(manager);
    registerOpenTab();
    manager.held.push({ name: 'canto-open-tab', mode: 'shared' }); // the other tab
    const rotation = jest.fn(async () => {});
    await expect(withRotationLock(rotation)).rejects.toMatchObject({ reason: 'OTHER_TABS_OPEN' });
    expect(rotation).not.toHaveBeenCalled();
  });

  it('makes a starting tab wait for a running rotation instead of interleaving', async () => {
    const manager = createLockManager();
    setLocks(manager);
    registerOpenTab();
    const order: string[] = [];
    let finishRotation!: () => void;
    const rotation = withRotationLock(async () => {
      order.push('rotation-start');
      await new Promise<void>((resolve) => {
        finishRotation = resolve;
      });
      order.push('rotation-end');
    });
    await Promise.resolve();
    const startup = withStartupLock(async () => {
      order.push('startup');
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['rotation-start']);
    finishRotation();
    await Promise.all([rotation, startup]);
    expect(order).toEqual(['rotation-start', 'rotation-end', 'startup']);
  });

  it('is a pass-through on native', async () => {
    native.registerOpenTab();
    await expect(native.withStartupLock(async () => 1)).resolves.toBe(1);
    await expect(native.withRotationLock(async () => 2)).resolves.toBe(2);
  });

  it('treats a lock snapshot without holders as a single tab', async () => {
    setLocks({
      request: async (_name: string, _options: unknown, callback: () => Promise<unknown>) =>
        callback(),
      query: async () => ({}),
    });
    await expect(withRotationLock(async () => 'rotated')).resolves.toBe('rotated');
  });
});
