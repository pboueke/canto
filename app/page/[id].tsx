import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useLocalSearchParams } from 'expo-router';
import { useSafeBack } from '@/hooks/useSafeBack';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { ThemeContext, useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useFontPrefs } from '@/contexts/FontPrefsContext';
import { applyFontPrefs } from '@/lib/font';
import { type ThemeName, themes } from '@/styles/themes';
import {
  usePage,
  useSavePage,
  useDeletePage,
  useJournalTags,
  useAttachment,
  saveDraft,
  getDraft,
  deleteDraft,
} from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { useKeyLease } from '@/hooks/useKeyLease';
import { generateThumbnail } from '@/lib/thumbnail';
import { canGenerateThumbnailFromAttachment } from '@/lib/pagePreview';
import { downloadAttachment } from '@/lib/downloadAttachment';
import { PageHeader } from '@/components/page/PageHeader';
import { TagEditor } from '@/components/page/TagEditor';
import { PageContent } from '@/components/page/PageContent';
import { ImageCarousel } from '@/components/page/ImageCarousel';
import { FileRow } from '@/components/page/FileRow';
import { LocationTag } from '@/components/page/LocationTag';
import { CommentList } from '@/components/page/CommentList';
import { CommentModal } from '@/components/page/CommentModal';
import { AddAttachmentPopup } from '@/components/page/AddAttachmentPopup';
import { FloatingActionButton } from '@/components/common/FloatingActionButton';
import { LockedPlaceholder } from '@/components/common/LockedPlaceholder';
import { confirmChoice, confirmDestructive, notify } from '@/lib/dialogs';
import { generateUUID, releaseAndZeroAesKey } from '@/lib/encryption/utils';
import { chunkedContentForByteLength } from '@/lib/storage/attachment-content';
import { blobAttachmentChunks, nativeAttachmentChunks } from '@/lib/storage/attachment-ingestion';
import { persistPickedImage, type PickedAttachmentSource } from '@/lib/image-ingestion';
import type { Attachment, Comment, GeoLocation, Page } from 'canto-data';

/** Idle time after the last edit before the encrypted draft is persisted. */
const DRAFT_SAVE_DELAY_MS = 3_000;

function attachmentSource(uri: string, webFile?: Blob): PickedAttachmentSource {
  if (Platform.OS === 'web') {
    // Expo's web pickers provide the original File. Refusing a URI-only value
    // avoids falling back to a data URL or a full-response buffer.
    if (!webFile) throw new Error('Attachment file is unavailable for streamed import');
    return { size: webFile.size, chunks: () => blobAttachmentChunks(webFile) };
  }
  const { File: ExpoFile } = require('expo-file-system');
  const file = new ExpoFile(uri);
  return { size: file.size, chunks: () => nativeAttachmentChunks(file) };
}

export default function PageScreen() {
  const { id, journalId, edit, themeOverride } = useLocalSearchParams<{
    id: string;
    journalId: string;
    edit?: string;
    themeOverride?: string;
  }>();
  const { theme: globalTheme, setThemeName } = useTheme();
  const { t } = useI18n();
  const { fontFamily, fontSize } = useFontPrefs();

  const overrideRawTheme =
    themeOverride && themeOverride in themes ? themes[themeOverride as ThemeName] : null;
  const theme = overrideRawTheme
    ? applyFontPrefs(overrideRawTheme, fontFamily, fontSize)
    : globalTheme;
  const isDark = theme.isDark;
  const themeContextValue = useMemo(
    () => ({ theme, setThemeName, isDark }),
    [theme, setThemeName, isDark],
  );
  const { getKey, isLeaseValid, onAutoLock, onBeforeLock, onJournalLocked } = useJournalKeys();
  const safeBack = useSafeBack();

  const derivedKey = journalId ? getKey(journalId) : null;
  // Auto-lock write capability: revoked before clearKey/clearAll zeroes key
  // material, so an already-mounted editor can never save with a zeroed key.
  const { locked, lease } = useKeyLease(journalId);
  // Checked at call time: a lock during awaited work (thumbnails) must stop
  // the write, which a value captured at render cannot see.
  const leaseIsLive = useCallback(() => !!lease && isLeaseValid(lease), [lease, isLeaseValid]);
  const { page, loading, error: pageError } = usePage(journalId, id, derivedKey);
  const { save } = useSavePage(journalId, derivedKey);
  const { deletePage } = useDeletePage(journalId, derivedKey);
  const { tags: journalTags } = useJournalTags(journalId, derivedKey);
  const { saveAttachmentStream, getAttachment, materializeImage } = useAttachment(derivedKey);

  const [isEditing, setIsEditing] = useState(edit === 'true');
  const [draft, setDraft] = useState<Page | null>(null);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [addPopupVisible, setAddPopupVisible] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  // Set once this journal is locked while the editor is mounted. Nothing
  // decrypted is rendered or kept in state from then on.
  const [revoked, setRevoked] = useState(false);
  // Set the moment an auto-lock starts, before drafts flush and keys are
  // zeroed: content is hidden and no prompt can act from then on.
  const [locking, setLocking] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const revokedRef = useRef(false);
  const lockingRef = useRef(false);
  // Set once the page is deleted: its draft is gone and nothing may store or
  // guard it again on the way out.
  const deletedRef = useRef(false);
  const isLockedNow = useCallback(() => revokedRef.current || lockingRef.current, []);
  const navigation = useNavigation();

  // Latest editor state for the lock/background flush, which is registered
  // once and must not capture a stale draft.
  const draftRef = useRef<Page | null>(null);
  const unsavedRef = useRef(false);
  draftRef.current = draft;
  unsavedRef.current = isEditing && isDirty;

  const flushDraft = useCallback(async () => {
    const current = draftRef.current;
    if (!journalId || !current || !unsavedRef.current || revokedRef.current) return;
    if (deletedRef.current) return;
    // A private copy of the key: an auto-lock zeroes the shared buffer after a
    // bounded wait, and a save queued behind slow storage work must still be
    // encrypted with the real key rather than rejected and lost. The copy is
    // zeroed as soon as the write settles.
    const liveKey = getKey(journalId);
    const key = liveKey ? new Uint8Array(liveKey) : null;
    try {
      // Restored only after the user unlocks this journal again.
      await saveDraft(journalId, current, key);
    } catch (err) {
      console.warn(
        '[Canto] Unsaved draft could not be stored:',
        err instanceof Error ? err.name : err,
      );
    } finally {
      if (key) releaseAndZeroAesKey(key);
    }
  }, [journalId, getKey]);

  useEffect(() => onBeforeLock(flushDraft), [onBeforeLock, flushDraft]);

  useEffect(
    () =>
      onAutoLock(() => {
        lockingRef.current = true;
        setLocking(true);
      }),
    [onAutoLock],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') void flushDraft();
    });
    return () => subscription.remove();
  }, [flushDraft]);

  // Web: an encrypted draft cannot be written reliably while the page
  // unloads, so a reload or tab close with unsaved edits asks the browser to
  // warn first (and still starts a best-effort save).
  useEffect(() => {
    if (Platform.OS !== 'web' || !isEditing || !isDirty) return;
    const target = globalThis as unknown as {
      addEventListener?: (type: string, listener: (event: Event) => void) => void;
      removeEventListener?: (type: string, listener: (event: Event) => void) => void;
    };
    const warn = (event: Event) => {
      void flushDraft();
      event.preventDefault();
      // Legacy browsers need returnValue set to show the prompt.
      (event as unknown as { returnValue: unknown }).returnValue = '';
    };
    target.addEventListener?.('beforeunload', warn);
    return () => target.removeEventListener?.('beforeunload', warn);
  }, [isEditing, isDirty, flushDraft]);

  // Survive the process being killed while typing.
  useEffect(() => {
    if (!isEditing || !isDirty || !draft) return;
    const timer = setTimeout(() => void flushDraft(), DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, isEditing, isDirty, flushDraft]);

  useEffect(() => {
    if (!journalId) return;
    return onJournalLocked(journalId, () => {
      revokedRef.current = true;
      setRevoked(true);
      setDraft(null);
      setIsDirty(false);
      setIsEditing(false);
      setDraftRestored(false);
    });
  }, [journalId, onJournalLocked]);

  useEffect(() => {
    if (page && !draft && !revokedRef.current) {
      setDraft({ ...page });
    }
  }, [page]);

  // Offer an unsaved draft stored before a lock. It opens only with the
  // journal key, and never replaces edits made in this session.
  const restoreCheckedRef = useRef(false);
  useEffect(() => {
    if (!journalId || !id || !page || revokedRef.current || restoreCheckedRef.current) return;
    // Checked once per mount; a later page reload must not resurrect a draft
    // that a save or discard in this session already superseded.
    restoreCheckedRef.current = true;
    void getDraft(journalId, id, derivedKey)
      .then((stored) => {
        if (!stored || unsavedRef.current || revokedRef.current) return;
        const restore = () => {
          setDraft(stored);
          setIsEditing(true);
          setIsDirty(true);
          setDraftRestored(true);
        };
        // A draft carries the modified time of the page it started from. If
        // the saved page changed since (sync, a remote delete, a save whose
        // draft cleanup failed), neither version is replaced silently.
        if ((stored.modified ?? 0) < (page.modified ?? 0)) {
          confirmChoice(
            t.privacy.draftConflictTitle,
            t.privacy.draftConflictMessage,
            { confirm: t.privacy.useDraft, cancel: t.privacy.keepSaved },
            restore,
            () => void deleteDraft(journalId, id).catch(() => undefined),
          );
          return;
        }
        restore();
      })
      .catch(() => {
        // A draft that cannot be read is simply not offered.
      });
  }, [journalId, id, page, derivedKey, t]);

  // Settles once the stored draft is gone, so callers that leave the editor
  // can wait for it: the journal list re-reads drafts on focus and would
  // otherwise still show this one.
  const forgetDraft = useCallback((): Promise<void> => {
    // A stale prompt answered after a lock must never delete the draft the
    // lock just stored.
    if (isLockedNow()) return Promise.resolve();
    // Synchronously: a debounce or background flush firing before the next
    // render must not store the draft again after its delete was queued.
    unsavedRef.current = false;
    setDraftRestored(false);
    if (!journalId || !id) return Promise.resolve();
    return deleteDraft(journalId, id).catch(() => undefined);
  }, [journalId, id, isLockedNow]);

  const handleDiscardDraft = useCallback(() => {
    confirmDestructive(
      t.privacy.discardDraft,
      t.page.discardMessage,
      { confirm: t.page.discard, cancel: t.page.keep },
      () => {
        forgetDraft();
        if (page) setDraft({ ...page });
        setIsDirty(false);
        setIsEditing(false);
      },
    );
  }, [forgetDraft, page, t]);

  // Android hardware back button interception
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      // A locked editor has nothing left to protect; never trap the user.
      if (isLockedNow() || deletedRef.current) return false;
      if (isEditing && isDirty) {
        confirmDestructive(
          t.page.discardChanges,
          t.page.discardMessage,
          { confirm: t.page.discard, cancel: t.page.keep },
          () => {
            if (isLockedNow()) return;
            const forgotten = forgetDraft();
            if (page) setDraft({ ...page });
            setIsDirty(false);
            setIsEditing(false);
            void forgotten.then(safeBack);
          },
        );
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [isEditing, isDirty, page, t, safeBack, forgetDraft]);

  // Navigation beforeRemove interception
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // The lock screen resets the stack; the draft is already stored
      // encrypted, so a discard prompt here would only expose the text.
      if (isLockedNow() || deletedRef.current) return;
      if (!isEditing || !isDirty) return;
      e.preventDefault();
      confirmDestructive(
        t.page.discardChanges,
        t.page.discardMessage,
        { confirm: t.page.discard, cancel: t.page.keep },
        () => {
          if (isLockedNow()) return;
          const forgotten = forgetDraft();
          if (page) setDraft({ ...page });
          setIsDirty(false);
          setIsEditing(false);
          void forgotten.then(() => navigation.dispatch(e.data.action));
        },
      );
    });
    return unsubscribe;
  }, [navigation, isEditing, isDirty, page, t, forgetDraft]);

  const updateDraft = useCallback(
    (updates: Partial<Page>) => {
      if (!draft) return;
      setDraft({ ...draft, ...updates });
      setIsDirty(true);
    },
    [draft],
  );

  const handleSave = useCallback(async () => {
    if (!draft) return;
    // The lease is checked immediately before any storage mutation (including
    // after awaited attachment/thumbnail work), so a revoked key cannot write.
    if (!leaseIsLive()) {
      notify(t.page.unlockRequired);
      return;
    }
    const toSave = { ...draft, modified: Date.now() };

    // Generate thumbnail from first non-deleted image
    const firstImage = toSave.images.find((img) => !img.deleted);
    if (firstImage && journalId && id && canGenerateThumbnailFromAttachment(firstImage)) {
      try {
        const base64 = await getAttachment(firstImage.path, firstImage.encrypted);
        if (base64) {
          toSave.thumbnail = await generateThumbnail(base64);
        }
      } catch {
        // Non-critical — skip thumbnail generation on error
      }
    } else if (!firstImage) {
      // A thumbnail belongs to the first visible image. Clear it only when
      // there is no image left; chunked images may already have received a
      // persisted preview while they were picked or imported.
      toSave.thumbnail = undefined;
    }

    // Re-check the lease after the awaited thumbnail work, then persist.
    if (!leaseIsLive()) {
      notify(t.page.unlockRequired);
      return;
    }
    try {
      await save(toSave);
      forgetDraft();
      setIsDirty(false);
      setIsEditing(false);
    } catch (err) {
      // Handler error boundary: never leave an unhandled promise rejection
      // from a locked/recovery save. The draft stays in memory untouched.
      const message = err instanceof Error ? err.message : String(err);
      notify(t.page.unlockRequired, message);
    }
  }, [draft, leaseIsLive, save, getAttachment, journalId, id, t, forgetDraft]);

  const handleDelete = useCallback(() => {
    confirmDestructive(
      t.page.deleteConfirm,
      t.page.deleteMessage,
      { confirm: t.common.delete, cancel: t.common.cancel },
      async () => {
        if (!id) return;
        // A revoked lease must reject the mutation instead of writing with a
        // zeroed key; the journal returns to its locked state.
        if (!leaseIsLive()) {
          notify(t.page.unlockRequired);
          return;
        }
        deletedRef.current = true;
        try {
          await deletePage(id);
        } catch (err) {
          // Nothing was deleted: keep the draft and the unsaved-changes guard.
          deletedRef.current = false;
          notify('Error', err instanceof Error ? err.message : String(err));
          return;
        }
        // Deleting the page discards its draft too; leave without a
        // "Discard changes?" prompt once the draft is gone.
        const forgotten = forgetDraft();
        setIsDirty(false);
        setIsEditing(false);
        await forgotten;
        safeBack();
      },
    );
  }, [id, leaseIsLive, deletePage, t, forgetDraft, safeBack]);

  const handleToggleEdit = useCallback(() => {
    if (isEditing && isDirty) {
      confirmDestructive(
        t.page.discardChanges,
        t.page.discardMessage,
        { confirm: t.page.discard, cancel: t.page.keep },
        () => {
          if (isLockedNow()) return;
          forgetDraft();
          if (page) setDraft({ ...page });
          setIsDirty(false);
          setIsEditing(false);
        },
      );
    } else {
      setIsEditing(!isEditing);
    }
  }, [isEditing, isDirty, page, t, forgetDraft]);

  // Attachment handlers
  const handleAddImage = useCallback(
    async (encrypted: boolean, input: 'camera' | 'library' = 'library') => {
      if (!draft || !journalId || !id) return;

      let result: ImagePicker.ImagePickerResult;
      if (input === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          notify(t.page.cameraPermissionDenied);
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          base64: false,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          base64: false,
        });
      }
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const source = attachmentSource(asset.uri, asset.file);
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const attachment: Attachment = {
        id: generateUUID(),
        path: '',
        name: `image-${Date.now()}.${ext}`,
        type: 'image',
        encrypted,
        size: source.size,
        content: chunkedContentForByteLength(source.size),
        deleted: false,
      };

      try {
        const persisted = await persistPickedImage({
          attachment,
          source,
          save: (chunks) => saveAttachmentStream(journalId!, id!, attachment, chunks),
        });
        const hasVisibleImage = draft.images.some((image) => !image.deleted);
        updateDraft({
          images: [...draft.images, persisted.attachment],
          ...(hasVisibleImage || !persisted.thumbnail ? {} : { thumbnail: persisted.thumbnail }),
        });
      } catch (err) {
        notify('Error', err instanceof Error ? err.message : String(err));
      }
    },
    [draft, journalId, id, saveAttachmentStream, updateDraft, t],
  );

  const handleAddFile = useCallback(
    async (encrypted: boolean) => {
      if (!draft || !journalId || !id) return;
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const source = attachmentSource(asset.uri, asset.file);
      const attachment: Attachment = {
        id: generateUUID(),
        path: '',
        name: asset.name,
        type: 'file',
        encrypted,
        size: source.size,
        content: chunkedContentForByteLength(source.size),
        deleted: false,
      };

      try {
        const path = await saveAttachmentStream(journalId!, id!, attachment, source.chunks());
        attachment.path = path;
        updateDraft({ files: [...draft.files, attachment] });
      } catch (err) {
        notify('Error', err instanceof Error ? err.message : String(err));
      }
    },
    [draft, journalId, id, saveAttachmentStream, updateDraft],
  );

  const handleAddLocation = useCallback(async () => {
    if (!draft) return;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const loc = await Location.getCurrentPositionAsync({});
    const geo: GeoLocation = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      altitude: loc.coords.altitude ?? undefined,
      accuracy: loc.coords.accuracy ?? undefined,
    };
    updateDraft({ location: geo });
  }, [draft, updateDraft]);

  const handleRemoveImage = useCallback(
    (imageId: string) => {
      if (!draft) return;
      updateDraft({
        images: draft.images.map((img) => (img.id === imageId ? { ...img, deleted: true } : img)),
        ...(draft.images.find((img) => !img.deleted)?.id === imageId
          ? { thumbnail: undefined }
          : {}),
      });
    },
    [draft, updateDraft],
  );

  const handleMoveImage = useCallback(
    (imageId: string, direction: 'left' | 'right', encrypted: boolean) => {
      if (!draft) return;
      const list = [...draft.images];
      const filtered = list.filter((img) => img.encrypted === encrypted && !img.deleted);
      const idx = filtered.findIndex((img) => img.id === imageId);
      if (idx < 0) return;

      const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= filtered.length) return;

      const listIdx1 = list.findIndex((img) => img.id === filtered[idx].id);
      const listIdx2 = list.findIndex((img) => img.id === filtered[swapIdx].id);
      [list[listIdx1], list[listIdx2]] = [list[listIdx2], list[listIdx1]];
      updateDraft({ images: list, thumbnail: undefined });
    },
    [draft, updateDraft],
  );

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      if (!draft) return;
      updateDraft({
        files: draft.files.map((f) => (f.id === fileId ? { ...f, deleted: true } : f)),
      });
    },
    [draft, updateDraft],
  );

  const handleOpenFile = useCallback(
    async (file: Attachment) => {
      const data = await getAttachment(file.path, file.encrypted);
      if (!data) return;
      await downloadAttachment(data, file.name);
    },
    [getAttachment],
  );

  const handleDownloadImage = useCallback(
    async (image: Attachment) => {
      try {
        const data = await getAttachment(image.path, image.encrypted);
        if (!data) return;
        await downloadAttachment(data, image.name);
      } catch (err) {
        notify('Error', err instanceof Error ? err.message : String(err));
      }
    },
    [getAttachment],
  );

  const handleSaveComment = useCallback(
    (text: string, existingId?: string) => {
      if (!draft) return;
      if (existingId) {
        updateDraft({
          comments: draft.comments.map((c) => (c.id === existingId ? { ...c, text } : c)),
        });
      } else {
        const newComment: Comment = {
          id: generateUUID(),
          text,
          date: new Date().toISOString(),
        };
        updateDraft({ comments: [...draft.comments, newComment] });
      }
    },
    [draft, updateDraft],
  );

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      if (!draft) return;
      updateDraft({
        comments: draft.comments.filter((c) => c.id !== commentId),
      });
    },
    [draft, updateDraft],
  );

  const loadImage = useCallback(
    async (attachment: Attachment, signal: AbortSignal) => {
      return materializeImage(attachment, signal);
    },
    [materializeImage],
  );

  const loadEncryptedImage = useCallback(
    async (attachment: Attachment, signal: AbortSignal) => {
      return materializeImage(attachment, signal);
    },
    [materializeImage],
  );

  const handleDateChange = useCallback(
    (newDate: Date) => {
      updateDraft({ date: newDate.toISOString() });
    },
    [updateDraft],
  );

  const handleBack = useCallback(() => {
    if (isEditing && isDirty) {
      confirmDestructive(
        t.page.discardChanges,
        t.page.discardMessage,
        { confirm: t.page.discard, cancel: t.page.keep },
        () => {
          if (isLockedNow()) return;
          const forgotten = forgetDraft();
          if (page) setDraft({ ...page });
          setIsDirty(false);
          setIsEditing(false);
          void forgotten.then(safeBack);
        },
      );
    } else {
      safeBack();
    }
  }, [isEditing, isDirty, page, t, safeBack, forgetDraft]);

  // No key in memory (web reload, deep link) and the page does not open:
  // the journal is locked, not empty.
  if ((revoked && locked) || locking || (!derivedKey && !!pageError)) {
    return (
      <ThemeContext.Provider value={themeContextValue}>
        <LockedPlaceholder />
      </ThemeContext.Provider>
    );
  }

  if (loading) {
    return (
      <ThemeContext.Provider value={themeContextValue}>
        <View
          style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}
        >
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </ThemeContext.Provider>
    );
  }

  if (!draft) {
    return (
      <ThemeContext.Provider value={themeContextValue}>
        <View style={[styles.container, { backgroundColor: theme.colors.background }]} />
      </ThemeContext.Provider>
    );
  }

  const dateObj = new Date(draft.date);
  const dateStr = dateObj.toLocaleDateString();
  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const plainImages = draft.images.filter((img) => !img.encrypted);
  const encryptedImages = draft.images.filter((img) => img.encrypted);
  const firstImageId = draft.images.find((img) => !img.deleted)?.id;
  const allFiles = [
    ...draft.files.filter((f) => !f.encrypted),
    ...draft.files.filter((f) => f.encrypted),
  ];

  return (
    <ThemeContext.Provider value={themeContextValue}>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <PageHeader
          date={dateStr}
          time={timeStr}
          dateValue={dateObj}
          isEditing={isEditing}
          onDateChange={handleDateChange}
          onBack={handleBack}
        />

        {draftRestored && (
          <View
            testID="draft-restored"
            style={[
              styles.draftBanner,
              { backgroundColor: theme.colors.highlight, borderColor: theme.colors.border },
            ]}
          >
            <Text
              style={[
                styles.draftBannerText,
                { color: theme.colors.text, fontFamily: theme.fonts.regular },
              ]}
            >
              {t.privacy.draftRestored}
            </Text>
            <Pressable onPress={handleDiscardDraft} accessibilityRole="button">
              <Text
                style={[
                  styles.draftBannerAction,
                  { color: theme.colors.primary, fontFamily: theme.fonts.bold },
                ]}
              >
                {t.privacy.discardDraft}
              </Text>
            </Pressable>
          </View>
        )}

        <KeyboardAwareScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid
          enableAutomaticScroll={Platform.OS !== 'web'}
          extraScrollHeight={Platform.OS === 'ios' ? 20 : 80}
          keyboardOpeningTime={0}
        >
          <TagEditor
            tags={draft.tags}
            allJournalTags={journalTags}
            editable={isEditing}
            onChange={(tags) => updateDraft({ tags })}
          />

          <ImageCarousel
            images={plainImages}
            thumbnail={plainImages[0]?.id === firstImageId ? draft.thumbnail : undefined}
            editable={isEditing}
            onRemove={handleRemoveImage}
            onMoveLeft={(imgId) => handleMoveImage(imgId, 'left', false)}
            onMoveRight={(imgId) => handleMoveImage(imgId, 'right', false)}
            onDownload={handleDownloadImage}
            loadImage={loadImage}
          />

          {encryptedImages.length > 0 && (
            <ImageCarousel
              images={encryptedImages}
              thumbnail={encryptedImages[0]?.id === firstImageId ? draft.thumbnail : undefined}
              encrypted
              editable={isEditing}
              onRemove={handleRemoveImage}
              onMoveLeft={(imgId) => handleMoveImage(imgId, 'left', true)}
              onMoveRight={(imgId) => handleMoveImage(imgId, 'right', true)}
              onDownload={handleDownloadImage}
              loadImage={loadEncryptedImage}
            />
          )}

          {draft.location && (
            <LocationTag
              location={draft.location}
              editable={isEditing}
              onRemove={() => updateDraft({ location: undefined })}
            />
          )}

          <FileRow
            files={allFiles}
            editable={isEditing}
            onRemove={handleRemoveFile}
            onOpen={handleOpenFile}
          />

          <PageContent
            content={draft.text}
            isEditing={isEditing}
            onChangeText={(text) => updateDraft({ text })}
          />

          <CommentList
            comments={draft.comments}
            editable={isEditing}
            onAdd={() => {
              setEditingComment(null);
              setCommentModalVisible(true);
            }}
            onEdit={(comment) => {
              setEditingComment(comment);
              setCommentModalVisible(true);
            }}
            onDelete={handleDeleteComment}
          />
        </KeyboardAwareScrollView>

        <FloatingActionButton
          featherIcon={isEditing ? 'check' : 'edit-2'}
          onPress={isEditing ? handleSave : handleToggleEdit}
          backgroundColor={
            isEditing
              ? theme.colors.popAction.save.background
              : theme.colors.popAction.edit.background
          }
          color={isEditing ? theme.colors.popAction.save.text : theme.colors.popAction.edit.text}
        />

        {isEditing && (
          <FloatingActionButton
            icon="+"
            onPress={() => setAddPopupVisible(true)}
            backgroundColor={theme.colors.popAction.new.background}
            color={theme.colors.popAction.new.text}
            bottom={90}
          />
        )}

        {isEditing && (
          <FloatingActionButton
            featherIcon="trash-2"
            onPress={handleDelete}
            backgroundColor={theme.colors.popAction.delete.background}
            color={theme.colors.popAction.delete.text}
            position="left"
          />
        )}

        {isEditing && (
          <AddAttachmentPopup
            visible={addPopupVisible}
            onClose={() => setAddPopupVisible(false)}
            onAddImage={() => handleAddImage(false, 'library')}
            onAddEncryptedImage={() => handleAddImage(true, 'library')}
            onTakePhoto={() => handleAddImage(false, 'camera')}
            onTakeEncryptedPhoto={() => handleAddImage(true, 'camera')}
            onAddFile={() => handleAddFile(false)}
            onAddEncryptedFile={() => handleAddFile(true)}
            onAddLocation={handleAddLocation}
            onAddComment={() => {
              setEditingComment(null);
              setCommentModalVisible(true);
            }}
            hasLocation={!!draft.location}
          />
        )}

        <CommentModal
          visible={commentModalVisible}
          comment={editingComment}
          onSave={handleSaveComment}
          onDelete={handleDeleteComment}
          onClose={() => setCommentModalVisible(false)}
        />
      </View>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 10,
    paddingBottom: 100,
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 10,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  draftBannerText: {
    flex: 1,
    fontSize: 14,
  },
  draftBannerAction: {
    fontSize: 14,
  },
});
