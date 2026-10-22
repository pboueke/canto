import { Platform } from 'react-native';
import { buildDiagnosticsReport, copyDiagnosticsReport } from '../diagnostics';
import * as Clipboard from 'expo-clipboard';

const mockCollect = jest.fn();
const mockGetLocalStore = jest.fn();
const mockHasPending = jest.fn();

const mockConstants: { expoConfig?: Record<string, unknown> } = {
  expoConfig: { version: '0.21.0', android: { versionCode: 31 }, ios: { buildNumber: '7' } },
};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConstants.expoConfig;
    },
  },
}));
jest.mock('@/hooks/useStorage', () => ({ getLocalStore: () => mockGetLocalStore() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/lib/encryption/device', () => ({
  hasPendingPreviousDeviceKey: () => mockHasPending(),
}));

const originalOS = Platform.OS;
function setOS(os: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

describe('buildDiagnosticsReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setOS('android');
    mockHasPending.mockResolvedValue(false);
  });
  afterAll(() => setOS(originalOS));

  it('combines the build, the shown code, key custody, and storage counts', async () => {
    const storage = { format: 'canto-diagnostics-v1', index: 'valid' };
    mockCollect.mockResolvedValue(storage);
    mockGetLocalStore.mockResolvedValue({ collectDiagnostics: mockCollect });
    const key = new Uint8Array(32).fill(1);

    const report = JSON.parse(await buildDiagnosticsReport('LEGACY_ZERO_KEY', 'j1', key));

    expect(mockCollect).toHaveBeenCalledWith('j1', key);
    expect(report).toMatchObject({
      app: { version: '0.21.0', build: 31 },
      shownCode: 'LEGACY_ZERO_KEY',
      previousDeviceKeyPending: false,
      storage,
    });
  });

  it('still reports when the store cannot start or lacks diagnostics', async () => {
    setOS('ios');
    mockHasPending.mockRejectedValue(new Error('keychain'));
    mockGetLocalStore.mockRejectedValue(new Error('DEVICE_KEY_UNAVAILABLE'));
    const report = JSON.parse(await buildDiagnosticsReport('DEVICE_KEY_UNAVAILABLE'));
    expect(report).toMatchObject({
      app: { build: '7' },
      previousDeviceKeyPending: null,
      storage: { unavailable: true },
    });

    mockGetLocalStore.mockResolvedValue({});
    expect(JSON.parse(await buildDiagnosticsReport(null)).storage).toEqual({ unavailable: true });
  });

  it('reports nulls when the build config is unavailable', async () => {
    const saved = mockConstants.expoConfig;
    mockConstants.expoConfig = undefined;
    mockGetLocalStore.mockResolvedValue({ collectDiagnostics: mockCollect });
    mockCollect.mockResolvedValue({});
    expect(JSON.parse(await buildDiagnosticsReport(null)).app).toMatchObject({
      version: null,
      build: null,
    });
    expect(mockCollect).toHaveBeenCalledWith(undefined, undefined);
    setOS('ios');
    expect(JSON.parse(await buildDiagnosticsReport(null)).app.build).toBeNull();
    mockConstants.expoConfig = saved;
  });

  it('reports the browser user agent on web instead of a fake OS version', async () => {
    setOS('web');
    mockGetLocalStore.mockRejectedValue(new Error('no store'));
    const report = JSON.parse(await buildDiagnosticsReport(null));
    expect(report.app.os).toBe(`web ${navigator.userAgent}`);
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => undefined });
    expect(JSON.parse(await buildDiagnosticsReport(null)).app.os).toBe('web unknown');
    delete (navigator as { userAgent?: unknown }).userAgent;
  });
});

describe('copyDiagnosticsReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPending.mockResolvedValue(false);
    mockGetLocalStore.mockRejectedValue(new Error('no store'));
  });
  afterEach(() => {
    setOS(originalOS);
    delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
  });

  it('copies through expo-clipboard natively and reports a refusal', async () => {
    setOS('android');
    const copied = await copyDiagnosticsReport('CODE');
    expect(copied.copied).toBe(true);
    expect(JSON.parse(copied.report).shownCode).toBe('CODE');
    jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
    expect((await copyDiagnosticsReport('CODE')).copied).toBe(false);
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('denied'));
    expect((await copyDiagnosticsReport('CODE')).copied).toBe(false);
  });

  // The write must start within the tap, before the report is ready.
  it('starts the web clipboard write immediately with a promise of the report', async () => {
    setOS('web');
    class FakeItem {
      constructor(public items: Record<string, Promise<Blob>>) {}
    }
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = FakeItem;
    const write = jest.fn(async (items: FakeItem[]) => {
      await items[0].items['text/plain'];
    });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { write },
    });
    const pending = copyDiagnosticsReport('CODE');
    expect(write).toHaveBeenCalledTimes(1);
    const result = await pending;
    expect(result.copied).toBe(true);
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  });

  it('falls back to the plain clipboard when the web write is refused', async () => {
    setOS('web');
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {};
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async () => {
          throw new Error('NotAllowedError');
        },
      },
    });
    jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
    const result = await copyDiagnosticsReport('CODE');
    expect(result.copied).toBe(false);
    expect(result.report).toContain('CODE');
  });

  it('uses the plain clipboard on web when ClipboardItem is unavailable', async () => {
    setOS('web');
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { write: jest.fn() },
    });
    const result = await copyDiagnosticsReport('CODE');
    expect(result.copied).toBe(true);
    expect(Clipboard.setStringAsync).toHaveBeenCalled();
  });
});
