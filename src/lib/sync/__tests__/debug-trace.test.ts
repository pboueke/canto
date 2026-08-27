const storage = new Map<string, string>();

Object.defineProperty(global, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

import {
  clearSyncDebugTrace,
  finishSyncDebugTrace,
  isSyncDebugTraceEnabled,
  readSyncDebugTrace,
  recordDriveRequestTrace,
  recordSyncDebugPhase,
  setSyncDebugTraceEnabled,
  startSyncDebugTrace,
} from '../debug-trace';

describe('sync debug trace', () => {
  beforeEach(() => {
    storage.clear();
    clearSyncDebugTrace();
  });

  it('is opt-in and does not persist when disabled', () => {
    expect(isSyncDebugTraceEnabled()).toBe(false);
    startSyncDebugTrace();
    recordSyncDebugPhase('should-not-record');
    expect(readSyncDebugTrace()).toBeNull();
  });

  it('records total browser-agent memory when Chrome supports the API', async () => {
    const target = performance as Performance & {
      measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
    };
    const original = target.measureUserAgentSpecificMemory;
    Object.defineProperty(target, 'measureUserAgentSpecificMemory', {
      configurable: true,
      value: () => Promise.resolve({ bytes: 2_500_000_000 }),
    });
    try {
      setSyncDebugTraceEnabled(true);
      startSyncDebugTrace();
      await Promise.resolve();
      await Promise.resolve();
      finishSyncDebugTrace('completed');

      expect(readSyncDebugTrace()?.events).toContainEqual(
        expect.objectContaining({
          type: 'memory',
          totalBytes: 2_500_000_000,
          outcome: 'measured',
        }),
      );
    } finally {
      if (original) {
        Object.defineProperty(target, 'measureUserAgentSpecificMemory', {
          configurable: true,
          value: original,
        });
      } else {
        delete target.measureUserAgentSpecificMemory;
      }
    }
  });

  it('stores only request metadata and periodic heap samples', () => {
    setSyncDebugTraceEnabled(true);
    startSyncDebugTrace();
    recordSyncDebugPhase('attachment-chunk-uploaded');
    recordDriveRequestTrace(
      'https://www.googleapis.com/upload/drive/v3/files/private-file-id?uploadType=multipart&token=secret',
      { method: 'POST', body: 'private attachment payload' },
      performance.now() - 12,
      new Response('', { status: 200 }),
    );
    finishSyncDebugTrace('completed');

    const trace = readSyncDebugTrace();
    expect(trace).toMatchObject({ version: 1, endedAt: expect.any(String), droppedEvents: 0 });
    expect(trace?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'sync',
          phase: 'attachment-chunk-uploaded',
        }),
        expect.objectContaining({
          type: 'request',
          method: 'POST',
          endpoint: '/upload/drive/v3/files/:id',
          bodyChars: 'private attachment payload'.length,
          status: 200,
          outcome: 'response',
        }),
      ]),
    );
    expect(JSON.stringify(trace)).not.toContain('private attachment payload');
    expect(JSON.stringify(trace)).not.toContain('token=secret');
    expect(JSON.stringify(trace)).not.toContain('private-file-id');
  });

  it('records Blob body size without recording its payload', () => {
    const payload = new Blob(['private attachment payload']);
    setSyncDebugTraceEnabled(true);
    startSyncDebugTrace();
    recordDriveRequestTrace(
      'https://www.googleapis.com/upload/drive/v3/files/private-file-id?uploadType=multipart',
      { method: 'POST', body: payload },
      performance.now() - 12,
      new Response('', { status: 200 }),
    );
    finishSyncDebugTrace('completed');

    const trace = readSyncDebugTrace();
    expect(trace?.events).toContainEqual(
      expect.objectContaining({ type: 'request', bodyChars: payload.size }),
    );
    expect(JSON.stringify(trace)).not.toContain('private attachment payload');
  });

  it('records unsupported and failed memory samples without affecting tracing', async () => {
    const target = performance as Performance & {
      measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
    };
    const original = target.measureUserAgentSpecificMemory;
    Object.defineProperty(target, 'measureUserAgentSpecificMemory', {
      configurable: true,
      value: () => Promise.reject(new Error('measurement unavailable')),
    });
    try {
      setSyncDebugTraceEnabled(true);
      startSyncDebugTrace();
      await Promise.resolve();
      await Promise.resolve();
      finishSyncDebugTrace('failed');

      expect(readSyncDebugTrace()?.events).toContainEqual(
        expect.objectContaining({ type: 'memory', outcome: 'error', totalBytes: null }),
      );
    } finally {
      if (original) {
        Object.defineProperty(target, 'measureUserAgentSpecificMemory', {
          configurable: true,
          value: original,
        });
      } else {
        delete target.measureUserAgentSpecificMemory;
      }
    }
  });

  it('treats malformed stored traces and non-request payloads as safe no-op diagnostics', () => {
    storage.set('canto:debug:sync-trace:v1', '{bad json');
    expect(readSyncDebugTrace()).toBeNull();
    setSyncDebugTraceEnabled(true);
    startSyncDebugTrace();
    recordDriveRequestTrace('not a URL', { method: 'PUT' }, performance.now());
    setSyncDebugTraceEnabled(false);
    expect(isSyncDebugTraceEnabled()).toBe(false);
    finishSyncDebugTrace('cancelled');

    expect(readSyncDebugTrace()?.events).toContainEqual(
      expect.objectContaining({ endpoint: 'unknown', bodyChars: null, method: 'PUT' }),
    );
  });

  it('bounds trace memory and reports dropped events', () => {
    setSyncDebugTraceEnabled(true);
    startSyncDebugTrace();
    for (let index = 0; index < 4_001; index++) {
      recordDriveRequestTrace('https://www.googleapis.com/drive/v3/files/id', undefined, 0);
    }
    finishSyncDebugTrace('completed');

    const trace = readSyncDebugTrace();
    expect(trace?.events).toHaveLength(4_000);
    expect(trace?.droppedEvents).toBeGreaterThan(0);
  });

  it('degrades safely when browser globals are unavailable or storage throws', () => {
    const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => {
          throw new Error('storage disabled');
        },
      });
      expect(isSyncDebugTraceEnabled()).toBe(false);
      setSyncDebugTraceEnabled(true);

      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: undefined,
      });
      expect(isSyncDebugTraceEnabled()).toBe(false);
      Object.defineProperty(globalThis, 'performance', { configurable: true, value: undefined });
      // No trace is active, so completing it is intentionally a no-op.
      finishSyncDebugTrace('completed');
    } finally {
      if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
      if (originalPerformance)
        Object.defineProperty(globalThis, 'performance', originalPerformance);
    }
  });
});
