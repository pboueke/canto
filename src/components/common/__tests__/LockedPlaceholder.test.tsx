import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { dictionaries } from '@/i18n/dictionaries';
import { LockedPlaceholder } from '../LockedPlaceholder';

const mockRouter = { canDismiss: jest.fn(() => true), dismissAll: jest.fn(), replace: jest.fn() };

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: { background: '#fff', primary: '#000', text: '#111', textSecondary: '#666' },
      fonts: { regular: 'System', bold: 'System' },
    },
  }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: require('@/i18n/dictionaries').dictionaries.en }),
}));

const t = dictionaries.en;

describe('LockedPlaceholder', () => {
  beforeEach(() => jest.clearAllMocks());

  it('explains the lock and links back to the journal list', () => {
    const { getByText } = render(<LockedPlaceholder />);
    expect(getByText(t.privacy.locked)).toBeTruthy();
    expect(getByText(t.privacy.lockedHint)).toBeTruthy();
    fireEvent.press(getByText(t.journalIntegrity.back));
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('goes home without dismissing when it is already the first screen', () => {
    mockRouter.canDismiss.mockReturnValueOnce(false);
    const { getByText } = render(<LockedPlaceholder />);
    fireEvent.press(getByText(t.journalIntegrity.back));
    expect(mockRouter.dismissAll).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
