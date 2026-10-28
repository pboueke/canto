import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyScreenCapturePolicy,
  getBlockScreenshots,
  initializePrivacy,
  setBlockScreenshots,
} from '../privacy';

const originalOS = Platform.OS;

function setOS(os: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

describe('privacy settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as { __asyncStoreClear?: () => void }).__asyncStoreClear?.();
    setOS('android');
  });

  afterAll(() => setOS(originalOS));

  it('defaults to allowing screenshots', async () => {
    expect(await getBlockScreenshots()).toBe(false);
  });

  it('persists and applies FLAG_SECURE when screenshots are blocked', async () => {
    await setBlockScreenshots(true);
    expect(await getBlockScreenshots()).toBe(true);
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledWith('canto-privacy');

    await setBlockScreenshots(false);
    expect(await getBlockScreenshots()).toBe(false);
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledWith('canto-privacy');
  });

  it('re-applies the saved policy on startup', async () => {
    await AsyncStorage.setItem('canto_block_screenshots', 'true');
    await initializePrivacy();
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalled();
    expect(ScreenCapture.enableAppSwitcherProtectionAsync).not.toHaveBeenCalled();
  });

  it('enables the native app-switcher blur on iOS', async () => {
    setOS('ios');
    await initializePrivacy();
    expect(ScreenCapture.enableAppSwitcherProtectionAsync).toHaveBeenCalledWith(1);
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled();
  });

  it('is a no-op on web', async () => {
    setOS('web');
    await applyScreenCapturePolicy(true);
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled();
  });

  it('never throws when the native module or storage fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(ScreenCapture.preventScreenCaptureAsync).mockRejectedValueOnce(new Error('x'));
    await expect(applyScreenCapturePolicy(true)).resolves.toBeUndefined();
    setOS('ios');
    jest
      .mocked(ScreenCapture.enableAppSwitcherProtectionAsync)
      .mockRejectedValueOnce(new Error('y'));
    await expect(initializePrivacy()).resolves.toBeUndefined();
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('z'));
    expect(await getBlockScreenshots()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
