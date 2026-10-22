import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenCapture from 'expo-screen-capture';

const BLOCK_SCREENSHOTS_KEY = 'canto_block_screenshots';
const SCREEN_CAPTURE_KEY = 'canto-privacy';

/** Opt-in: off by default because it also blocks screenshots the user may rely on. */
export async function getBlockScreenshots(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BLOCK_SCREENSHOTS_KEY)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Android: FLAG_SECURE (blank recents thumbnail on every API level, no
 * screenshots or recordings). iOS: blocks screen recording and screenshots.
 * Web has no equivalent.
 */
export async function applyScreenCapturePolicy(block: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (block) await ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY);
    else await ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY);
  } catch (error) {
    console.warn('[Canto] Screen capture policy could not be applied:', error);
  }
}

export async function setBlockScreenshots(block: boolean): Promise<void> {
  await AsyncStorage.setItem(BLOCK_SCREENSHOTS_KEY, block ? 'true' : 'false');
  await applyScreenCapturePolicy(block);
}

/**
 * Startup privacy defaults. iOS snapshots the app for its switcher; the
 * native blur covers it before any JS can run. Android hides its recents
 * thumbnail natively (withAndroidRecentsPrivacy) and through FLAG_SECURE when
 * screenshots are blocked.
 */
export async function initializePrivacy(): Promise<void> {
  if (Platform.OS === 'ios') {
    try {
      await ScreenCapture.enableAppSwitcherProtectionAsync(1);
    } catch (error) {
      console.warn('[Canto] App switcher protection could not be enabled:', error);
    }
  }
  if (await getBlockScreenshots()) await applyScreenCapturePolicy(true);
}
