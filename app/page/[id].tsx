import { useState, useEffect, useCallback, useMemo } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';
import { Paths, File as ExpoFile } from 'expo-file-system';
import { ThemeContext, useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { type ThemeName, themes } from '@/styles/themes';
import {
  usePage,
  useSavePage,
  useDeletePage,
  useJournalTags,
  useAttachment,
} from '@/hooks/useStorage';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
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
import type { Attachment, Comment, GeoLocation, Page } from '@/models';

function generateUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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

  const overrideTheme =
    themeOverride && themeOverride in themes ? themes[themeOverride as ThemeName] : null;
  const theme = overrideTheme ?? globalTheme;
  const isDark = theme.isDark;
  const themeContextValue = useMemo(
    () => ({ theme, setThemeName, isDark }),
    [theme, setThemeName, isDark],
  );
  const { getKey } = useJournalKeys();

  const derivedKey = journalId ? getKey(journalId) : null;
  const { page, loading } = usePage(journalId, id, derivedKey);
  const { save } = useSavePage(journalId, derivedKey);
  const { deletePage } = useDeletePage(journalId, derivedKey);
  const { tags: journalTags } = useJournalTags(journalId, derivedKey);
  const { saveAttachment, getAttachment } = useAttachment(derivedKey);

  const [isEditing, setIsEditing] = useState(edit === 'true');
  const [draft, setDraft] = useState<Page | null>(null);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [addPopupVisible, setAddPopupVisible] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (page && !draft) {
      setDraft({ ...page });
    }
  }, [page]);

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
    await save({ ...draft, modified: Date.now() });
    setIsDirty(false);
    setIsEditing(false);
  }, [draft, save]);

  const handleDelete = useCallback(() => {
    Alert.alert(t.page.deleteConfirm, t.page.deleteMessage, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: async () => {
          if (id) {
            await deletePage(id);
            router.back();
          }
        },
      },
    ]);
  }, [id, deletePage, t]);

  const handleToggleEdit = useCallback(() => {
    if (isEditing && isDirty) {
      Alert.alert(t.page.discardChanges, t.page.discardMessage, [
        { text: t.page.keep, style: 'cancel' },
        {
          text: t.page.discard,
          style: 'destructive',
          onPress: () => {
            if (page) setDraft({ ...page });
            setIsDirty(false);
            setIsEditing(false);
          },
        },
      ]);
    } else {
      setIsEditing(!isEditing);
    }
  }, [isEditing, isDirty, page, t]);

  // Attachment handlers
  const handleAddImage = useCallback(
    async (encrypted: boolean) => {
      if (!draft || !journalId || !id) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets[0]?.base64) return;

      const asset = result.assets[0];
      const base64Data = asset.base64!;
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const attachment: Attachment = {
        id: generateUUID(),
        path: '',
        name: `image-${Date.now()}.${ext}`,
        type: 'image',
        encrypted,
        size: base64Data.length * 0.75, // approximate decoded size
        deleted: false,
      };

      const path = await saveAttachment(journalId!, id!, attachment, base64Data);
      attachment.path = path;

      updateDraft({ images: [...draft.images, attachment] });
    },
    [draft, journalId, id, saveAttachment, updateDraft],
  );

  const handleAddFile = useCallback(
    async (encrypted: boolean) => {
      if (!draft || !journalId || !id) return;
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const file = new ExpoFile(asset.uri);
      const bytes = await file.bytes();
      let b64 = '';
      for (let i = 0; i < bytes.length; i++) {
        b64 += String.fromCharCode(bytes[i]);
      }
      b64 = btoa(b64);

      const attachment: Attachment = {
        id: generateUUID(),
        path: '',
        name: asset.name,
        type: 'file',
        encrypted,
        size: bytes.length,
        deleted: false,
      };

      const path = await saveAttachment(journalId!, id!, attachment, b64);
      attachment.path = path;

      updateDraft({ files: [...draft.files, attachment] });
    },
    [draft, journalId, id, saveAttachment, updateDraft],
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
      updateDraft({ images: list });
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

      const tempDir = Paths.cache;
      const tempFile = new ExpoFile(tempDir, file.name);
      if (!tempFile.exists) {
        tempFile.create({ intermediates: true });
      }
      const decoded = atob(data);
      tempFile.write(decoded);

      await Sharing.shareAsync(tempFile.uri);
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
    async (path: string): Promise<string | null> => {
      const data = await getAttachment(path, false);
      if (!data) return null;
      return `data:image/jpeg;base64,${data}`;
    },
    [getAttachment],
  );

  const loadEncryptedImage = useCallback(
    async (path: string): Promise<string | null> => {
      const data = await getAttachment(path, true);
      if (!data) return null;
      return `data:image/jpeg;base64,${data}`;
    },
    [getAttachment],
  );

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
  const allFiles = [
    ...draft.files.filter((f) => !f.encrypted),
    ...draft.files.filter((f) => f.encrypted),
  ];

  return (
    <ThemeContext.Provider value={themeContextValue}>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <PageHeader date={dateStr} time={timeStr} />

        <ScrollView contentContainerStyle={styles.content}>
          <TagEditor
            tags={draft.tags}
            allJournalTags={journalTags}
            editable={isEditing}
            onChange={(tags) => updateDraft({ tags })}
          />

          <ImageCarousel
            images={plainImages}
            editable={isEditing}
            onRemove={handleRemoveImage}
            onMoveLeft={(imgId) => handleMoveImage(imgId, 'left', false)}
            onMoveRight={(imgId) => handleMoveImage(imgId, 'right', false)}
            loadImage={loadImage}
          />

          {encryptedImages.length > 0 && (
            <ImageCarousel
              images={encryptedImages}
              encrypted
              editable={isEditing}
              onRemove={handleRemoveImage}
              onMoveLeft={(imgId) => handleMoveImage(imgId, 'left', true)}
              onMoveRight={(imgId) => handleMoveImage(imgId, 'right', true)}
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
        </ScrollView>

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
            onAddImage={() => handleAddImage(false)}
            onAddEncryptedImage={() => handleAddImage(true)}
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
});
