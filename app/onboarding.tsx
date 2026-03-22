import { useCallback, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { Logo } from '@/components/common/Logo';

export const ONBOARDING_KEY = 'canto:onboardingDone';

// In-memory fallback for when persistent storage fails (e.g. web private mode)
let onboardingDoneInMemory = false;

export function isOnboardingDone(): boolean {
  return onboardingDoneInMemory;
}

export function markOnboardingDone(): void {
  onboardingDoneInMemory = true;
}

interface OnboardingStep {
  icon?: React.ComponentProps<typeof Feather>['name'];
  iconColor: 'primary' | 'accent';
  useLogo?: boolean;
  titleKey: 'welcomeTitle' | 'encryptionTitle' | 'privacyTitle' | 'getStartedTitle';
  bodyKey: 'welcomeSubtitle' | 'encryptionBody' | 'privacyBody' | 'getStartedBody';
  isFinal?: boolean;
}

const STEPS: OnboardingStep[] = [
  { useLogo: true, iconColor: 'primary', titleKey: 'welcomeTitle', bodyKey: 'welcomeSubtitle' },
  { icon: 'shield', iconColor: 'primary', titleKey: 'encryptionTitle', bodyKey: 'encryptionBody' },
  { icon: 'eye-off', iconColor: 'primary', titleKey: 'privacyTitle', bodyKey: 'privacyBody' },
  {
    icon: 'book-open',
    iconColor: 'accent',
    titleKey: 'getStartedTitle',
    bodyKey: 'getStartedBody',
    isFinal: true,
  },
];

const ANIMATION_DURATION = 200;

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const completeOnboarding = useCallback(async () => {
    markOnboardingDone();
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {
      // AsyncStorage may fail on web (private mode); in-memory flag prevents redirect loop
    }
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(ONBOARDING_KEY, 'true');
      } catch {
        // localStorage may be unavailable; in-memory flag is the last resort
      }
    }
    router.replace('/?fromOnboarding=true');
  }, [router]);

  const goToStep = useCallback(
    (nextStep: number) => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION / 2,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -30,
          duration: ANIMATION_DURATION / 2,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setStep(nextStep);
        slideAnim.setValue(30);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: ANIMATION_DURATION / 2,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: ANIMATION_DURATION / 2,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [fadeAnim, slideAnim],
  );

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      goToStep(step + 1);
    }
  }, [step, goToStep]);

  const current = STEPS[step];
  const stepLabel = t.onboarding.stepOf
    .replace('{step}', String(step + 1))
    .replace('{total}', String(STEPS.length));

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      {/* Skip button — hidden on final screen */}
      {!current.isFinal && (
        <Pressable
          onPress={completeOnboarding}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel={t.common.skip}
          hitSlop={12}
        >
          <Text
            style={[
              styles.skipText,
              { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
            ]}
          >
            {t.common.skip}
          </Text>
        </Pressable>
      )}

      {/* Content area */}
      <Animated.View
        style={[styles.content, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}
        accessibilityLabel={stepLabel}
      >
        {/* Icon or Logo */}
        <View style={styles.iconContainer}>
          {current.useLogo ? (
            <Logo size={120} />
          ) : (
            <Feather
              name={current.icon!}
              size={64}
              color={current.iconColor === 'accent' ? theme.colors.accent : theme.colors.primary}
            />
          )}
        </View>

        {/* Title */}
        <Text
          style={[
            styles.title,
            {
              color: theme.colors.text,
              fontFamily: theme.fonts.serifBold,
              fontSize: current.useLogo ? 28 : 24,
            },
          ]}
        >
          {t.onboarding[current.titleKey]}
        </Text>

        {/* Body */}
        <Text
          style={[
            styles.body,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
          ]}
        >
          {t.onboarding[current.bodyKey]}
        </Text>
      </Animated.View>

      {/* Bottom area: button + dots */}
      <View style={styles.bottomArea}>
        <Pressable
          onPress={current.isFinal ? completeOnboarding : handleNext}
          style={[
            styles.button,
            {
              backgroundColor: current.isFinal ? theme.colors.accent : theme.colors.primary,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={current.isFinal ? t.onboarding.getStartedButton : t.onboarding.next}
        >
          <Text style={[styles.buttonText, { fontFamily: theme.fonts.bold }]}>
            {current.isFinal ? t.onboarding.getStartedButton : t.onboarding.next}
          </Text>
        </Pressable>

        {/* Dot indicators */}
        <View style={styles.dots} accessibilityLabel={stepLabel}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === step ? theme.colors.primary : theme.colors.border,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
  },
  skipButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 15,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  iconContainer: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 34,
  },
  body: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  bottomArea: {
    alignItems: 'center',
    gap: 20,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 5,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
