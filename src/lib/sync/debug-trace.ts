const TRACE_ENABLED_KEY = 'canto:debug:sync-trace:enabled';
const TRACE_STORAGE_KEY = 'canto:debug:sync-trace:v1';
const FLUSH_INTERVAL = 25;
const MAX_EVENTS = 4_000;
const BROWSER_MEMORY_SAMPLE_INTERVAL_MS = 15_000;

type TraceEvent =
  | {
      type: 'sync';
      atMs: number;
      phase: string;
      heapBytes: number | null;
    }
  | {
      type: 'request';
      atMs: number;
      method: string;
      endpoint: string;
      /** String length or Blob byte size; payload bytes are never retained. */
      bodyChars: number | null;
      durationMs: number;
      status: number | null;
      outcome: 'response' | 'error';
    }
  | {
      type: 'memory';
      atMs: number;
      /** Total memory attributed to this browser agent, when Chrome permits it. */
      totalBytes: number | null;
      outcome: 'measured' | 'unsupported' | 'error';
    };

export interface SyncDebugTrace {
  version: 1;
  startedAt: string;
  endedAt?: string;
  events: TraceEvent[];
  droppedEvents: number;
}

let activeTrace: SyncDebugTrace | null = null;
let startedAt = 0;
let eventsSinceFlush = 0;
let lastBrowserMemorySampleAt = Number.NEGATIVE_INFINITY;
let browserMemorySampleInFlight = false;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function heapBytes(): number | null {
  if (typeof performance === 'undefined') return null;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory?.usedJSHeapSize ?? null;
}

interface UserAgentMemoryResult {
  bytes: number;
}

interface UserAgentMemoryPerformance extends Performance {
  measureUserAgentSpecificMemory?: () => Promise<UserAgentMemoryResult>;
}

function recordBrowserMemorySample(): void {
  if (!activeTrace || browserMemorySampleInFlight) return;
  const sampledAt = now();
  if (sampledAt - lastBrowserMemorySampleAt < BROWSER_MEMORY_SAMPLE_INTERVAL_MS) return;
  lastBrowserMemorySampleAt = sampledAt;

  const measure = (performance as UserAgentMemoryPerformance | undefined)
    ?.measureUserAgentSpecificMemory;
  if (typeof measure !== 'function') {
    append({
      type: 'memory',
      atMs: Math.round(sampledAt - startedAt),
      totalBytes: null,
      outcome: 'unsupported',
    });
    return;
  }

  browserMemorySampleInFlight = true;
  void measure
    .call(performance)
    .then(({ bytes }) => {
      append({
        type: 'memory',
        atMs: Math.round(now() - startedAt),
        totalBytes: Number.isFinite(bytes) ? bytes : null,
        outcome: 'measured',
      });
    })
    .catch(() => {
      append({
        type: 'memory',
        atMs: Math.round(now() - startedAt),
        totalBytes: null,
        outcome: 'error',
      });
    })
    .finally(() => {
      browserMemorySampleInFlight = false;
    });
}

function persist(): void {
  if (!activeTrace) return;
  try {
    storage()?.setItem(TRACE_STORAGE_KEY, JSON.stringify(activeTrace));
    eventsSinceFlush = 0;
  } catch {
    // Debug tracing must never affect sync if browser storage is unavailable.
  }
}

function append(event: TraceEvent): void {
  if (!activeTrace) return;
  if (activeTrace.events.length >= MAX_EVENTS) {
    activeTrace.droppedEvents++;
    return;
  }
  activeTrace.events.push(event);
  eventsSinceFlush++;
  if (eventsSinceFlush >= FLUSH_INTERVAL) persist();
}

function endpointFromUrl(input: string): string {
  try {
    return new URL(input).pathname.replace(/\/files\/[^/]+$/, '/files/:id');
  } catch {
    return 'unknown';
  }
}

function requestBodySize(body: BodyInit | null | undefined): number | null {
  if (typeof body === 'string') return body.length;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return body.size;
  return null;
}

export function isSyncDebugTraceEnabled(): boolean {
  return storage()?.getItem(TRACE_ENABLED_KEY) === '1';
}

export function setSyncDebugTraceEnabled(enabled: boolean): void {
  try {
    const target = storage();
    if (!target) return;
    if (enabled) target.setItem(TRACE_ENABLED_KEY, '1');
    else target.removeItem(TRACE_ENABLED_KEY);
  } catch {
    // Debug tracing is unavailable in this runtime.
  }
}

export function clearSyncDebugTrace(): void {
  activeTrace = null;
  eventsSinceFlush = 0;
  lastBrowserMemorySampleAt = Number.NEGATIVE_INFINITY;
  browserMemorySampleInFlight = false;
  try {
    storage()?.removeItem(TRACE_STORAGE_KEY);
  } catch {
    // Debug tracing is unavailable in this runtime.
  }
}

export function readSyncDebugTrace(): SyncDebugTrace | null {
  try {
    const raw = storage()?.getItem(TRACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncDebugTrace;
    return parsed.version === 1 && Array.isArray(parsed.events) ? parsed : null;
  } catch {
    return null;
  }
}

export function startSyncDebugTrace(): boolean {
  if (!isSyncDebugTraceEnabled()) return false;
  activeTrace = {
    version: 1,
    startedAt: new Date().toISOString(),
    events: [],
    droppedEvents: 0,
  };
  startedAt = now();
  eventsSinceFlush = 0;
  lastBrowserMemorySampleAt = Number.NEGATIVE_INFINITY;
  browserMemorySampleInFlight = false;
  recordSyncDebugPhase('started');
  return true;
}

export function recordSyncDebugPhase(phase: string): void {
  append({
    type: 'sync',
    atMs: Math.round(now() - startedAt),
    phase,
    heapBytes: heapBytes(),
  });
  recordBrowserMemorySample();
}

export function finishSyncDebugTrace(phase: 'completed' | 'failed' | 'cancelled'): void {
  if (!activeTrace) return;
  recordSyncDebugPhase(phase);
  activeTrace.endedAt = new Date().toISOString();
  persist();
  activeTrace = null;
}

export function recordDriveRequestTrace(
  input: string,
  init: RequestInit | undefined,
  startedAtMs: number,
  response?: Response,
): void {
  append({
    type: 'request',
    atMs: Math.round(now() - startedAt),
    method: init?.method ?? 'GET',
    endpoint: endpointFromUrl(input),
    bodyChars: requestBodySize(init?.body),
    durationMs: Math.round(now() - startedAtMs),
    status: response?.status ?? null,
    outcome: response ? 'response' : 'error',
  });
}
