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
});
