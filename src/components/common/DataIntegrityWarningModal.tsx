import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

interface DataIntegrityWarningAction {
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary' | 'destructive';
}

interface DataIntegrityWarningProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
  details: string[];
  suggestion: string;
  actions: DataIntegrityWarningAction[];
}

export function DataIntegrityWarningModal({
  visible,
  onClose,
  title,
  description,
  details,
  suggestion,
  actions,
}: DataIntegrityWarningProps) {
  const { theme } = useTheme();

  function buttonColors(variant: DataIntegrityWarningAction['variant']) {
    switch (variant) {
      case 'primary':
        return { bg: theme.colors.primary, text: theme.colors.foreground };
      case 'destructive':
        return { bg: theme.colors.error, text: '#fff' };
      case 'secondary':
      default:
        return { bg: theme.colors.highlight, text: theme.colors.text };
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Feather name="alert-triangle" size={22} color={theme.colors.error} />
            <Text
              style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
            >
              {title}
            </Text>
          </View>

          {/* Description */}
          <Text
            style={[
              styles.description,
              { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
            ]}
          >
            {description}
          </Text>

          {/* Details list */}
          {details.length > 0 && (
            <ScrollView
              style={[styles.detailsList, { borderColor: theme.colors.border }]}
              nestedScrollEnabled
            >
              {details.map((item, i) => (
                <View key={i} style={styles.detailRow}>
                  <Feather name="x-circle" size={14} color={theme.colors.error} />
                  <Text
                    style={[
                      styles.detailText,
                      { color: theme.colors.text, fontFamily: theme.fonts.regular },
                    ]}
                    numberOfLines={2}
                  >
                    {item}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Suggestion */}
          <View style={[styles.suggestionBox, { backgroundColor: theme.colors.surface }]}>
            <Feather name="info" size={14} color={theme.colors.primary} />
            <Text
              style={[
                styles.suggestionText,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
              ]}
            >
              {suggestion}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {actions.map((action, i) => {
              const colors = buttonColors(action.variant);
              return (
                <Pressable
                  key={i}
                  onPress={action.onPress}
                  style={[styles.button, { backgroundColor: colors.bg }]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      {
                        color: colors.text,
                        fontFamily:
                          action.variant === 'primary' ? theme.fonts.bold : theme.fonts.regular,
                      },
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 30,
  },
  content: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    maxHeight: '80%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    flex: 1,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  detailsList: {
    maxHeight: 200,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  detailText: {
    fontSize: 13,
    flex: 1,
  },
  suggestionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  suggestionText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
  },
});
