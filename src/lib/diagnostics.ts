import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';
import { getLocalStore } from '@/hooks/useStorage';
import { hasPendingPreviousDeviceKey } from '@/lib/encryption/device';
import type { StorageDiagnostics } from '@/lib/storage/key-integrity';

/**
 * Support report a user can paste into a message. It carries the app build,
 * the integrity code being shown, and storage counts — never titles, ids,
 * paths, page content, or key material.
 */
export interface DiagnosticsReport {
  app: { version: string | null; build: string | number | null; os: string };
  shownCode: string | null;
  previousDeviceKeyPending: boolean | null;
  storage: StorageDiagnostics | { unavailable: true };
}

export async function buildDiagnosticsReport(
  shownCode: string | null,
  journalId?: string,
  derivedKey?: Uint8Array | null,
): Promise<string> {
  const config = Constants.expoConfig;
  const report: DiagnosticsReport = {
    app: {
      version: config?.version ?? null,
      build:
        Platform.OS === 'android'
          ? (config?.android?.versionCode ?? null)
          : (config?.ios?.buildNumber ?? null),
      // react-native-web reports Platform.Version as 0.0.0; the browser's
      // user agent identifies the engine and OS instead.
      os:
        Platform.OS === 'web'
          ? `web ${globalThis.navigator?.userAgent ?? 'unknown'}`
          : `${Platform.OS} ${String(Platform.Version)}`,
    },
    shownCode,
    previousDeviceKeyPending: await hasPendingPreviousDeviceKey().catch(() => null),
    storage: { unavailable: true },
  };
  try {
    const store = await getLocalStore();
    if (store.collectDiagnostics) {
      report.storage = await store.collectDiagnostics(journalId, derivedKey ?? undefined);
    }
  } catch {
    // A store that cannot start (missing device key, unreadable index) is
    // itself the finding; the code shown to the user already says which.
  }
  return JSON.stringify(report, null, 2);
}

export interface DiagnosticsCopy {
  copied: boolean;
  report: string;
}

interface ClipboardItemLike {
  new (items: Record<string, Promise<Blob>>): unknown;
}

/**
 * Build the report and put it on the clipboard. Call it directly from the tap
 * handler, before any await: on web the clipboard write must start inside the
 * user gesture, so it receives a promise of the report instead of waiting for
 * the (slow) storage scan first. `copied` is false when nothing reached the
 * clipboard; the caller then shows `report` for manual copying.
 */
export async function copyDiagnosticsReport(
  shownCode: string | null,
  journalId?: string,
  derivedKey?: Uint8Array | null,
): Promise<DiagnosticsCopy> {
  const reportPromise = buildDiagnosticsReport(shownCode, journalId, derivedKey);
  if (Platform.OS === 'web') {
    const clipboard = (
      globalThis.navigator as { clipboard?: { write?: (items: unknown[]) => Promise<void> } }
    )?.clipboard;
    const Item = (globalThis as { ClipboardItem?: ClipboardItemLike }).ClipboardItem;
    if (clipboard?.write && Item) {
      try {
        await clipboard.write([
          new Item({
            'text/plain': reportPromise.then((text) => new Blob([text], { type: 'text/plain' })),
          }),
        ]);
        return { copied: true, report: await reportPromise };
      } catch {
        // Fall through to the plain-text clipboard, then to manual copy.
      }
    }
  }
  const report = await reportPromise;
  try {
    return { copied: (await Clipboard.setStringAsync(report)) !== false, report };
  } catch {
    return { copied: false, report };
  }
}
