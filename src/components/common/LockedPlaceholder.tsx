import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';

/** Leave every journal screen for the home list, where journals are unlocked. */
function backToJournals(): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}

/**
 * Rendered by content screens in place of any journal text while a secure
 * journal is locked. It never receives or displays page data.
 */
export function LockedPlaceholder() {
  const { theme } = useTheme();
  const { t } = useI18n();

  return (
    <View
      testID="journal-locked"
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Feather name="lock" size={40} color={theme.colors.primary} />
      <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
        {t.privacy.locked}
      </Text>
      <Text
        style={[
          styles.hint,
          { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
        ]}
      >
        {t.privacy.lockedHint}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={backToJournals}
        style={[styles.button, { backgroundColor: theme.colors.primary }]}
      >
        <Text style={[styles.buttonText, { fontFamily: theme.fonts.bold }]}>
          {t.journalIntegrity.back}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  title: {
    fontSize: 18,
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
