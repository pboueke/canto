import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { copyDiagnosticsReport } from '@/lib/diagnostics';

interface DiagnosticsCopyButtonProps {
  code: string | null;
  journalId?: string;
  derivedKey?: Uint8Array | null;
}

/**
 * "Copy diagnostics" for support. The copy starts inside the tap (browsers
 * reject clipboard writes that start later), the result is checked, and when
 * nothing reached the clipboard the report is shown for manual copying.
 */
export function DiagnosticsCopyButton({ code, journalId, derivedKey }: DiagnosticsCopyButtonProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [result, setResult] = useState<{ copied: boolean; report: string } | null>(null);

  const handlePress = () => {
    // No await before this call: it must run within the user gesture.
    void copyDiagnosticsReport(code, journalId, derivedKey).then(setResult);
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        onPress={handlePress}
        style={[styles.button, { backgroundColor: theme.colors.highlight }]}
      >
        <Text
          style={[styles.buttonText, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
        >
          {t.journalIntegrity.copyDiagnostics}
        </Text>
      </Pressable>
      {result?.copied && (
        <Text
          style={[
            styles.hint,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
          ]}
        >
          {t.journalIntegrity.diagnosticsCopied}
        </Text>
      )}
      {result && !result.copied && (
        <>
          <Text
            style={[styles.hint, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}
          >
            {t.journalIntegrity.diagnosticsCopyManually}
          </Text>
          <Text
            testID="diagnostics-report"
            selectable
            style={[styles.report, { color: theme.colors.text, borderColor: theme.colors.border }]}
          >
            {result.report}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  report: {
    fontFamily: 'monospace',
    fontSize: 11,
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
  },
});
