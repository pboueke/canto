import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { evaluatePasswordStrength } from '@/lib/encryption/password';
import type { PasswordStrength } from '@/lib/encryption/password';

interface PasswordStrengthMeterProps {
  password: string;
}

const COLORS: Record<PasswordStrength, string> = {
  weak: '#e53935',
  fair: '#f9a825',
  strong: '#43a047',
};

const BAR_COUNT = 3;

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const { theme } = useTheme();
  const { t } = useI18n();

  if (password.length === 0) return null;

  const { strength, reasons } = evaluatePasswordStrength(password);
  const color = COLORS[strength];
  const filledBars = strength === 'weak' ? 1 : strength === 'fair' ? 2 : 3;

  const reasonLabels: Record<string, string> = {
    min8: t.passwordStrength.min8,
    min12: t.passwordStrength.min12,
    lowercase: t.passwordStrength.lowercase,
    uppercase: t.passwordStrength.uppercase,
    digit: t.passwordStrength.digit,
    special: t.passwordStrength.special,
  };

  const label =
    strength === 'weak'
      ? t.passwordStrength.weak
      : strength === 'fair'
        ? t.passwordStrength.fair
        : t.passwordStrength.strong;

  return (
    <View style={styles.container}>
      <View style={styles.barsRow}>
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                backgroundColor: i < filledBars ? color : theme.colors.border,
              },
            ]}
          />
        ))}
        <Text style={[styles.label, { color, fontFamily: theme.fonts.bold }]}>{label}</Text>
      </View>
      {reasons.length > 0 && strength !== 'strong' && (
        <Text
          style={[
            styles.hints,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.light },
          ]}
        >
          {reasons
            .slice(0, 3)
            .map((r) => reasonLabels[r] ?? r)
            .join(' · ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: -4,
    marginBottom: 10,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  label: {
    fontSize: 12,
    marginLeft: 8,
  },
  hints: {
    fontSize: 11,
    marginTop: 4,
  },
});
