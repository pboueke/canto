import React from 'react';
import { render } from '@testing-library/react-native';
import { ChangePasswordModal } from '../ChangePasswordModal';
import { dictionaries } from '@/i18n/dictionaries';

jest.mock('@/styles/web', () => ({
  webModalContent: {},
}));

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

const t = dictionaries.en;

function Wrapper({ children }: { children: React.ReactNode }) {
  const { ThemeContext } = require('@/hooks/useTheme');
  const { I18nContext } = require('@/hooks/useI18n');
  const { lightTheme } = require('@/styles/themes');
  return (
    <ThemeContext.Provider value={{ theme: lightTheme, setThemeName: jest.fn(), isDark: false }}>
      <I18nContext.Provider value={{ lang: 'en', setLang: jest.fn(), t }}>
        {children}
      </I18nContext.Provider>
    </ThemeContext.Provider>
  );
}

describe('ChangePasswordModal', () => {
  it('lists files that remain outside the journal password layer', () => {
    const { getByText } = render(
      <Wrapper>
        <ChangePasswordModal
          visible
          isSecure={false}
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
          result={{
            skippedAttachments: [
              { name: 'recording.mp4', size: 80 * 1024 * 1024 },
              { name: 'large-image.png', size: 33 * 1024 * 1024 },
            ],
          }}
        />
      </Wrapper>,
    );

    expect(getByText('Password protection updated with exceptions')).toBeTruthy();
    expect(getByText('recording.mp4 (80.0 MB)')).toBeTruthy();
    expect(getByText('large-image.png (33.0 MB)')).toBeTruthy();
    expect(
      getByText(/remain device-encrypted but are not protected by this journal password/i),
    ).toBeTruthy();
  });
});
