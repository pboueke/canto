import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@/styles/web', () => ({
  webModalContent: {},
}));

jest.mock('@/lib/encryption/ratelimit', () => ({
  createUnlockRateLimiter: () => ({
    attempt: jest.fn().mockResolvedValue(true),
    reset: jest.fn().mockResolvedValue(undefined),
  }),
}));

import { JournalAccessModal } from '../JournalAccessModal';
import { dictionaries } from '@/i18n/dictionaries';

const tDict = dictionaries.en;

function Wrapper({ children }: { children: React.ReactNode }) {
  const { ThemeContext } = require('@/hooks/useTheme');
  const { I18nContext } = require('@/hooks/useI18n');
  const { lightTheme } = require('@/styles/themes');
  return (
    <ThemeContext.Provider value={{ theme: lightTheme, setThemeName: jest.fn(), isDark: false }}>
      <I18nContext.Provider value={{ lang: 'en', setLang: jest.fn(), t: tDict }}>
        {children}
      </I18nContext.Provider>
    </ThemeContext.Provider>
  );
}

describe('JournalAccessModal', () => {
  it('shows the decrypting label after the user submits a password', async () => {
    const onUnlock = jest.fn(() => new Promise<void>(() => {}));
    const { getByPlaceholderText, getByText, queryByText } = render(
      <Wrapper>
        <JournalAccessModal
          visible
          journalTitle="My Journal"
          onClose={jest.fn()}
          onUnlock={onUnlock}
        />
      </Wrapper>,
    );

    expect(queryByText(tDict.home.decrypting)).toBeNull();

    fireEvent.changeText(getByPlaceholderText(tDict.home.password), 'hunter2');
    fireEvent.press(getByText(tDict.common.open));

    await waitFor(() => {
      expect(getByText(tDict.home.decrypting)).toBeTruthy();
    });
    expect(queryByText(tDict.common.loading)).toBeNull();
  });
});
