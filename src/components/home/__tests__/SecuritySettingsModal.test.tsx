import React from 'react';
import { Alert, Switch } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { dictionaries } from '@/i18n/dictionaries';
import {
  RotationBlockedError,
  type RotationBlockedReason,
} from '@/lib/storage/device-key-rotation';
import { RotationInterruptedError } from '@/lib/storage/integrity';
import { SecuritySettingsModal, rotationErrorMessage } from '../SecuritySettingsModal';

const mockRotate = jest.fn();
const mockSetBlock = jest.fn(async (_value: boolean) => {});
const mockGetBlock = jest.fn(async () => false);

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@/styles/web', () => ({ webModalContent: {} }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#fff',
        foreground: '#f5f5f5',
        surface: '#fff',
        border: '#ddd',
        text: '#111',
        textSecondary: '#666',
        primary: '#000',
        highlight: '#eee',
        error: '#d00',
      },
      fonts: { regular: 'System', bold: 'System' },
    },
  }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: require('@/i18n/dictionaries').dictionaries.en }),
}));
jest.mock('@/hooks/useStorage', () => ({
  getLocalStore: async () => ({ rotateDeviceKey: (...args: unknown[]) => mockRotate(...args) }),
}));
jest.mock('@/lib/privacy', () => ({
  getBlockScreenshots: () => mockGetBlock(),
  setBlockScreenshots: (value: boolean) => mockSetBlock(value),
}));

const t = dictionaries.en;

describe('rotationErrorMessage', () => {
  it.each<[RotationBlockedReason, string]>([
    ['UNRECOVERED_DATA', t.security.rotateBlockedUnrecovered],
    ['UNREADABLE_DATA', t.security.rotateBlockedUnreadable],
    ['INSUFFICIENT_SPACE', t.security.rotateBlockedSpace],
    ['ROTATION_PENDING', t.security.rotateBlockedPending],
    ['UNSUPPORTED_DATA', t.security.rotateBlockedUnsupported],
    ['OTHER_TABS_OPEN', t.security.rotateBlockedOtherTabs],
  ])('maps %s to its localized explanation', (reason, message) => {
    expect(rotationErrorMessage(t, new RotationBlockedError(reason, 'raw /path'))).toBe(message);
  });

  it('tells the user to restart after an interrupted rotation', () => {
    expect(rotationErrorMessage(t, new RotationInterruptedError())).toBe(
      t.security.rotateInterrupted,
    );
  });

  it('never forwards raw error text', () => {
    expect(rotationErrorMessage(t, new Error('/data/user/0/secret'))).toBe(t.security.rotateFailed);
  });
});

describe('SecuritySettingsModal', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => alertSpy.mockRestore());

  async function confirmRotation(getByText: (text: string) => unknown) {
    fireEvent.press(getByText(t.security.rotateDeviceKey) as never);
    const confirm = alertSpy.mock.calls.find((call) => call[1] === t.security.rotateWarning);
    const destructive = (confirm![2] as { style?: string; onPress?: () => Promise<void> }[]).find(
      (button) => button.style === 'destructive',
    );
    await act(async () => {
      await destructive!.onPress?.();
    });
  }

  it('rotates through the store-owned cutover and reports success', async () => {
    mockRotate.mockResolvedValue(undefined);
    const { getAllByText } = render(<SecuritySettingsModal visible onClose={jest.fn()} />);
    await confirmRotation((text) => getAllByText(text).at(-1));
    expect(mockRotate).toHaveBeenCalledWith(
      expect.objectContaining({ commitKeyRotation: expect.any(Function) }),
    );
    expect(alertSpy).toHaveBeenCalledWith(t.security.rotateSuccess);
  });

  it('shows the localized reason when the rotation is refused', async () => {
    mockRotate.mockRejectedValue(new RotationBlockedError('UNRECOVERED_DATA', 'raw'));
    const { getAllByText } = render(<SecuritySettingsModal visible onClose={jest.fn()} />);
    await confirmRotation((text) => getAllByText(text).at(-1));
    expect(alertSpy).toHaveBeenCalledWith(
      t.security.rotateDeviceKey,
      t.security.rotateBlockedUnrecovered,
    );
  });

  it('persists the block-screenshots preference', async () => {
    mockGetBlock.mockResolvedValue(true);
    const { UNSAFE_getByType } = render(<SecuritySettingsModal visible onClose={jest.fn()} />);
    await waitFor(() => expect(UNSAFE_getByType(Switch).props.value).toBe(true));
    await act(async () => {
      UNSAFE_getByType(Switch).props.onValueChange(false);
    });
    expect(mockSetBlock).toHaveBeenCalledWith(false);
    expect(UNSAFE_getByType(Switch).props.value).toBe(false);
  });
});
