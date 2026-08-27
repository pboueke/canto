export interface StorageIoCounters {
  metadataReads: number;
  catalogReads: number;
  pageReads: number;
  decryptions: number;
  catalogRebuilds: number;
}

export type StorageIoCounter = keyof StorageIoCounters;

const counters: StorageIoCounters = {
  metadataReads: 0,
  catalogReads: 0,
  pageReads: 0,
  decryptions: 0,
  catalogRebuilds: 0,
};

function enabled(): boolean {
  return (globalThis as { __DEV__?: boolean }).__DEV__ !== false;
}

/** Development/test diagnostic seam; it neither logs nor changes storage behavior. */
export function recordStorageIo(counter: StorageIoCounter): void {
  if (enabled()) counters[counter] += 1;
}

export function getStorageIoCounters(): Readonly<StorageIoCounters> {
  return { ...counters };
}

export function resetStorageIoCounters(): void {
  for (const key of Object.keys(counters) as StorageIoCounter[]) counters[key] = 0;
}
