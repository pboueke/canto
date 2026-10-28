import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { Logo } from '@/components/common/Logo';

interface PrivacyShieldProps {
  /**
   * `overlay` (default) covers whatever it is rendered over: the app root or
   * a content modal. `screen` fills its container, for the lock screen modal.
   */
  variant?: 'overlay' | 'screen';
}

/**
 * Opaque privacy shield. It renders nothing while the app is active and
 * unlocked. While the app is inactive or in the background (and on resume
 * until the auto-lock decision), it hides all content behind the app logo.
 * After an auto-lock it shows the lock screen with the way back to the
 * journal list.
 *
 * It is a plain view, never its own modal: iOS presents only one modal per
 * presenter, so a shield inside every content modal (comment editor, filters,
 * settings) is what keeps their content hidden in the app switcher, on resume
 * and while locked, without competing with system sheets or the camera.
 */
export function PrivacyShield({ variant = 'overlay' }: PrivacyShieldProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { getOverlayState, subscribePrivacyCover, dismissLockScreen } = useJournalKeys();
  const overlay = useSyncExternalStore(subscribePrivacyCover, getOverlayState);

  if (!overlay.covered && !overlay.locked) return null;

  const frame = [
    variant === 'overlay' ? styles.overlay : styles.screen,
    styles.center,
    { backgroundColor: theme.colors.background },
  ];

  if (!overlay.locked) {
    return (
      <View
        testID="privacy-cover"
        style={frame}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Logo size={120} />
      </View>
    );
  }

  const dismiss = () => {
    dismissLockScreen();
    // Unmount every journal and page screen instead of only swapping the top
    // route, so no decrypted screen state survives below the home screen.
    if (router.canDismiss()) router.dismissAll();
    router.replace('/');
  };

  return (
    <View testID="auto-lock-screen" style={frame}>
      <View style={styles.content}>
        <Feather name="lock" size={40} color={theme.colors.primary} style={styles.icon} />
        <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
          {t.security.autoLockTitle}
        </Text>
        <Text
          style={[
            styles.message,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
          ]}
        >
          {t.security.autoLockMessage}
        </Text>
        <Pressable
          onPress={dismiss}
          style={[styles.button, { backgroundColor: theme.colors.primary }]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { fontFamily: theme.fonts.bold }]}>
            {t.common.confirm}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  screen: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 5,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});
