import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useFontPrefs } from '@/contexts/FontPrefsContext';
import { type FontFamily, type FontSize, FONT_FAMILIES, FONT_SIZES } from '@/lib/font';
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
  const { fontSize, fontFamily, setFontSize, setFontFamily } = useFontPrefs();

  const activeTheme = selectedTheme ?? theme.name;
  const isGlobalSelected = showGlobalOption && selectedTheme === undefined;
  // Font controls are global app-wide preferences; hide them when this modal
  // is used as a per-journal theme override picker.
  const showFontControls = !showGlobalOption;

  const fontSizeLabels: Record<FontSize, string> = {
    small: t.settings.fontSizeSmall,
    default: t.settings.fontSizeDefault,
    large: t.settings.fontSizeLarge,
    xlarge: t.settings.fontSizeXLarge,
  };

  const fontFamilyLabels: Record<FontFamily, string> = {
    default: t.settings.fontFamilyDefault,
    dyslexic: t.settings.fontFamilyDyslexic,
    serif: t.settings.fontFamilySerif,
  };

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
            {showFontControls ? t.settings.appearance : t.settings.theme}
          </Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {showFontControls && (
              <>
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
                  ]}
                >
                  {t.settings.fontSize}
                </Text>
                <View style={styles.chipRow}>
                  {FONT_SIZES.map((size) => {
                    const isActive = fontSize === size;
                    return (
                      <Pressable
                        key={size}
                        onPress={() => setFontSize(size)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isActive ? theme.colors.primary : 'transparent',
                            borderColor: isActive ? theme.colors.primary : theme.colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: isActive ? theme.colors.foreground : theme.colors.text,
                            fontFamily: isActive ? theme.fonts.bold : theme.fonts.regular,
                            fontSize: 13,
                          }}
                        >
                          {fontSizeLabels[size]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text
                  style={[
                    styles.sectionLabel,
                    { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
                  ]}
                >
                  {t.settings.fontFamily}
                </Text>
                <View style={styles.chipRow}>
                  {FONT_FAMILIES.map((family) => {
                    const isActive = fontFamily === family;
                    return (
                      <Pressable
                        key={family}
                        onPress={() => setFontFamily(family)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isActive ? theme.colors.primary : 'transparent',
                            borderColor: isActive ? theme.colors.primary : theme.colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: isActive ? theme.colors.foreground : theme.colors.text,
                            fontFamily: isActive ? theme.fonts.bold : theme.fonts.regular,
                            fontSize: 13,
                          }}
                        >
                          {fontFamilyLabels[family]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text
                  style={[
                    styles.sectionLabel,
                    { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
                  ]}
                >
                  {t.settings.theme}
                </Text>
              </>
            )}

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
                {isGlobalSelected && (
                  <Feather name="check" size={18} color={theme.colors.primary} />
                )}
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
          </ScrollView>

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
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
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
