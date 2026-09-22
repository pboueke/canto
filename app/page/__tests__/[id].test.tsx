import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { Page } from 'canto-data';
import { JournalKeyProvider, useJournalKeys } from '@/contexts/JournalKeyContext';
import { JournalLockedError } from '@/lib/storage/integrity';
import { dictionaries } from '@/i18n/dictionaries';

const t = dictionaries.en;

const p1: Page = {
  id: 'p1',
  text: 'Page p1 content',
  date: '2026-03-12T10:00:00Z',
  tags: [],
  files: [],
  images: [],
  comments: [],
  modified: 1_700_000_000_000,
  deleted: false,
};

const mockSave = jest.fn();
const mockDeletePage = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@/hooks/useTheme', () => {
  const { createContext } = require('react');
  const theme = {
    isDark: false,
    borderWidth: 1,
    fonts: { regular: 'System', bold: 'System' },
    colors: {
      background: '#fff',
      foreground: '#f5f5f5',
      text: '#111',
      textSecondary: '#666',
      primary: '#000',
      border: '#ddd',
      highlight: '#eee',
      popAction: {
        save: { background: '#111', text: '#fff' },
        edit: { background: '#222', text: '#fff' },
        new: { background: '#333', text: '#fff' },
        delete: { background: '#444', text: '#fff' },
      },
    },
  };
  const value = { theme, setThemeName: () => {}, isDark: false };
  return { ThemeContext: createContext(value), useTheme: () => value };
});
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: require('@/i18n/dictionaries').dictionaries.en }),
}));
jest.mock('@/contexts/FontPrefsContext', () => ({
  useFontPrefs: () => ({ fontFamily: 'System', fontSize: 16 }),
}));
jest.mock('@/hooks/useSafeBack', () => ({ useSafeBack: () => jest.fn() }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ addListener: jest.fn(() => jest.fn()), dispatch: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'p1', journalId: 'j1', edit: 'true' }),
}));
jest.mock('@/components/home/SecuritySettingsModal', () => ({
  getAutoLockTimeout: async () => 0,
  AUTO_LOCK_OPTIONS: [],
}));
jest.mock('@/lib/attachment-display', () => ({
  purgeAttachmentDisplayCache: jest.fn(),
  purgeEncryptedAttachmentDisplayCache: jest.fn(),
}));
jest.mock('@/hooks/useStorage', () => ({
  usePage: () => ({ page: p1, loading: false }),
  useSavePage: () => ({ save: mockSave }),
  useDeletePage: () => ({ deletePage: mockDeletePage }),
  useJournalTags: () => ({ tags: [] }),
  useAttachment: () => ({
    saveAttachmentStream: jest.fn(),
    getAttachment: jest.fn(),
    materializeImage: jest.fn(),
  }),
}));
jest.mock('@/lib/thumbnail', () => ({ generateThumbnail: jest.fn(async () => 'thumb') }));
jest.mock('@/lib/pagePreview', () => ({ canGenerateThumbnailFromAttachment: () => false }));
jest.mock('@/lib/downloadAttachment', () => ({ downloadAttachment: jest.fn() }));
jest.mock('@/lib/image-ingestion', () => ({ persistPickedImage: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-location', () => ({}));
jest.mock('react-native-keyboard-aware-scroll-view', () => {
  const { View } = require('react-native');
  return {
    KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});
jest.mock('@/components/page/PageHeader', () => ({ PageHeader: () => null }));
jest.mock('@/components/page/TagEditor', () => ({ TagEditor: () => null }));
jest.mock('@/components/page/ImageCarousel', () => ({ ImageCarousel: () => null }));
jest.mock('@/components/page/FileRow', () => ({ FileRow: () => null }));
jest.mock('@/components/page/LocationTag', () => ({ LocationTag: () => null }));
jest.mock('@/components/page/CommentList', () => ({ CommentList: () => null }));
jest.mock('@/components/page/CommentModal', () => ({ CommentModal: () => null }));
jest.mock('@/components/page/AddAttachmentPopup', () => ({ AddAttachmentPopup: () => null }));
jest.mock('@/components/page/PageContent', () => {
  const { Text, Pressable } = require('react-native');
  return {
    PageContent: ({
      content,
      onChangeText,
    }: {
      content: string;
      onChangeText: (text: string) => void;
    }) => (
      <>
        <Text testID="page-content-text">{content}</Text>
        <Pressable testID="page-content-edit" onPress={() => onChangeText('edited text')}>
          <Text>edit</Text>
        </Pressable>
      </>
    ),
  };
});
jest.mock('@/components/common/FloatingActionButton', () => {
  const { Text, Pressable } = require('react-native');
  return {
    FloatingActionButton: ({
      featherIcon,
      icon,
      onPress,
    }: {
      featherIcon?: string;
      icon?: string;
      onPress: () => void;
    }) => (
      <Pressable testID={`fab-${featherIcon ?? icon}`} onPress={onPress}>
        <Text>{featherIcon ?? icon}</Text>
      </Pressable>
    ),
  };
});

const PageScreen = require('../[id]').default;

// A fresh non-zero key per mounted editor. clearKey zeroes the bound key buffer
// in place, so a shared module-level constant would be all-zero after the first
// test and would no longer represent a valid unlocked lease.
function createTestKey(): Uint8Array {
  return new Uint8Array(32).fill(7);
}

// The editor is mocked at the data layer, but the key lease is real: a mounted
// editor observes its own write capability through the actual useKeyLease hook.
let capturedApi: ReturnType<typeof useJournalKeys> | undefined;

function EditorWithKey() {
  const keys = useJournalKeys();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    keys.setKey('j1', createTestKey());
    capturedApi = keys;
    setArmed(true);
  }, []);
  return armed ? <PageScreen /> : null;
}

async function renderEditor() {
  const utils = render(
    <JournalKeyProvider>
      <EditorWithKey />
    </JournalKeyProvider>,
  );
  await waitFor(() => expect(utils.getByTestId('page-content-text')).toBeTruthy());
  return utils;
}

describe('page editor auto-lock write safety', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedApi = undefined;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('a mounted editor cannot save after its lease is revoked, and keeps the draft', async () => {
    const { getByTestId, getByText } = await renderEditor();

    // Establish an edit while the lease is still valid.
    fireEvent.press(getByTestId('page-content-edit'));
    expect(getByText('edited text')).toBeTruthy();

    // Revoke the lease exactly like an auto-lock does.
    act(() => {
      capturedApi!.clearKey('j1');
    });

    fireEvent.press(getByTestId('fab-check'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(t.page.unlockRequired));
    expect(mockSave).not.toHaveBeenCalled();
    // The draft is retained, never silently discarded.
    expect(getByText('edited text')).toBeTruthy();
  });

  it('a revoked lease blocks a pending delete without mutating storage', async () => {
    const { getByTestId } = await renderEditor();

    act(() => {
      capturedApi!.clearKey('j1');
    });

    fireEvent.press(getByTestId('fab-trash-2'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    const confirmCall = alertSpy.mock.calls.find((call) => call[0] === t.page.deleteConfirm);
    expect(confirmCall).toBeDefined();
    const destructive = (confirmCall![2] as { style?: string; onPress?: () => void }[]).find(
      (button) => button.style === 'destructive',
    );
    expect(destructive).toBeDefined();

    await act(async () => {
      await destructive!.onPress?.();
    });

    expect(mockDeletePage).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(t.page.unlockRequired);
  });

  it('a save that races a revoked key fails closed and surfaces the localized lock message', async () => {
    mockSave.mockRejectedValueOnce(new JournalLockedError());

    const { getByTestId, getByText } = await renderEditor();

    fireEvent.press(getByTestId('page-content-edit'));
    fireEvent.press(getByTestId('fab-check'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(t.page.unlockRequired, expect.any(String)),
    );
    expect(mockSave).toHaveBeenCalledTimes(1);
    // The in-memory draft survives the rejected save.
    expect(getByText('edited text')).toBeTruthy();
  });

  it('saves normally while the lease is valid', async () => {
    mockSave.mockResolvedValueOnce(undefined);
    const { getByTestId } = await renderEditor();

    fireEvent.press(getByTestId('page-content-edit'));
    fireEvent.press(getByTestId('fab-check'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', text: 'edited text' }),
    );
    expect(alertSpy).not.toHaveBeenCalledWith(t.page.unlockRequired);
  });
});
