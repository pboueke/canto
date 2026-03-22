import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

jest.mock('@/lib/changelog', () => ({
  loadChangelog: jest.fn().mockResolvedValue('## 0.16.0\n- stuff'),
  parseVersionFromChangelog: jest.fn().mockReturnValue('0.16.0'),
}));

jest.mock('@/lib/dependencies', () => ({
  loadDependencies: jest.fn().mockReturnValue([
    { name: 'react', version: '19.2.0', license: 'MIT' },
    { name: 'expo', version: '55.0.0', license: 'MIT' },
  ]),
}));

jest.mock('@/components/home/ThemePickerModal', () => ({
  ThemePickerModal: () => null,
}));

jest.mock('@/components/home/LanguagePickerModal', () => ({
  LanguagePickerModal: () => null,
}));

jest.mock('@/components/home/SecuritySettingsModal', () => ({
  SecuritySettingsModal: () => null,
}));

jest.mock('@/components/dev/DevMenu', () => ({
  DevMenu: () => null,
}));

jest.mock('@/styles/web', () => ({
  webModalContent: {},
}));

import { InfoBox } from '../InfoBox';
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

function renderInfoBox(props: { devUnlocked?: boolean } = {}) {
  return render(
    <Wrapper>
      <InfoBox {...props} />
    </Wrapper>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('InfoBox - Help button', () => {
  it('renders the help button with the help title text', async () => {
    const { getByText } = renderInfoBox();
    await waitFor(() => {
      expect(getByText(tDict.help.title)).toBeTruthy();
    });
  });

  it('opens the help modal when the help button is pressed', async () => {
    const { getByText, queryAllByText } = renderInfoBox();

    await waitFor(() => {
      expect(getByText(tDict.help.title)).toBeTruthy();
    });

    // Press the help button (the first occurrence of help title text)
    fireEvent.press(getByText(tDict.help.title));

    // The modal should now show the help body text
    await waitFor(() => {
      expect(queryAllByText(tDict.help.body).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('contains a GitHub issues link button in the help modal', async () => {
    const { getByText } = renderInfoBox();

    await waitFor(() => {
      expect(getByText(tDict.help.title)).toBeTruthy();
    });

    // Open help modal
    fireEvent.press(getByText(tDict.help.title));

    await waitFor(() => {
      expect(getByText(tDict.help.linkText)).toBeTruthy();
    });

    // Find and press the link button
    const linkButton = getByText(tDict.help.linkText);
    fireEvent.press(linkButton);
    expect(Linking.openURL).toHaveBeenCalledWith('https://github.com/pboueke/canto/issues');
  });
});

describe('InfoBox - Changelog modal tabs', () => {
  it('opens changelog modal on Changelog tab by default', async () => {
    const { getByText } = renderInfoBox();

    await waitFor(() => {
      expect(getByText('v0.16.0')).toBeTruthy();
    });

    fireEvent.press(getByText('v0.16.0'));

    await waitFor(() => {
      expect(getByText(tDict.changelog.title)).toBeTruthy();
      expect(getByText(tDict.changelog.dependenciesTab)).toBeTruthy();
      // Changelog content should be visible
      expect(getByText('## 0.16.0\n- stuff')).toBeTruthy();
    });
  });

  it('switches to Dependencies tab and shows dependency list', async () => {
    const { getByText } = renderInfoBox();

    await waitFor(() => {
      expect(getByText('v0.16.0')).toBeTruthy();
    });

    fireEvent.press(getByText('v0.16.0'));

    await waitFor(() => {
      expect(getByText(tDict.changelog.dependenciesTab)).toBeTruthy();
    });

    fireEvent.press(getByText(tDict.changelog.dependenciesTab));

    await waitFor(() => {
      expect(getByText('19.2.0')).toBeTruthy();
      expect(getByText('55.0.0')).toBeTruthy();
    });
  });
});
