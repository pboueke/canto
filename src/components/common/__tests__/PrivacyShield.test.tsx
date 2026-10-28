import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { dictionaries } from '@/i18n/dictionaries';
import { PrivacyShield } from '../PrivacyShield';

const mockRouter = { canDismiss: jest.fn(() => false), dismissAll: jest.fn(), replace: jest.fn() };
let mockOverlay = { covered: false, locked: false };
const mockListeners = new Set<() => void>();
const mockDismissLockScreen = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@/components/common/Logo', () => ({ Logo: () => null }));
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: { background: '#123456', primary: '#000', text: '#111', textSecondary: '#666' },
      fonts: { regular: 'System', bold: 'System' },
    },
  }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: require('@/i18n/dictionaries').dictionaries.en }),
}));
jest.mock('@/contexts/JournalKeyContext', () => ({
  useJournalKeys: () => ({
    getOverlayState: () => mockOverlay,
    subscribePrivacyCover: (listener: () => void) => {
      mockListeners.add(listener);
      return () => mockListeners.delete(listener);
    },
    dismissLockScreen: mockDismissLockScreen,
  }),
}));

const t = dictionaries.en;

function setOverlay(next: typeof mockOverlay) {
  mockOverlay = next;
  for (const listener of mockListeners) listener();
}

describe('PrivacyShield', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOverlay = { covered: false, locked: false };
    mockListeners.clear();
  });

  it('renders nothing while the app is active and unlocked', () => {
    const { toJSON } = render(<PrivacyShield />);
    expect(toJSON()).toBeNull();
  });

  it('hides everything behind an opaque, inaccessible logo view while covered', () => {
    const { getByTestId } = render(<PrivacyShield />);
    act(() => setOverlay({ covered: true, locked: false }));
    const cover = getByTestId('privacy-cover', { includeHiddenElements: true });
    expect(cover.props.importantForAccessibility).toBe('no-hide-descendants');
    const style = StyleSheet.flatten(cover.props.style);
    expect(style).toMatchObject({ position: 'absolute', backgroundColor: '#123456' });
  });

  it('shows the lock screen with the way back to the journal list while locked', () => {
    const { getByText, getByTestId } = render(<PrivacyShield variant="screen" />);
    act(() => setOverlay({ covered: true, locked: true }));
    expect(StyleSheet.flatten(getByTestId('auto-lock-screen').props.style).flex).toBe(1);
    expect(getByText(t.security.autoLockTitle)).toBeTruthy();
    fireEvent.press(getByText(t.common.confirm));
    expect(mockDismissLockScreen).toHaveBeenCalled();
    expect(mockRouter.dismissAll).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');

    mockRouter.canDismiss.mockReturnValueOnce(true);
    fireEvent.press(getByText(t.common.confirm));
    expect(mockRouter.dismissAll).toHaveBeenCalled();
  });
});
