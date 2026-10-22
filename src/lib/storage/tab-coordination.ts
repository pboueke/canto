/**
 * Native apps run one JavaScript instance against their storage, so there is
 * nothing to coordinate. See tab-coordination.web.ts for browsers.
 */
export function registerOpenTab(): void {}

export function withStartupLock<T>(operation: () => Promise<T>): Promise<T> {
  return operation();
}

export function withRotationLock<T>(operation: () => Promise<T>): Promise<T> {
  return operation();
}
