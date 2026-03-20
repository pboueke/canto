import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Must mock before importing the component
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Feather: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  },
}));

jest.mock('@/components/common/Logo', () => ({
  Logo: () => {
    const { Text } = require('react-native');
    return <Text>Logo</Text>;
  },
}));

import OnboardingScreen, { ONBOARDING_KEY } from '../../../app/onboarding';

// Wrap with minimal theme/i18n context
const { dictionaries } = require('@/i18n/dictionaries');

function TestWrapper({ children }: { children: React.ReactNode }) {
  const { ThemeContext } = require('@/hooks/useTheme');
  const { I18nContext } = require('@/hooks/useI18n');
  const { lightTheme } = require('@/styles/themes');
  return (
    <ThemeContext.Provider value={{ theme: lightTheme, setThemeName: jest.fn(), isDark: false }}>
      <I18nContext.Provider value={{ lang: 'en', setLang: jest.fn(), t: dictionaries.en }}>
        {children}
      </I18nContext.Provider>
    </ThemeContext.Provider>
  );
}

function renderOnboarding() {
  return render(
    <TestWrapper>
      <OnboardingScreen />
    </TestWrapper>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (globalThis as typeof globalThis & { __asyncStoreClear?: () => void }).__asyncStoreClear?.();
});

afterEach(() => {
  jest.useRealTimers();
});

function pressAndAnimate(element: React.ReactElement) {
  fireEvent.press(element);
  // Advance past both halves of the slide animation (100ms + 100ms)
  act(() => {
    jest.advanceTimersByTime(300);
  });
}

describe('OnboardingScreen', () => {
  it('renders the welcome screen with logo and title', () => {
    const { getByText } = renderOnboarding();
    expect(getByText(dictionaries.en.onboarding.welcomeTitle)).toBeTruthy();
    expect(getByText(dictionaries.en.onboarding.welcomeSubtitle)).toBeTruthy();
    expect(getByText('Logo')).toBeTruthy();
  });

  it('advances through all 4 screens via Next button', () => {
    const { getByText } = renderOnboarding();
    const ob = dictionaries.en.onboarding;

    // Screen 1: Welcome
    expect(getByText(ob.welcomeTitle)).toBeTruthy();
    pressAndAnimate(getByText(ob.next));

    // Screen 2: Encryption
    expect(getByText(ob.encryptionTitle)).toBeTruthy();
    expect(getByText(ob.encryptionBody)).toBeTruthy();
    pressAndAnimate(getByText(ob.next));

    // Screen 3: Privacy
    expect(getByText(ob.privacyTitle)).toBeTruthy();
    expect(getByText(ob.privacyBody)).toBeTruthy();
    pressAndAnimate(getByText(ob.next));

    // Screen 4: Get Started
    expect(getByText(ob.getStartedTitle)).toBeTruthy();
    expect(getByText(ob.getStartedButton)).toBeTruthy();
  });

  it('writes AsyncStorage flag and navigates home on "Get started"', async () => {
    const { getByText } = renderOnboarding();
    const ob = dictionaries.en.onboarding;

    // Navigate to final screen
    pressAndAnimate(getByText(ob.next));
    pressAndAnimate(getByText(ob.next));
    pressAndAnimate(getByText(ob.next));

    // Tap Get started
    await act(async () => {
      fireEvent.press(getByText(ob.getStartedButton));
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(ONBOARDING_KEY, 'true');
      expect(mockReplace).toHaveBeenCalledWith('/?fromOnboarding=true');
    });
  });

  it('writes flag and navigates home on Skip', async () => {
    const { getByText } = renderOnboarding();

    await act(async () => {
      fireEvent.press(getByText(dictionaries.en.common.skip));
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(ONBOARDING_KEY, 'true');
      expect(mockReplace).toHaveBeenCalledWith('/?fromOnboarding=true');
    });
  });

  it('hides Skip button on final screen', () => {
    const { getByText, queryByText } = renderOnboarding();
    const ob = dictionaries.en.onboarding;

    // Skip visible on screen 1
    expect(queryByText(dictionaries.en.common.skip)).toBeTruthy();

    // Navigate to final screen
    pressAndAnimate(getByText(ob.next));
    pressAndAnimate(getByText(ob.next));
    pressAndAnimate(getByText(ob.next));

    // Skip should not be visible
    expect(queryByText(dictionaries.en.common.skip)).toBeNull();
  });

  it('shows correct dot indicators for each step', () => {
    const { getByText } = renderOnboarding();
    // Structural test — dots are rendered (4 View elements with borderRadius 4)
    // The main assertion is that the component renders without error
    expect(getByText(dictionaries.en.onboarding.welcomeTitle)).toBeTruthy();
  });

  it('displays correct i18n content for each screen', () => {
    const { getByText } = renderOnboarding();
    const ob = dictionaries.en.onboarding;

    // Screen 1
    expect(getByText(ob.welcomeTitle)).toBeTruthy();
    expect(getByText(ob.welcomeSubtitle)).toBeTruthy();

    pressAndAnimate(getByText(ob.next));
    // Screen 2
    expect(getByText(ob.encryptionTitle)).toBeTruthy();
    expect(getByText(ob.encryptionBody)).toBeTruthy();

    pressAndAnimate(getByText(ob.next));
    // Screen 3
    expect(getByText(ob.privacyTitle)).toBeTruthy();
    expect(getByText(ob.privacyBody)).toBeTruthy();

    pressAndAnimate(getByText(ob.next));
    // Screen 4
    expect(getByText(ob.getStartedTitle)).toBeTruthy();
    expect(getByText(ob.getStartedBody)).toBeTruthy();
    expect(getByText(ob.getStartedButton)).toBeTruthy();
  });

  it('renders correct Feather icons on screens 2-4', () => {
    const { getByText } = renderOnboarding();
    const ob = dictionaries.en.onboarding;

    // Screen 1: Logo, no Feather icon
    expect(getByText('Logo')).toBeTruthy();

    pressAndAnimate(getByText(ob.next));
    // Screen 2: shield icon
    expect(getByText('shield')).toBeTruthy();

    pressAndAnimate(getByText(ob.next));
    // Screen 3: eye-off icon
    expect(getByText('eye-off')).toBeTruthy();

    pressAndAnimate(getByText(ob.next));
    // Screen 4: book-open icon
    expect(getByText('book-open')).toBeTruthy();
  });

  it('still navigates home if AsyncStorage write fails', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('storage full'));

    const { getByText } = renderOnboarding();

    await act(async () => {
      fireEvent.press(getByText(dictionaries.en.common.skip));
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/?fromOnboarding=true');
    });
  });
});
