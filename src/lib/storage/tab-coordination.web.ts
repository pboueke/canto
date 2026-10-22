import { RotationBlockedError } from './device-key-rotation';

/**
 * Every browser tab shares one IndexedDB library and one device key. A
 * device-key rotation must not run while another tab could write under the
 * old key, and a tab starting up must not roll back a rotation another tab is
 * performing. Web Locks coordinate both; browsers without them fall back to
 * the single-tab behavior.
 */
const TAB_LOCK = 'canto-open-tab';
const ROTATION_LOCK = 'canto-device-key-rotation';

interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: 'shared' | 'exclusive' },
    callback: () => Promise<T>,
  ): Promise<T>;
  query(): Promise<{ held?: { name?: string }[] }>;
}

function locks(): LockManagerLike | null {
  return (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks ?? null;
}

let registered = false;

/** Hold a shared lock for this tab's lifetime so other tabs can count it. */
export function registerOpenTab(): void {
  const manager = locks();
  if (registered || !manager) return;
  registered = true;
  void manager.request(TAB_LOCK, { mode: 'shared' }, () => new Promise<never>(() => {}));
}

/** Startup recovery waits for (and never rolls back) another tab's rotation. */
export function withStartupLock<T>(operation: () => Promise<T>): Promise<T> {
  const manager = locks();
  if (!manager) return operation();
  return manager.request(ROTATION_LOCK, { mode: 'exclusive' }, operation);
}

/** Rotate only while this is the sole open tab; new tabs wait at startup. */
export function withRotationLock<T>(operation: () => Promise<T>): Promise<T> {
  const manager = locks();
  if (!manager) return operation();
  return manager.request(ROTATION_LOCK, { mode: 'exclusive' }, async () => {
    const snapshot = await manager.query();
    const openTabs = (snapshot.held ?? []).filter((lock) => lock.name === TAB_LOCK).length;
    if (openTabs > 1) {
      throw new RotationBlockedError(
        'OTHER_TABS_OPEN',
        'Canto is open in another tab; rotation refused.',
      );
    }
    return operation();
  });
}

/** @internal Reset module state for tests. */
export function _resetTabRegistration(): void {
  registered = false;
}
