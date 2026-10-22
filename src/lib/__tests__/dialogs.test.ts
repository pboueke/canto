import { Alert, Platform } from 'react-native';
import { confirmChoice, confirmDestructive, notify } from '../dialogs';

const originalOS = Platform.OS;
function setOS(os: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

const labels = { confirm: 'Delete', cancel: 'Cancel' };

describe('dialogs', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    setOS(originalOS);
    delete (globalThis as { confirm?: unknown }).confirm;
    delete (globalThis as { alert?: unknown }).alert;
  });

  it('uses a native destructive Alert on iOS and Android', () => {
    setOS('android');
    const onConfirm = jest.fn();
    confirmDestructive('Delete page?', 'Gone for good.', labels, onConfirm);
    expect(alertSpy).toHaveBeenCalledWith('Delete page?', 'Gone for good.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // react-native-web's Alert.alert is a no-op: without this, web confirmations
  // (delete a page, discard changes) silently did nothing.
  it('asks through the browser on web and runs the action only when confirmed', () => {
    setOS('web');
    const confirm = jest.fn(() => true);
    (globalThis as { confirm?: unknown }).confirm = confirm;
    const onConfirm = jest.fn();
    confirmDestructive('Delete page?', 'Gone for good.', labels, onConfirm);
    expect(confirm).toHaveBeenCalledWith('Delete page?\n\nGone for good.');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();

    confirm.mockReturnValue(false);
    confirmDestructive('Delete page?', 'Gone for good.', labels, onConfirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('notifies through Alert natively and the browser on web', () => {
    setOS('ios');
    notify('Saved');
    notify('Error', 'disk full');
    expect(alertSpy).toHaveBeenNthCalledWith(1, 'Saved');
    expect(alertSpy).toHaveBeenNthCalledWith(2, 'Error', 'disk full');

    setOS('web');
    const browserAlert = jest.fn();
    (globalThis as { alert?: unknown }).alert = browserAlert;
    notify('Saved');
    notify('Error', 'disk full');
    expect(browserAlert).toHaveBeenNthCalledWith(1, 'Saved');
    expect(browserAlert).toHaveBeenNthCalledWith(2, 'Error\n\ndisk full');
  });

  it('does nothing on web when the browser has no dialogs', () => {
    setOS('web');
    const onConfirm = jest.fn();
    confirmDestructive('t', 'm', labels, onConfirm);
    notify('t');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('offers a two-way native choice that cannot be dismissed without choosing', () => {
    setOS('ios');
    const yes = jest.fn();
    const no = jest.fn();
    confirmChoice('Changed', 'Pick one', { confirm: 'Use draft', cancel: 'Keep saved' }, yes, no);
    expect(alertSpy).toHaveBeenCalledWith(
      'Changed',
      'Pick one',
      [
        { text: 'Keep saved', style: 'cancel', onPress: no },
        { text: 'Use draft', onPress: yes },
      ],
      { cancelable: false },
    );
  });

  it('runs exactly one choice through the browser on web, and none without a dialog', () => {
    setOS('web');
    const yes = jest.fn();
    const no = jest.fn();
    confirmChoice('t', 'm', labels, yes, no);
    expect(yes).not.toHaveBeenCalled();
    expect(no).not.toHaveBeenCalled();

    const confirm = jest.fn(() => true);
    (globalThis as { confirm?: unknown }).confirm = confirm;
    confirmChoice('t', 'm', labels, yes, no);
    expect(confirm).toHaveBeenCalledWith('t\n\nm');
    expect(yes).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(false);
    confirmChoice('t', 'm', labels, yes, no);
    expect(no).toHaveBeenCalledTimes(1);
    expect(yes).toHaveBeenCalledTimes(1);
  });
});
