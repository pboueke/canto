import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { dictionaries } from '@/i18n/dictionaries';
import { AutoLockModal } from '../AutoLockModal';

const mockRouter = {
  canDismiss: jest.fn(() => true),
  dismissAll: jest.fn(),
  replace: jest.fn(),
};
const mockOrder: string[] = [];
let mockOverlay = { covered: false, locked: false };
const mockListeners = new Set<() => void>();
const mockDismissLockScreen = jest.fn(() => {
  mockOrder.push('dismissLockScreen');
  setOverlay({ locked: false });
});

function setOverlay(patch: Partial<typeof mockOverlay>) {
  mockOverlay = { ...mockOverlay, ...patch };
  for (const listener of mockListeners) listener();
}

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
      colors: { background: '#fafafa', primary: '#000', text: '#111', textSecondary: '#666' },
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

describe('AutoLockModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrder.length = 0;
    mockOverlay = { covered: false, locked: false };
    mockListeners.clear();
    mockRouter.canDismiss.mockReturnValue(true);
    mockRouter.dismissAll.mockImplementation(() => mockOrder.push('dismissAll'));
    mockRouter.replace.mockImplementation(() => mockOrder.push('replace'));
  });

  it('is the only top-level modal, shown only while locked, never translucent', () => {
    const { UNSAFE_getByType, getByTestId } = render(<AutoLockModal />);
    expect(UNSAFE_getByType(Modal).props.visible).toBe(false);
    // Covering for the app switcher never presents a modal (iOS would refuse a
    // second presentation and drop the lock screen).
    act(() => setOverlay({ covered: true }));
    expect(UNSAFE_getByType(Modal).props.visible).toBe(false);
    act(() => setOverlay({ locked: true }));
    const modal = UNSAFE_getByType(Modal);
    expect(modal.props.visible).toBe(true);
    expect(modal.props.transparent).toBeFalsy();
    expect(getByTestId('auto-lock-screen')).toBeTruthy();
  });

  it('closes the lock and resets the whole navigation stack on dismiss', () => {
    const { getByText, UNSAFE_getByType } = render(<AutoLockModal />);
    act(() => setOverlay({ locked: true }));
    fireEvent.press(getByText(t.common.confirm));
    expect(mockOrder).toEqual(['dismissLockScreen', 'dismissAll', 'replace']);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(UNSAFE_getByType(Modal).props.visible).toBe(false);
  });

  it('treats Android back as dismiss and skips dismissAll at the root', () => {
    mockRouter.canDismiss.mockReturnValue(false);
    const { UNSAFE_getByType } = render(<AutoLockModal />);
    act(() => setOverlay({ locked: true }));
    act(() => UNSAFE_getByType(Modal).props.onRequestClose());
    expect(mockRouter.dismissAll).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockDismissLockScreen).toHaveBeenCalled();
  });
});
