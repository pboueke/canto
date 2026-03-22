import { useState, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import {
  useDeleteJournal,
  useSaveJournal,
  getEncryptionService,
  getLocalStore,
  tryLoadJournal,
} from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { IconPicker } from '@/components/common/IconPicker';
import { ThemePickerModal } from '@/components/home/ThemePickerModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { ChangePasswordModal } from './ChangePasswordModal';
import { isBiometricAvailable } from '@/lib/biometric';
import { type ThemeName, themes } from '@/styles/themes';
import type { JournalContent, JournalSettings as JournalSettingsType } from '@/data';
import { webModalContent } from '@/styles/web';

interface JournalSettingsProps {
  journal: JournalContent;
  derivedKey: Uint8Array | null;
  onClose: () => void;
  onJournalChanged: () => void;
}

type SortOrder = JournalSettingsType['sort'];
const SORT_OPTIONS: SortOrder[] = ['descending', 'ascending', 'none'];

export function JournalSettings({
  journal,
  derivedKey,
  onClose,
  onJournalChanged,
}: JournalSettingsProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { deleteJournal } = useDeleteJournal();
  const { saveJournal } = useSaveJournal();
  const { deriveAndCache, setKey, clearKey } = useJournalKeys();

  const [settings, setSettings] = useState<JournalSettingsType>({ ...journal.settings });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [newName, setNewName] = useState(journal.title);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [passwordProgress, setPasswordProgress] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [saving, setSaving] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricSupported);
  }, []);

  const pageCount = journal.pages.filter((p) => !p.deleted).length;
  const createdDate = new Date(journal.date).toLocaleDateString();

  const sortLabel = (sort: SortOrder) => {
    switch (sort) {
      case 'ascending':
        return t.journalSettings.ascending;
      case 'descending':
        return t.journalSettings.descending;
      case 'none':
        return t.journalSettings.none;
    }
  };

  const updateSetting = useCallback(
    async <K extends keyof JournalSettingsType>(key: K, value: JournalSettingsType[K]) => {
      const updated = { ...settings, [key]: value };
      setSettings(updated);
      const updatedJournal = { ...journal, settings: updated };
      await saveJournal(updatedJournal, derivedKey ?? undefined);
      onJournalChanged();
    },
    [settings, journal, derivedKey, saveJournal, onJournalChanged],
  );

  const toggleSort = useCallback(() => {
    const currentIdx = SORT_OPTIONS.indexOf(settings.sort);
    const next = SORT_OPTIONS[(currentIdx + 1) % SORT_OPTIONS.length];
    updateSetting('sort', next);
  }, [settings.sort, updateSetting]);

  const handleIconChange = useCallback(
    async (icon: string) => {
      setShowIconPicker(false);
      const updated = { ...journal, icon };
      await saveJournal(updated, derivedKey ?? undefined);
      onJournalChanged();
    },
    [journal, derivedKey, saveJournal, onJournalChanged],
  );

  const handleNameChange = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === journal.title) {
      setShowNameInput(false);
      return;
    }
    setSaving(true);
    const updated = { ...journal, title: trimmed };
    await saveJournal(updated, derivedKey ?? undefined);
    onJournalChanged();
    setSaving(false);
    setShowNameInput(false);
  }, [newName, journal, derivedKey, saveJournal, onJournalChanged]);

  const handleDelete = useCallback(
    async (password?: string) => {
      setDeleteError(null);
      if (journal.secure && password && journal.salt) {
        try {
          await deriveAndCache(journal.id, password, journal.salt, journal.kdfIterations);
        } catch {
          setDeleteError(t.home.wrongPassword);
          return;
        }
      }
      try {
        clearKey(journal.id);
        await deleteJournal(journal.id);
        setShowDeleteModal(false);
        router.replace('/');
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : String(err));
      }
    },
    [journal, deleteJournal, clearKey, deriveAndCache, t],
  );

  const handleChangePassword = useCallback(
    async (currentPwd: string | undefined, newPwd: string | undefined, kdfIterations?: number) => {
      setPasswordError('');
      setPasswordProgress(t.journalSettings.reencrypting);

      const encryption = getEncryptionService();
      const store = await getLocalStore();
      let newKey: Uint8Array | undefined;
      let newSalt: string = journal.salt;

      // Step 1: Verify current password via trial decryption
      // (PBKDF2 always succeeds regardless of password — must actually try to decrypt)
      if (journal.secure && currentPwd && journal.salt) {
        const trialKey = await deriveAndCache(
          journal.id,
          currentPwd,
          journal.salt,
          journal.kdfIterations,
        );
        const trialResult = await tryLoadJournal(journal.id, trialKey);
        if (!trialResult) {
          // Wrong password — restore the correct cached key so journal remains accessible
          if (derivedKey) {
            setKey(journal.id, derivedKey);
          } else {
            clearKey(journal.id);
          }
          throw new Error(t.home.wrongPassword);
        }
      }

      // Step 2: Generate new key if new password provided
      if (newPwd) {
        const saltBytes = encryption.generateSalt();
        const binary = Array.from(saltBytes, (b) => String.fromCharCode(b)).join('');
        newSalt = btoa(binary);
        newKey = await deriveAndCache(journal.id, newPwd, newSalt, kdfIterations);
      }

      // Step 3: Build updated journal
      const updatedJournal: JournalContent = {
        ...journal,
        secure: !!newPwd,
        salt: newSalt,
        kdfIterations: newPwd ? kdfIterations : undefined,
        settings: { ...journal.settings },
      };

      // Step 4: Atomic re-encryption with progress
      try {
        await store.reencryptJournal(
          updatedJournal,
          derivedKey ?? undefined,
          newKey,
          (current, total) => {
            setPasswordProgress(
              t.journalSettings.reencryptProgress
                .replace('{current}', String(current))
                .replace('{total}', String(total)),
            );
          },
        );
      } catch (err) {
        // Restore the original key so user can still access their data
        if (derivedKey) {
          setKey(journal.id, derivedKey);
        } else {
          clearKey(journal.id);
        }
        setPasswordProgress('');
        throw new Error(
          `Re-encryption failed: ${err instanceof Error ? err.message : String(err)}. ` +
            `Your journal data is unchanged — the original password still works.`,
        );
      }

      // Step 5: Update key cache
      if (!newPwd) {
        clearKey(journal.id);
      }

      setPasswordProgress('');
      onJournalChanged();
      setShowPasswordModal(false);
    },
    [journal, derivedKey, deriveAndCache, setKey, clearKey, onJournalChanged, t],
  );

  const renderToggle = (
    label: string,
    key: keyof Pick<
      JournalSettingsType,
      'use24h' | 'previewTags' | 'previewThumbnail' | 'previewIcons' | 'filterBar' | 'autoLocation'
    >,
  ) => (
    <View style={styles.settingRow}>
      <Text
        style={[styles.settingLabel, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}
      >
        {label}
      </Text>
      <Switch
        value={settings[key]}
        onValueChange={(val) => updateSetting(key, val)}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: theme.colors.border, paddingTop: insets.top + 12 },
        ]}
      >
        <Pressable onPress={onClose} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.colors.text} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
        >
          {t.journalSettings.title}
        </Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Statistics */}
        <Text
          style={[
            styles.sectionTitle,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
          ]}
        >
          {t.journalSettings.stats}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.statRow}>
            <Text
              style={[
                styles.statLabel,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.journalSettings.pageCount}
            </Text>
            <Text
              style={[styles.statValue, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
            >
              {pageCount}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text
              style={[
                styles.statLabel,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.journalSettings.createdOn}
            </Text>
            <Text
              style={[styles.statValue, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}
            >
              {createdDate}
            </Text>
          </View>
        </View>

        {/* Display settings */}
        <Text
          style={[
            styles.sectionTitle,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
          ]}
        >
          {t.journalSettings.displaySettings}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          {renderToggle(t.journalSettings.use24h, 'use24h')}
          {renderToggle(t.journalSettings.previewTags, 'previewTags')}
          {renderToggle(t.journalSettings.previewThumbnail, 'previewThumbnail')}
          {renderToggle(t.journalSettings.previewIcons, 'previewIcons')}
          {renderToggle(t.journalSettings.filterBarToggle, 'filterBar')}
          {renderToggle(t.journalSettings.autoLocation, 'autoLocation')}

          {/* Sort order */}
          <Pressable style={styles.settingRow} onPress={toggleSort}>
            <Text
              style={[
                styles.settingLabel,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.journalSettings.sortOrder}
            </Text>
            <View style={styles.sortPicker}>
              <Feather name="chevron-left" size={16} color={theme.colors.textSecondary} />
              <Text
                style={[
                  styles.sortValue,
                  { color: theme.colors.primary, fontFamily: theme.fonts.bold },
                ]}
              >
                {sortLabel(settings.sort)}
              </Text>
              <Feather name="chevron-right" size={16} color={theme.colors.textSecondary} />
            </View>
          </Pressable>

          {/* Theme override */}
          <Pressable style={styles.settingRow} onPress={() => setShowThemePicker(true)}>
            <Text
              style={[
                styles.settingLabel,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.journalSettings.themeOverride}
            </Text>
            <Text
              style={[
                styles.sortValue,
                { color: theme.colors.primary, fontFamily: theme.fonts.bold },
              ]}
            >
              {settings.themeOverride && settings.themeOverride in themes
                ? settings.themeOverride.charAt(0).toUpperCase() + settings.themeOverride.slice(1)
                : t.journalSettings.useGlobalTheme}
            </Text>
          </Pressable>
        </View>

        {/* Change icon */}
        <Text
          style={[
            styles.sectionTitle,
            { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
          ]}
        >
          {t.journalSettings.changeIcon}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Pressable style={styles.iconRow} onPress={() => setShowIconPicker(true)}>
            <Feather
              name={(journal.icon || 'book') as React.ComponentProps<typeof Feather>['name']}
              size={24}
              color={theme.colors.primary}
            />
            <Text
              style={[
                styles.settingLabel,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.journalSettings.changeIcon}
            </Text>
            <Feather name="chevron-right" size={18} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        {/* Biometric toggle */}
        {biometricSupported && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                marginTop: 16,
              },
            ]}
          >
            <View style={styles.settingRow}>
              <Text
                style={[
                  styles.settingLabel,
                  { color: theme.colors.text, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.home.biometricLock}
              </Text>
              <Switch
                value={!!journal.biometric}
                onValueChange={async (val) => {
                  const updated = { ...journal, biometric: val };
                  await saveJournal(updated, derivedKey ?? undefined);
                  onJournalChanged();
                }}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </View>
          </View>
        )}

        {/* Sync settings */}
        {journal.settings.remoteSync && (
          <>
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.textSecondary, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.sync.sync}
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <View style={styles.settingRow}>
                <Text
                  style={[
                    styles.statLabel,
                    { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {journal.settings.syncProvider === 'gdrive' ? 'Google Drive' : '-'}
                </Text>
              </View>
              <View style={styles.settingRow}>
                <Text
                  style={[
                    styles.settingLabel,
                    { color: theme.colors.text, fontFamily: theme.fonts.regular },
                  ]}
                >
                  {t.sync.autoSync}
                </Text>
                <Switch
                  value={settings.autoSync}
                  onValueChange={(val) => updateSetting('autoSync', val)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
              </View>
            </View>
          </>
        )}

        {/* Danger zone */}
        <Text
          style={[styles.sectionTitle, { color: theme.colors.error, fontFamily: theme.fonts.bold }]}
        >
          {t.journalSettings.dangerZone}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.error },
          ]}
        >
          <Pressable
            style={styles.dangerRow}
            onPress={() => {
              setNewName(journal.title);
              setShowNameInput(true);
            }}
          >
            <Feather name="edit-3" size={18} color={theme.colors.text} />
            <Text
              style={[
                styles.settingLabel,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.journalSettings.changeName}
            </Text>
          </Pressable>

          <Pressable style={styles.dangerRow} onPress={() => setShowPasswordModal(true)}>
            <Feather name="lock" size={18} color={theme.colors.text} />
            <Text
              style={[
                styles.settingLabel,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.journalSettings.changePassword}
            </Text>
          </Pressable>

          <Pressable style={styles.dangerRow} onPress={() => setShowDeleteModal(true)}>
            <Feather name="trash-2" size={18} color={theme.colors.error} />
            <Text
              style={[
                styles.settingLabel,
                { color: theme.colors.error, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.journalSettings.deleteJournal}
            </Text>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Icon picker modal */}
      <Modal visible={showIconPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <View style={styles.modalHeader}>
              <Text
                style={[
                  styles.modalTitle,
                  { color: theme.colors.text, fontFamily: theme.fonts.bold },
                ]}
              >
                {t.journalSettings.changeIcon}
              </Text>
              <Pressable onPress={() => setShowIconPicker(false)}>
                <Feather name="x" size={22} color={theme.colors.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.iconPickerContainer}>
              <IconPicker selected={journal.icon} onSelect={handleIconChange} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Name change modal */}
      <Modal visible={showNameInput} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.nameModalContent,
              webModalContent,
              { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
            >
              {t.journalSettings.changeName}
            </Text>
            <TextInput
              style={[
                styles.nameInput,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  fontFamily: theme.fonts.regular,
                },
              ]}
              value={newName}
              onChangeText={setNewName}
              placeholder={t.journalSettings.newName}
              placeholderTextColor={theme.colors.textSecondary}
              autoFocus
            />
            <View style={styles.nameButtons}>
              <Pressable
                style={[styles.nameBtn, { backgroundColor: theme.colors.buttonCancel }]}
                onPress={() => setShowNameInput(false)}
              >
                <Text
                  style={[
                    styles.nameBtnText,
                    { color: theme.colors.text, fontFamily: theme.fonts.bold },
                  ]}
                >
                  {t.common.cancel}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.nameBtn, { backgroundColor: theme.colors.buttonSubmit }]}
                onPress={handleNameChange}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text
                    style={[styles.nameBtnText, { color: '#fff', fontFamily: theme.fonts.bold }]}
                  >
                    {t.common.save}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDeleteModal
        visible={showDeleteModal}
        journalName={journal.title}
        isSecure={journal.secure}
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteModal(false);
          setDeleteError(null);
        }}
        error={deleteError}
      />

      <ChangePasswordModal
        visible={showPasswordModal}
        isSecure={journal.secure}
        currentKdfIterations={journal.kdfIterations}
        onSubmit={handleChangePassword}
        onCancel={() => {
          setShowPasswordModal(false);
          setPasswordError('');
          setPasswordProgress('');
        }}
        progress={passwordProgress}
        error={passwordError}
      />

      <ThemePickerModal
        visible={showThemePicker}
        onClose={() => setShowThemePicker(false)}
        showGlobalOption
        selectedTheme={
          settings.themeOverride && settings.themeOverride in themes
            ? (settings.themeOverride as ThemeName)
            : undefined
        }
        onSelect={(name) => {
          updateSetting('themeOverride', name ?? undefined);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 14,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  settingLabel: {
    fontSize: 14,
    flex: 1,
  },
  sortPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortValue: {
    fontSize: 14,
    minWidth: 100,
    textAlign: 'center',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    marginBottom: 12,
  },
  iconPickerContainer: {
    padding: 20,
  },
  nameModalContent: {
    position: 'absolute',
    top: '30%',
    left: 30,
    right: 30,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
  },
  nameInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  nameButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  nameBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  nameBtnText: {
    fontSize: 14,
  },
});
