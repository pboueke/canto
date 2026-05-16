import { useState, useEffect } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { langNativeNames } from '@/i18n/dictionaries';
import { loadChangelog, parseVersionFromChangelog } from '@/lib/changelog';
import { loadDependencies, type DependencyInfo } from '@/lib/dependencies';
import { ThemePickerModal } from '@/components/home/ThemePickerModal';
import { LanguagePickerModal } from '@/components/home/LanguagePickerModal';
import { SecuritySettingsModal } from '@/components/home/SecuritySettingsModal';
import { DevMenu } from '@/components/dev/DevMenu';
import { webModalContent } from '@/styles/web';

const CANTO_REPO_URL = 'https://github.com/pboueke/canto';

const THEME_DISPLAY_NAMES: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  monokai: 'Monokai',
  solarized: 'Solarized',
  nord: 'Nord',
  dracula: 'Dracula',
};

type ChangelogTab = 'changelog' | 'dependencies';

interface InfoBoxProps {
  devUnlocked?: boolean;
}

export function InfoBox({ devUnlocked }: InfoBoxProps) {
  const { theme } = useTheme();
  const { lang, t } = useI18n();
  const [showChangelog, setShowChangelog] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showDevMenu, setShowDevMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [activeTab, setActiveTab] = useState<ChangelogTab>('changelog');
  const [changelog, setChangelog] = useState<string | null>(null);
  const [version, setVersion] = useState('...');
  const [dependencies] = useState<DependencyInfo[]>(() => loadDependencies());

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

  const openChangelog = () => {
    setActiveTab('changelog');
    setShowChangelog(true);
  };

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
      <Pressable
        onPress={() => setShowThemePicker(true)}
        style={styles.row}
        accessibilityRole="button"
      >
        <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}>
          {t.settings.appearance}: {THEME_DISPLAY_NAMES[theme.name] ?? theme.name}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setShowLangPicker(true)}
        style={styles.row}
        accessibilityRole="button"
      >
        <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}>
          {t.settings.language}: {langNativeNames[lang]}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setShowSecurity(true)}
        style={styles.row}
        accessibilityRole="button"
      >
        <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}>
          {t.security.title}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => Linking.openURL(CANTO_REPO_URL)}
        style={styles.row}
        accessibilityRole="link"
      >
        <Text
          style={[styles.link, { color: theme.colors.primary, fontFamily: theme.fonts.regular }]}
        >
          About Canto
        </Text>
      </Pressable>

      <View style={styles.bottomRow}>
        <Pressable onPress={openChangelog} accessibilityRole="button">
          <Text
            style={[
              styles.version,
              { color: theme.colors.textSecondary, fontFamily: theme.fonts.light },
            ]}
          >
            v{version}
          </Text>
        </Pressable>
        <Text style={[styles.version, { color: theme.colors.textSecondary }]}> · </Text>
        <Pressable onPress={() => setShowHelp(true)} accessibilityRole="button">
          <Text
            style={[
              styles.version,
              {
                color: theme.colors.textSecondary,
                fontFamily: theme.fonts.light,
                textDecorationLine: 'underline',
              },
            ]}
          >
            {t.help.title}
          </Text>
        </Pressable>
      </View>

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
              webModalContent,
              {
                backgroundColor: theme.colors.foreground,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth,
              },
            ]}
          >
            <View style={[styles.tabRow, { borderBottomColor: theme.colors.border }]}>
              <Pressable
                onPress={() => setActiveTab('changelog')}
                style={[
                  styles.tab,
                  activeTab === 'changelog' && {
                    borderBottomColor: theme.colors.primary,
                    borderBottomWidth: 2,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color:
                        activeTab === 'changelog' ? theme.colors.text : theme.colors.textSecondary,
                      fontFamily:
                        activeTab === 'changelog' ? theme.fonts.bold : theme.fonts.regular,
                    },
                  ]}
                >
                  {t.changelog.title}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab('dependencies')}
                style={[
                  styles.tab,
                  activeTab === 'dependencies' && {
                    borderBottomColor: theme.colors.primary,
                    borderBottomWidth: 2,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color:
                        activeTab === 'dependencies'
                          ? theme.colors.text
                          : theme.colors.textSecondary,
                      fontFamily:
                        activeTab === 'dependencies' ? theme.fonts.bold : theme.fonts.regular,
                    },
                  ]}
                >
                  {t.changelog.dependenciesTab}
                </Text>
              </Pressable>
            </View>

            {activeTab === 'changelog' ? (
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
            ) : (
              <ScrollView style={styles.modalScroll}>
                {dependencies.map((dep) => (
                  <View
                    key={dep.name}
                    style={[styles.depRow, { borderBottomColor: theme.colors.border }]}
                  >
                    <Text
                      style={[
                        styles.depName,
                        { color: theme.colors.text, fontFamily: theme.fonts.regular },
                      ]}
                    >
                      {dep.name}{' '}
                      <Text
                        style={{ fontFamily: theme.fonts.light, color: theme.colors.textSecondary }}
                      >
                        {dep.version}
                      </Text>
                    </Text>
                    <Text
                      style={[
                        styles.depLicense,
                        { color: theme.colors.textSecondary, fontFamily: theme.fonts.light },
                      ]}
                    >
                      {dep.license}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}

            {devUnlocked && (
              <Pressable
                onPress={() => {
                  setShowChangelog(false);
                  setShowDevMenu(true);
                }}
                style={[
                  styles.modalClose,
                  { backgroundColor: theme.colors.highlight, marginBottom: 8 },
                ]}
              >
                <Text
                  style={[
                    styles.modalCloseText,
                    { color: theme.colors.primary, fontFamily: theme.fonts.regular },
                  ]}
                >
                  Dev Menu
                </Text>
              </Pressable>
            )}
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

      <Modal
        visible={showHelp}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHelp(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              webModalContent,
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
              {t.help.title}
            </Text>
            <Text
              style={[
                styles.modalText,
                { color: theme.colors.text, fontFamily: theme.fonts.regular, marginBottom: 15 },
              ]}
            >
              {t.help.body}
            </Text>
            <Pressable
              onPress={() => Linking.openURL(`${CANTO_REPO_URL}/issues`)}
              style={[
                styles.modalClose,
                { backgroundColor: theme.colors.primary, marginBottom: 8 },
              ]}
            >
              <Text
                style={[
                  styles.modalCloseText,
                  { color: theme.colors.foreground, fontFamily: theme.fonts.bold },
                ]}
              >
                {t.help.linkText}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowHelp(false)}
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

      <DevMenu visible={showDevMenu} onClose={() => setShowDevMenu(false)} />
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
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginBottom: 15,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabText: {
    fontSize: 16,
  },
  depRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  depName: {
    fontSize: 13,
    flex: 1,
  },
  depLicense: {
    fontSize: 12,
    marginLeft: 8,
    textAlign: 'left',
    minWidth: 60,
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
