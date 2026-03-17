import { useState, useEffect } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { langNativeNames } from '@/i18n/dictionaries';
import { loadChangelog, parseVersionFromChangelog } from '@/lib/changelog';
import { ThemePickerModal } from '@/components/home/ThemePickerModal';
import { LanguagePickerModal } from '@/components/home/LanguagePickerModal';
import { SecuritySettingsModal } from '@/components/home/SecuritySettingsModal';
import { AccountButton } from '@/components/home/AccountButton';

const CANTO_REPO_URL = 'https://github.com/pboueke/canto';

const THEME_DISPLAY_NAMES: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  monokai: 'Monokai',
  solarized: 'Solarized',
  nord: 'Nord',
  dracula: 'Dracula',
};

export function InfoBox() {
  const { theme } = useTheme();
  const { lang, t } = useI18n();
  const [showChangelog, setShowChangelog] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [changelog, setChangelog] = useState<string | null>(null);
  const [version, setVersion] = useState('...');

  useEffect(() => {
    loadChangelog()
      .then((text) => {
        setChangelog(text);
        setVersion(parseVersionFromChangelog(text));
      })
      .catch((err) => {
        console.error('Failed to load changelog:', err);
        setChangelog('Failed to load changelog');
      });
  }, []);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.highlight,
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidth,
        },
      ]}
    >
      <Pressable onPress={() => setShowThemePicker(true)} style={styles.row}>
        <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}>
          {t.settings.theme}: {THEME_DISPLAY_NAMES[theme.name] ?? theme.name}
        </Text>
      </Pressable>

      <Pressable onPress={() => setShowLangPicker(true)} style={styles.row}>
        <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}>
          {t.settings.language}: {langNativeNames[lang]}
        </Text>
      </Pressable>

      <Pressable onPress={() => setShowSecurity(true)} style={styles.row}>
        <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}>
          {t.security.title}
        </Text>
      </Pressable>

      <Pressable onPress={() => Linking.openURL(CANTO_REPO_URL)} style={styles.row}>
        <Text
          style={[styles.link, { color: theme.colors.primary, fontFamily: theme.fonts.regular }]}
        >
          About Canto
        </Text>
      </Pressable>

      <AccountButton />

      <Pressable onPress={() => setShowChangelog(true)} style={styles.row}>
        <Text
          style={[
            styles.version,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.light },
          ]}
        >
          v{version}
        </Text>
      </Pressable>

      <ThemePickerModal visible={showThemePicker} onClose={() => setShowThemePicker(false)} />

      <LanguagePickerModal visible={showLangPicker} onClose={() => setShowLangPicker(false)} />

      <SecuritySettingsModal visible={showSecurity} onClose={() => setShowSecurity(false)} />

      <Modal
        visible={showChangelog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChangelog(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.colors.foreground,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              Changelog
            </Text>
            <ScrollView style={styles.modalScroll}>
              <Text
                style={[
                  styles.modalText,
                  { color: theme.colors.text, fontFamily: theme.fonts.regular },
                ]}
              >
                {changelog ?? 'Loading...'}
              </Text>
            </ScrollView>
            <Pressable
              onPress={() => setShowChangelog(false)}
              style={[styles.modalClose, { backgroundColor: theme.colors.highlight }]}
            >
              <Text
                style={[
                  styles.modalCloseText,
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
    borderRadius: 5,
    padding: 10,
    alignItems: 'center',
    gap: 8,
  },
  row: {
    paddingVertical: 4,
  },
  label: {
    fontSize: 14,
  },
  link: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  version: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  modalContent: {
    borderRadius: 5,
    padding: 20,
    maxHeight: '80%',
    width: '100%',
  },
  modalTitle: {
    fontSize: 20,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalScroll: {
    marginBottom: 15,
  },
  modalText: {
    fontSize: 14,
    lineHeight: 22,
  },
  modalClose: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 14,
  },
});
