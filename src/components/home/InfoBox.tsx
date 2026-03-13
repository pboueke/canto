import { useState, useEffect } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import type { LangCode } from '@/i18n/dictionaries';
import { loadChangelog, parseVersionFromChangelog } from '@/lib/changelog';

const CANTO_REPO_URL = 'https://github.com/pboueke/canto';

export function InfoBox() {
  const { theme, toggleTheme, isDark } = useTheme();
  const { lang, setLang, t } = useI18n();
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelog, setChangelog] = useState<string | null>(null);
  const [version, setVersion] = useState('...');

  useEffect(() => {
    loadChangelog().then((text) => {
      setChangelog(text);
      setVersion(parseVersionFromChangelog(text));
    });
  }, []);

  const nextLang: LangCode = lang === 'en' ? 'pt' : 'en';

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
      <Pressable onPress={toggleTheme} style={styles.row}>
        <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}>
          {isDark ? t.settings.lightMode : t.settings.darkMode}
        </Text>
      </Pressable>

      <Pressable onPress={() => setLang(nextLang)} style={styles.row}>
        <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}>
          {t.settings.language}: {nextLang.toUpperCase()}
        </Text>
      </Pressable>

      <Pressable onPress={() => Linking.openURL(CANTO_REPO_URL)} style={styles.row}>
        <Text
          style={[styles.link, { color: theme.colors.primary, fontFamily: theme.fonts.regular }]}
        >
          About Canto
        </Text>
      </Pressable>

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
