import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useJournals } from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import {
  duplicateJournal,
  duplicatePage,
  generateBlankJournals,
  generateBlankPages,
  wipeAllData,
} from '@/lib/devTools';
import type { Journal, Page } from '@/data';
import { webModalContent } from '@/styles/web';

interface DevMenuProps {
  visible: boolean;
  onClose: () => void;
}

export function DevMenu({ visible, onClose }: DevMenuProps) {
  const { theme } = useTheme();
  const { journals } = useJournals();
  const { getKey, deriveAndCache } = useJournalKeys();

  const [count, setCount] = useState('1');
  const [selectedJournal, setSelectedJournal] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [running, setRunning] = useState(false);
  const [showJournalPicker, setShowJournalPicker] = useState(false);
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [pickerAction, setPickerAction] = useState<string | null>(null);

  const getCount = () => Math.max(1, parseInt(count, 10) || 1);

  const ensureKey = async (journal: Journal): Promise<Uint8Array | undefined> => {
    const cached = getKey(journal.id);
    if (cached) return cached;
    if (journal.salt && !journal.secure) {
      return deriveAndCache(journal.id, '', journal.salt, journal.kdfIterations);
    }
    return undefined;
  };

  const loadPages = async (journal: Journal) => {
    try {
      const { getLocalStore } = await import('@/hooks/useStorage');
      const store = await getLocalStore();
      const derivedKey = await ensureKey(journal);
      const content = await store.getJournal(journal.id, derivedKey);
      if (content) {
        setPages(content.pages.filter((p) => !p.deleted));
      }
    } catch {
      setPages([]);
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const showConfirm = (title: string, message: string): boolean => {
    if (Platform.OS === 'web') {
      return window.confirm(`${title}\n\n${message}`);
    }
    // Native uses Alert.alert with callbacks — not used in this path
    return false;
  };

  const runAction = async (action: () => Promise<void>, label: string) => {
    setRunning(true);
    try {
      await action();
      showAlert('Success', `${label} completed`);
    } catch (err) {
      showAlert('Error', String(err));
    } finally {
      setRunning(false);
    }
  };

  const handleDuplicateJournal = () => {
    setPickerAction('duplicateJournal');
    setShowJournalPicker(true);
  };

  const handleDuplicatePage = () => {
    setPickerAction('duplicatePage');
    setShowJournalPicker(true);
  };

  const handleGenerateJournals = () => {
    runAction(
      () => generateBlankJournals(getCount()).then(() => {}),
      `Generated ${getCount()} blank journals`,
    );
  };

  const handleGeneratePages = () => {
    setPickerAction('generatePages');
    setShowJournalPicker(true);
  };

  const handleWipeAll = () => {
    if (Platform.OS === 'web') {
      const first = showConfirm(
        'Wipe All Data',
        'This will permanently delete ALL journals, pages, and attachments from this device. This cannot be undone.',
      );
      if (!first) return;
      const second = showConfirm(
        'Are you sure?',
        'Last chance. All local data will be permanently destroyed.',
      );
      if (!second) return;
      runAction(() => wipeAllData(), 'Wiped all data');
    } else {
      Alert.alert(
        'Wipe All Data',
        'This will permanently delete ALL journals, pages, and attachments from this device. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete Everything',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Are you sure?',
                'Last chance. All local data will be permanently destroyed.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Yes, wipe all data',
                    style: 'destructive',
                    onPress: () => {
                      runAction(() => wipeAllData(), 'Wiped all data');
                    },
                  },
                ],
              );
            },
          },
        ],
      );
    }
  };

  const handleJournalSelected = async (journal: Journal) => {
    setSelectedJournal(journal.id);
    setShowJournalPicker(false);
    const derivedKey = await ensureKey(journal);

    if (pickerAction === 'duplicateJournal') {
      runAction(
        () => duplicateJournal(journal.id, derivedKey, getCount()).then(() => {}),
        `Duplicated journal "${journal.title}" ${getCount()} times`,
      );
    } else if (pickerAction === 'duplicatePage') {
      await loadPages(journal);
      setShowPagePicker(true);
    } else if (pickerAction === 'generatePages') {
      runAction(
        () => generateBlankPages(journal.id, getCount(), derivedKey).then(() => {}),
        `Generated ${getCount()} blank pages`,
      );
    }
  };

  const handlePageSelected = async (page: Page) => {
    setShowPagePicker(false);
    if (!selectedJournal) return;
    const journal = journals.find((j) => j.id === selectedJournal);
    const derivedKey = journal ? await ensureKey(journal) : undefined;
    runAction(
      () => duplicatePage(selectedJournal, page.id, derivedKey, getCount()).then(() => {}),
      `Duplicated page ${getCount()} times`,
    );
  };

  const buttonStyle = [styles.actionButton, { backgroundColor: theme.colors.highlight }];

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
            Developer Menu
          </Text>

          {running && (
            <View style={styles.runningContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text
                style={[
                  styles.runningText,
                  { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                ]}
              >
                Working...
              </Text>
            </View>
          )}

          {!running && (
            <ScrollView>
              <View style={styles.countRow}>
                <Text
                  style={[
                    styles.label,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  Count:
                </Text>
                <TextInput
                  style={[
                    styles.countInput,
                    {
                      color: theme.colors.text,
                      borderColor: theme.colors.border,
                      fontFamily: theme.fonts.regular,
                    },
                  ]}
                  value={count}
                  onChangeText={setCount}
                  keyboardType="numeric"
                />
              </View>

              <Pressable style={buttonStyle} onPress={handleDuplicateJournal}>
                <Feather name="copy" size={16} color={theme.colors.text} />
                <Text
                  style={[
                    styles.buttonText,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  Duplicate Journal
                </Text>
              </Pressable>

              <Pressable style={buttonStyle} onPress={handleDuplicatePage}>
                <Feather name="file-plus" size={16} color={theme.colors.text} />
                <Text
                  style={[
                    styles.buttonText,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  Duplicate Page
                </Text>
              </Pressable>

              <Pressable style={buttonStyle} onPress={handleGenerateJournals}>
                <Feather name="book" size={16} color={theme.colors.text} />
                <Text
                  style={[
                    styles.buttonText,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  Generate Blank Journals
                </Text>
              </Pressable>

              <Pressable style={buttonStyle} onPress={handleGeneratePages}>
                <Feather name="file-text" size={16} color={theme.colors.text} />
                <Text
                  style={[
                    styles.buttonText,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  Generate Blank Pages
                </Text>
              </Pressable>

              <View style={styles.separator} />

              <Pressable style={[styles.actionButton, styles.wipeButton]} onPress={handleWipeAll}>
                <Feather name="trash-2" size={16} color="#fff" />
                <Text
                  style={[styles.buttonText, { color: '#fff', fontFamily: theme.fonts.regular }]}
                >
                  Wipe All Data
                </Text>
              </Pressable>
            </ScrollView>
          )}

          <Pressable
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: theme.colors.highlight }]}
          >
            <Text
              style={[
                styles.closeText,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              Close
            </Text>
          </Pressable>
        </View>

        {/* Journal Picker */}
        <Modal
          visible={showJournalPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowJournalPicker(false)}
        >
          <View style={styles.overlay}>
            <View
              style={[
                styles.pickerContent,
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
                  styles.pickerTitle,
                  { color: theme.colors.text, fontFamily: theme.fonts.bold },
                ]}
              >
                Select Journal
              </Text>
              <ScrollView>
                {journals.map((j) => (
                  <Pressable
                    key={j.id}
                    style={[styles.pickerItem, { borderBottomColor: theme.colors.border }]}
                    onPress={() => handleJournalSelected(j)}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        { color: theme.colors.text, fontFamily: theme.fonts.regular },
                      ]}
                    >
                      {j.icon} {j.title}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                onPress={() => setShowJournalPicker(false)}
                style={[styles.closeButton, { backgroundColor: theme.colors.highlight }]}
              >
                <Text
                  style={[
                    styles.closeText,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Page Picker */}
        <Modal
          visible={showPagePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPagePicker(false)}
        >
          <View style={styles.overlay}>
            <View
              style={[
                styles.pickerContent,
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
                  styles.pickerTitle,
                  { color: theme.colors.text, fontFamily: theme.fonts.bold },
                ]}
              >
                Select Page
              </Text>
              <ScrollView>
                {pages.map((p) => (
                  <Pressable
                    key={p.id}
                    style={[styles.pickerItem, { borderBottomColor: theme.colors.border }]}
                    onPress={() => handlePageSelected(p)}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        { color: theme.colors.text, fontFamily: theme.fonts.regular },
                      ]}
                    >
                      {new Date(p.date).toLocaleDateString()} — {p.text.slice(0, 50) || '(empty)'}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                onPress={() => setShowPagePicker(false)}
                style={[styles.closeButton, { backgroundColor: theme.colors.highlight }]}
              >
                <Text
                  style={[
                    styles.closeText,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
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
    padding: 30,
  },
  content: {
    borderRadius: 5,
    padding: 20,
    maxHeight: '80%',
    width: '100%',
  },
  title: {
    fontSize: 20,
    marginBottom: 15,
    textAlign: 'center',
  },
  runningContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 10,
  },
  runningText: {
    fontSize: 14,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    gap: 10,
  },
  label: {
    fontSize: 14,
  },
  countInput: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    width: 80,
    fontSize: 14,
    textAlign: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginBottom: 8,
  },
  buttonText: {
    fontSize: 14,
  },
  closeButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10,
  },
  closeText: {
    fontSize: 14,
  },
  pickerContent: {
    borderRadius: 5,
    padding: 20,
    maxHeight: '70%',
    width: '100%',
  },
  pickerTitle: {
    fontSize: 18,
    marginBottom: 10,
    textAlign: 'center',
  },
  pickerItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  wipeButton: {
    backgroundColor: '#c0392b',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    marginVertical: 10,
  },
  pickerItemText: {
    fontSize: 14,
  },
});
