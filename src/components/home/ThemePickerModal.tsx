import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { type ThemeName, themes, themeNames } from '@/styles/themes';
import { webModalContent } from '@/styles/web';

interface ThemePickerModalProps {
  visible: boolean;
  onClose: () => void;
  showGlobalOption?: boolean;
  selectedTheme?: ThemeName;
  onSelect?: (name: ThemeName | null) => void;
}

const THEME_DISPLAY_NAMES: Record<ThemeName, string> = {
  light: 'Light',
  dark: 'Dark',
  monokai: 'Monokai',
  solarized: 'Solarized',
  nord: 'Nord',
  dracula: 'Dracula',
  everforest: 'Everforest',
  rosepine: 'Rosé Pine',
  onecyan: 'One Cyan',
  gruvbox: 'Gruvbox',
};

function ThemePreview({ name, isActive }: { name: ThemeName; isActive: boolean }) {
  const t = themes[name];
  return (
    <View
      style={[
        styles.preview,
        {
          backgroundColor: t.colors.background,
          borderColor: isActive ? t.colors.primary : t.colors.border,
          borderWidth: isActive ? 3 : 1,
        },
      ]}
    >
      <View style={[styles.previewHeader, { backgroundColor: t.colors.headerBackground }]}>
        <View style={[styles.previewDot, { backgroundColor: t.colors.primary }]} />
        <View style={[styles.previewDot, { backgroundColor: t.colors.accent }]} />
        <View style={[styles.previewDot, { backgroundColor: t.colors.error }]} />
      </View>
      <View style={styles.previewBody}>
        <View style={[styles.previewSidebar, { backgroundColor: t.colors.foreground }]} />
        <View style={styles.previewContent}>
          <View style={[styles.previewLine, { backgroundColor: t.colors.text, width: '80%' }]} />
          <View
            style={[styles.previewLine, { backgroundColor: t.colors.textSecondary, width: '60%' }]}
          />
          <View style={[styles.previewLine, { backgroundColor: t.colors.primary, width: '40%' }]} />
        </View>
      </View>
    </View>
  );
}

export function ThemePickerModal({
  visible,
  onClose,
  showGlobalOption,
  selectedTheme,
  onSelect,
}: ThemePickerModalProps) {
  const { theme, setThemeName } = useTheme();
  const { t } = useI18n();

  const activeTheme = selectedTheme ?? theme.name;
  const isGlobalSelected = showGlobalOption && selectedTheme === undefined;

  function handleSelect(name: ThemeName) {
    if (onSelect) {
      onSelect(name);
    } else {
      setThemeName(name);
    }
    onClose();
  }

  function handleGlobal() {
    if (onSelect) {
      onSelect(null);
    }
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
            {t.settings.theme}
          </Text>

          {showGlobalOption && (
            <Pressable
              onPress={handleGlobal}
              style={[
                styles.globalOption,
                {
                  backgroundColor: isGlobalSelected ? theme.colors.highlight : 'transparent',
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.globalText,
                  { color: theme.colors.text, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.journalSettings.useGlobalTheme}
              </Text>
              {isGlobalSelected && <Feather name="check" size={18} color={theme.colors.primary} />}
            </Pressable>
          )}

          <View style={styles.grid}>
            {themeNames.map((name) => {
              const isActive = !isGlobalSelected && activeTheme === name;
              return (
                <Pressable key={name} onPress={() => handleSelect(name)} style={styles.item}>
                  <ThemePreview name={name} isActive={isActive} />
                  <View style={styles.labelRow}>
                    <Text
                      style={[
                        styles.label,
                        {
                          color: isActive ? theme.colors.primary : theme.colors.text,
                          fontFamily: isActive ? theme.fonts.bold : theme.fonts.regular,
                        },
                      ]}
                    >
                      {THEME_DISPLAY_NAMES[name]}
                    </Text>
                    {isActive && <Feather name="check" size={14} color={theme.colors.primary} />}
                  </View>
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
  globalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  globalText: {
    fontSize: 15,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  item: {
    width: '47%',
    alignItems: 'center',
    marginBottom: 8,
  },
  preview: {
    width: '100%',
    height: 70,
    borderRadius: 6,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  previewBody: {
    flex: 1,
    flexDirection: 'row',
  },
  previewSidebar: {
    width: '25%',
    height: '100%',
  },
  previewContent: {
    flex: 1,
    padding: 6,
    gap: 4,
    justifyContent: 'center',
  },
  previewLine: {
    height: 4,
    borderRadius: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  label: {
    fontSize: 13,
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
