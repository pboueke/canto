import { Alert, Platform } from 'react-native';

/**
 * react-native-web implements Alert.alert as a no-op, so a confirmation with
 * buttons never appears and its action never runs on web. These helpers keep
 * the native Alert dialogs unchanged and use the browser's dialogs on web.
 */

export interface ConfirmLabels {
  confirm: string;
  cancel: string;
}

/** Ask before a destructive action; `onConfirm` runs only when the user agrees. */
export function confirmDestructive(
  title: string,
  message: string,
  labels: ConfirmLabels,
  onConfirm: () => void | Promise<void>,
): void {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) void onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: labels.cancel, style: 'cancel' },
    { text: labels.confirm, style: 'destructive', onPress: onConfirm },
  ]);
}

/** Ask the user to pick between two outcomes; exactly one callback runs. */
export function confirmChoice(
  title: string,
  message: string,
  labels: ConfirmLabels,
  onConfirm: () => void,
  onCancel: () => void,
): void {
  if (Platform.OS === 'web') {
    // Without a browser dialog neither outcome is chosen.
    const ask = globalThis.confirm;
    if (!ask) return;
    if (ask(`${title}\n\n${message}`)) onConfirm();
    else onCancel();
    return;
  }
  Alert.alert(
    title,
    message,
    [
      { text: labels.cancel, style: 'cancel', onPress: onCancel },
      { text: labels.confirm, onPress: onConfirm },
    ],
    { cancelable: false },
  );
}

/** Show a short message the user acknowledges. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
    return;
  }
  if (message === undefined) Alert.alert(title);
  else Alert.alert(title, message);
}
