import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { type LangCode, langCodes, langNativeNames } from '@/i18n/dictionaries';
import { webModalContent } from '@/styles/web';

interface LanguagePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

export function LanguagePickerModal({ visible, onClose }: LanguagePickerModalProps) {
  const { theme } = useTheme();
  const { lang, setLang, t } = useI18n();

  function handleSelect(code: LangCode) {
    setLang(code);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
            webModalContent,
            {
              backgroundColor: theme.colors.foreground,
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
            {t.settings.language}
          </Text>

          <View style={styles.list}>
            {langCodes.map((code) => {
              const isActive = lang === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => handleSelect(code)}
                  style={[
                    styles.row,
                    {
                      backgroundColor: isActive ? theme.colors.highlight : 'transparent',
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View>
                    <Text
                      style={[
                        styles.nativeName,
                        {
                          color: isActive ? theme.colors.primary : theme.colors.text,
                          fontFamily: isActive ? theme.fonts.bold : theme.fonts.regular,
                        },
                      ]}
                    >
                      {langNativeNames[code]}
                    </Text>
                    <Text
                      style={[
                        styles.code,
                        { color: theme.colors.textSecondary, fontFamily: theme.fonts.light },
                      ]}
                    >
                      {code.toUpperCase()}
                    </Text>
                  </View>
                  {isActive && <Feather name="check" size={18} color={theme.colors.primary} />}
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: theme.colors.highlight }]}
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
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    borderRadius: 10,
    padding: 20,
    width: '100%',
    maxHeight: '85%',
  },
  title: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 15,
  },
  list: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 1,
  },
  nativeName: {
    fontSize: 16,
  },
  code: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 15,
  },
  closeBtnText: {
    fontSize: 14,
  },
});
