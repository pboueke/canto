import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { KDF_PRESETS } from '@/lib/encryption/password';
import { webModalContent } from '@/styles/web';

interface KdfIterationPickerProps {
  value: number;
  onChange: (value: number) => void;
}

export function KdfIterationPicker({ value, onChange }: KdfIterationPickerProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [showExplain, setShowExplain] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text
          style={[
            styles.label,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
          ]}
        >
          {t.security.keyStrength}
        </Text>
        <Pressable
          style={[styles.helpButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowExplain(true)}
          hitSlop={8}
        >
          <Feather name="help-circle" size={14} color={theme.colors.foreground} />
        </Pressable>
      </View>
      <View
        style={[
          styles.pills,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        {KDF_PRESETS.map((preset) => {
          const selected = value === preset.value;
          return (
            <Pressable
              key={preset.value}
              style={[styles.pill, selected && { backgroundColor: theme.colors.primary }]}
              onPress={() => onChange(preset.value)}
            >
              <Text
                style={[
                  styles.pillText,
                  {
                    color: selected ? theme.colors.foreground : theme.colors.text,
                    fontFamily: selected ? theme.fonts.bold : theme.fonts.regular,
                  },
                ]}
              >
                {t.security.kdf[preset.label]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={showExplain}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExplain(false)}
      >
        <View style={styles.overlay}>
          <View
            style={[
              styles.explainContent,
              webModalContent,
              { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
            ]}
          >
            <Text
              style={[
                styles.explainTitle,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.security.kdfExplainTitle}
            </Text>
            <ScrollView style={styles.explainScroll}>
              <Text
                style={[
                  styles.explainBody,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.security.kdfExplainBody}
              </Text>
            </ScrollView>
            <Pressable
              style={[styles.closeBtn, { backgroundColor: theme.colors.highlight }]}
              onPress={() => setShowExplain(false)}
            >
              <Text
                style={[
                  styles.closeBtnText,
                  { color: theme.colors.text, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.common.close}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    marginLeft: 4,
    gap: 6,
  },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
  },
  helpButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pillText: {
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 30,
  },
  explainContent: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    maxHeight: '70%',
  },
  explainTitle: {
    fontSize: 18,
    marginBottom: 16,
  },
  explainScroll: {
    marginBottom: 16,
  },
  explainBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  closeBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
  },
});
