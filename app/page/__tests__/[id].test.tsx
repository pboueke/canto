import React, { useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
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
const mockSaveDraft = jest.fn(async () => {});
const mockGetDraft = jest.fn(async (): Promise<Page | null> => null);
const mockDeleteDraft = jest.fn(async () => {});
const mockGetAttachment = jest.fn();
const mockCanGenerateThumbnail = jest.fn(() => false);
const mockGetAutoLockTimeout = jest.fn(async () => 0);
let mockPage: Page = p1;
let mockPageError: Error | null = null;
const mockNavigationListeners: Record<string, (event: unknown) => void> = {};

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
const mockSafeBack = jest.fn();
const mockNavDispatch = jest.fn();
jest.mock('@/hooks/useSafeBack', () => ({ useSafeBack: () => mockSafeBack }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    addListener: jest.fn((name: string, listener: (event: unknown) => void) => {
      mockNavigationListeners[name] = listener;
      return jest.fn();
    }),
    dispatch: mockNavDispatch,
  }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'p1', journalId: 'j1', edit: 'true' }),
}));
jest.mock('@/components/home/SecuritySettingsModal', () => ({
  getAutoLockTimeout: () => mockGetAutoLockTimeout(),
  AUTO_LOCK_OPTIONS: [],
}));
jest.mock('@/lib/attachment-display', () => ({
  purgeAttachmentDisplayCache: jest.fn(),
  purgeEncryptedAttachmentDisplayCache: jest.fn(),
}));
jest.mock('@/hooks/useStorage', () => ({
  usePage: () => ({
    page: mockPageError ? null : mockPage,
    loading: false,
    error: mockPageError,
  }),
  saveDraft: (...args: unknown[]) => (mockSaveDraft as (...a: unknown[]) => unknown)(...args),
  getDraft: (...args: unknown[]) => (mockGetDraft as (...a: unknown[]) => unknown)(...args),
  deleteDraft: (...args: unknown[]) => (mockDeleteDraft as (...a: unknown[]) => unknown)(...args),
  useSavePage: () => ({ save: mockSave }),
  useDeletePage: () => ({ deletePage: mockDeletePage }),
  useJournalTags: () => ({ tags: [] }),
  useAttachment: () => ({
    saveAttachmentStream: jest.fn(),
    getAttachment: mockGetAttachment,
    materializeImage: jest.fn(),
  }),
}));
jest.mock('@/lib/thumbnail', () => ({ generateThumbnail: jest.fn(async () => 'thumb') }));
jest.mock('@/lib/pagePreview', () => ({
  canGenerateThumbnailFromAttachment: () => mockCanGenerateThumbnail(),
}));
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
    mockPage = p1;
    mockGetDraft.mockResolvedValue(null);
    mockCanGenerateThumbnail.mockReturnValue(false);
    mockGetAutoLockTimeout.mockResolvedValue(0);
    for (const name of Object.keys(mockNavigationListeners)) delete mockNavigationListeners[name];
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('hides every decrypted field once the journal is locked', async () => {
    const { getByTestId, queryByTestId, queryByText } = await renderEditor();
    fireEvent.press(getByTestId('page-content-edit'));
    expect(queryByText('edited text')).toBeTruthy();

    act(() => {
      capturedApi!.clearKey('j1');
    });

    expect(getByTestId('journal-locked')).toBeTruthy();
    expect(queryByTestId('page-content-text')).toBeNull();
    expect(queryByText('edited text')).toBeNull();
    expect(queryByText('Page p1 content')).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('a revoked lease blocks a delete confirmed after the lock', async () => {
    const { getByTestId } = await renderEditor();

    fireEvent.press(getByTestId('fab-trash-2'));
    const confirmCall = alertSpy.mock.calls.find((call) => call[0] === t.page.deleteConfirm);
    const destructive = (confirmCall![2] as { style?: string; onPress?: () => void }[]).find(
      (button) => button.style === 'destructive',
    );

    act(() => {
      capturedApi!.clearKey('j1');
    });
    await act(async () => {
      await destructive!.onPress?.();
    });

    expect(mockDeletePage).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(t.page.unlockRequired);
  });

  it('re-checks the live lease after awaited thumbnail work', async () => {
    mockPage = {
      ...p1,
      images: [
        { id: 'i1', path: '/img', name: 'a.jpg', type: 'image', encrypted: false, deleted: false },
      ],
    };
    mockCanGenerateThumbnail.mockReturnValue(true);
    let releaseAttachment!: (value: string | null) => void;
    mockGetAttachment.mockReturnValue(
      new Promise((resolve) => {
        releaseAttachment = resolve;
      }),
    );
    const { getByTestId } = await renderEditor();

    fireEvent.press(getByTestId('page-content-edit'));
    fireEvent.press(getByTestId('fab-check'));
    await waitFor(() => expect(mockGetAttachment).toHaveBeenCalled());

    act(() => {
      capturedApi!.clearKey('j1');
    });
    await act(async () => {
      releaseAttachment(null);
    });

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(t.page.unlockRequired));
    expect(mockSave).not.toHaveBeenCalled();
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

  it('saves normally while the lease is valid and drops the stored draft', async () => {
    mockSave.mockResolvedValueOnce(undefined);
    const { getByTestId } = await renderEditor();

    fireEvent.press(getByTestId('page-content-edit'));
    fireEvent.press(getByTestId('fab-check'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', text: 'edited text' }),
    );
    expect(alertSpy).not.toHaveBeenCalledWith(t.page.unlockRequired);
    await waitFor(() => expect(mockDeleteDraft).toHaveBeenCalledWith('j1', 'p1'));
  });
});

describe('page editor encrypted drafts', () => {
  let alertSpy: jest.SpyInstance;
  let appStateHandlers: ((state: string) => void)[];

  beforeEach(() => {
    jest.clearAllMocks();
    mockPage = p1;
    mockGetDraft.mockResolvedValue(null);
    mockGetAutoLockTimeout.mockResolvedValue(0);
    for (const name of Object.keys(mockNavigationListeners)) delete mockNavigationListeners[name];
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    appStateHandlers = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      handler: (state: string) => void,
    ) => {
      appStateHandlers.push(handler);
      return { remove: jest.fn() };
    }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function emitAppState(state: string) {
    await act(async () => {
      for (const handler of appStateHandlers) await handler(state);
    });
  }

  it('stores the unsaved draft, encrypted with a private copy of the live key', async () => {
    const seen: Uint8Array[] = [];
    mockSaveDraft.mockImplementation((async (...args: unknown[]) => {
      seen.push(new Uint8Array(args[2] as Uint8Array));
    }) as never);
    const { getByTestId } = await renderEditor();
    fireEvent.press(getByTestId('page-content-edit'));

    await emitAppState('background');

    expect(mockSaveDraft).toHaveBeenCalledWith(
      'j1',
      expect.objectContaining({ id: 'p1', text: 'edited text' }),
      expect.any(Uint8Array),
    );
    // The key was usable when written, and is a copy: the live key is intact
    // while the copy is wiped once the write settles.
    expect(seen[0].some((byte) => byte !== 0)).toBe(true);
    const passed = (mockSaveDraft.mock.calls[0] as unknown[])[2] as Uint8Array;
    expect(passed).not.toBe(capturedApi!.getKey('j1'));
    expect(passed.every((byte) => byte === 0)).toBe(true);
    expect(capturedApi!.getKey('j1')!.some((byte) => byte !== 0)).toBe(true);
  });

  it('does not store anything when nothing was edited', async () => {
    await renderEditor();
    await emitAppState('background');
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  it('flushes the draft before an auto-lock zeroes the key, then hides it', async () => {
    mockGetAutoLockTimeout.mockResolvedValue(1);
    const { getByTestId, queryByText } = await renderEditor();
    fireEvent.press(getByTestId('page-content-edit'));

    await emitAppState('background');
    mockSaveDraft.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await emitAppState('active');

    await waitFor(() => expect(getByTestId('journal-locked')).toBeTruthy());
    expect(mockSaveDraft).toHaveBeenCalledTimes(1);
    const key = (mockSaveDraft.mock.calls[0] as unknown[])[2] as Uint8Array;
    // The key was usable when the draft was written, and zeroed afterwards.
    expect(key.every((byte) => byte === 0)).toBe(true);
    expect(queryByText('edited text')).toBeNull();
  });

  // Reviewer finding 2: the lock screen can be dismissed while drafts are
  // still flushing. Content must already be hidden, guards bypassed, and a
  // stale discard prompt must not delete the draft the lock is storing.
  it('hides content as soon as an auto-lock starts, before keys are zeroed', async () => {
    mockGetAutoLockTimeout.mockResolvedValue(1);
    let finishFlush!: () => void;
    mockSaveDraft.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishFlush = resolve;
        }),
    );
    const { getByTestId, queryByText } = await renderEditor();
    fireEvent.press(getByTestId('page-content-edit'));

    // A discard prompt was already open when the lock fired.
    const pending = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
    mockNavigationListeners.beforeRemove(pending);
    const prompt = alertSpy.mock.calls.find((call) => call[0] === t.page.discardChanges);
    const staleDiscard = (prompt![2] as { style?: string; onPress?: () => void }[]).find(
      (button) => button.style === 'destructive',
    );

    await emitAppState('background');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await act(async () => {
      void appStateHandlers.forEach((handler) => handler('active'));
      await Promise.resolve();
    });
    await waitFor(() => expect(getByTestId('journal-locked')).toBeTruthy());
    // Keys are still live while the draft flush is pending.
    expect(capturedApi!.getKey('j1')).not.toBeNull();
    expect(queryByText('edited text')).toBeNull();

    // Dismissing the lock screen now passes straight through the guard.
    const dismiss = { preventDefault: jest.fn(), data: { action: {} } };
    mockNavigationListeners.beforeRemove(dismiss);
    expect(dismiss.preventDefault).not.toHaveBeenCalled();

    act(() => staleDiscard!.onPress?.());
    expect(mockDeleteDraft).not.toHaveBeenCalled();

    await act(async () => {
      finishFlush();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(capturedApi!.getKey('j1')).toBeNull());
    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });

  it('never traps a locked editor behind the discard prompt', async () => {
    const { getByTestId } = await renderEditor();
    fireEvent.press(getByTestId('page-content-edit'));

    const dirtyEvent = { preventDefault: jest.fn(), data: { action: {} } };
    mockNavigationListeners.beforeRemove(dirtyEvent);
    expect(dirtyEvent.preventDefault).toHaveBeenCalled();

    act(() => {
      capturedApi!.clearKey('j1');
    });
    const lockedEvent = { preventDefault: jest.fn(), data: { action: {} } };
    mockNavigationListeners.beforeRemove(lockedEvent);
    expect(lockedEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('discarding changes from the prompt also deletes the stored draft', async () => {
    const { getByTestId } = await renderEditor();
    fireEvent.press(getByTestId('page-content-edit'));
    const event = { preventDefault: jest.fn(), data: { action: {} } };
    mockNavigationListeners.beforeRemove(event);
    const prompt = alertSpy.mock.calls.find((call) => call[0] === t.page.discardChanges);
    const discard = (prompt![2] as { style?: string; onPress?: () => void }[]).find(
      (button) => button.style === 'destructive',
    );
    act(() => discard!.onPress?.());
    await waitFor(() => expect(mockDeleteDraft).toHaveBeenCalledWith('j1', 'p1'));
  });

  it('restores a stored draft after unlock, and can discard it', async () => {
    mockGetDraft.mockResolvedValue({ ...p1, text: 'restored words' });
    const { getByTestId, getByText, queryByTestId } = await renderEditor();

    await waitFor(() => expect(getByText('restored words')).toBeTruthy());
    expect(getByTestId('draft-restored')).toBeTruthy();
    expect(mockGetDraft).toHaveBeenCalledWith('j1', 'p1', expect.any(Uint8Array));

    fireEvent.press(getByText(t.privacy.discardDraft));
    // Discarding asks first.
    const prompt = alertSpy.mock.calls.find((call) => call[0] === t.privacy.discardDraft);
    expect(mockDeleteDraft).not.toHaveBeenCalled();
    const discard = (prompt![2] as { style?: string; onPress?: () => void }[]).find(
      (button) => button.style === 'destructive',
    );
    act(() => discard!.onPress?.());
    await waitFor(() => expect(getByText('Page p1 content')).toBeTruthy());
    expect(queryByTestId('draft-restored')).toBeNull();
    expect(mockDeleteDraft).toHaveBeenCalledWith('j1', 'p1');
  });

  it('deleting the page from a restored draft also discards the draft, without a prompt', async () => {
    mockGetDraft.mockResolvedValue({ ...p1, text: 'restored words' });
    const { getByTestId, findByText } = await renderEditor();
    await findByText('restored words');

    fireEvent.press(getByTestId('fab-trash-2'));
    const confirm = alertSpy.mock.calls.find((call) => call[0] === t.page.deleteConfirm);
    const destructive = (confirm![2] as { style?: string; onPress?: () => Promise<void> }[]).find(
      (button) => button.style === 'destructive',
    );
    await act(async () => {
      await destructive!.onPress?.();
    });

    expect(mockDeletePage).toHaveBeenCalledWith('p1');
    expect(mockDeleteDraft).toHaveBeenCalledWith('j1', 'p1');
    // Leaving the deleted page never asks to discard changes.
    const leave = { preventDefault: jest.fn(), data: { action: {} } };
    mockNavigationListeners.beforeRemove(leave);
    expect(leave.preventDefault).not.toHaveBeenCalled();
    expect(alertSpy.mock.calls.some((call) => call[0] === t.page.discardChanges)).toBe(false);
    // Nothing stores the draft again on the way out.
    mockSaveDraft.mockClear();
    await emitAppState('background');
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  it('leaves a deleted page only after its draft is gone, so the journal list never shows it', async () => {
    mockGetDraft.mockResolvedValue({ ...p1, text: 'restored words' });
    let finishDraftDelete!: () => void;
    mockDeleteDraft.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishDraftDelete = resolve)),
    );
    mockSafeBack.mockClear();
    const { getByTestId, findByText } = await renderEditor();
    await findByText('restored words');

    fireEvent.press(getByTestId('fab-trash-2'));
    const confirm = alertSpy.mock.calls.find((call) => call[0] === t.page.deleteConfirm);
    const destructive = (confirm![2] as { style?: string; onPress?: () => Promise<void> }[]).find(
      (button) => button.style === 'destructive',
    );
    let deleting!: Promise<void> | undefined;
    act(() => {
      deleting = destructive!.onPress?.();
    });
    await waitFor(() => expect(mockDeleteDraft).toHaveBeenCalledWith('j1', 'p1'));
    expect(mockSafeBack).not.toHaveBeenCalled();

    await act(async () => {
      finishDraftDelete();
      await deleting;
    });
    expect(mockSafeBack).toHaveBeenCalledTimes(1);
  });

  it('discarding changes on Back waits for the draft delete before leaving', async () => {
    mockGetDraft.mockResolvedValue({ ...p1, text: 'restored words' });
    let finishDraftDelete!: () => void;
    mockDeleteDraft.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishDraftDelete = resolve)),
    );
    mockNavDispatch.mockClear();
    const { findByText } = await renderEditor();
    await findByText('restored words');

    const leave = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
    mockNavigationListeners.beforeRemove(leave);
    expect(leave.preventDefault).toHaveBeenCalled();
    const prompt = alertSpy.mock.calls.find((call) => call[0] === t.page.discardChanges);
    const discard = (prompt![2] as { style?: string; onPress?: () => void }[]).find(
      (button) => button.style === 'destructive',
    );
    act(() => discard!.onPress?.());
    expect(mockDeleteDraft).toHaveBeenCalledWith('j1', 'p1');
    expect(mockNavDispatch).not.toHaveBeenCalled();

    await act(async () => {
      finishDraftDelete();
    });
    expect(mockNavDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('keeps the draft and the guard when deleting the page fails', async () => {
    mockGetDraft.mockResolvedValue({ ...p1, text: 'restored words' });
    mockDeletePage.mockRejectedValueOnce(new Error('disk full'));
    const { getByTestId, findByText } = await renderEditor();
    await findByText('restored words');
    fireEvent.press(getByTestId('fab-trash-2'));
    const confirm = alertSpy.mock.calls.find((call) => call[0] === t.page.deleteConfirm);
    const destructive = (confirm![2] as { style?: string; onPress?: () => Promise<void> }[]).find(
      (button) => button.style === 'destructive',
    );
    await act(async () => {
      await destructive!.onPress?.();
    });
    expect(alertSpy).toHaveBeenCalledWith('Error', 'disk full');
    expect(mockDeleteDraft).not.toHaveBeenCalled();
    const leave = { preventDefault: jest.fn(), data: { action: {} } };
    mockNavigationListeners.beforeRemove(leave);
    expect(leave.preventDefault).toHaveBeenCalled();
  });

  // Data-loss review: a draft older than the saved page (sync, remote
  // delete, failed cleanup) must not silently replace it, nor vanish.
  function conflictPrompt() {
    const prompt = alertSpy.mock.calls.find((call) => call[0] === t.privacy.draftConflictTitle);
    return prompt![2] as { text: string; onPress?: () => void }[];
  }

  it('asks before restoring a draft older than the saved page, and can use it', async () => {
    mockGetDraft.mockResolvedValue({ ...p1, text: 'older words', modified: p1.modified - 1 });
    const { findByText, getByTestId, queryByText } = await renderEditor();
    await waitFor(() => expect(conflictPrompt()).toBeDefined());
    expect(queryByText('older words')).toBeNull();

    act(() => conflictPrompt().find((button) => button.text === t.privacy.useDraft)!.onPress!());
    expect(await findByText('older words')).toBeTruthy();
    expect(getByTestId('draft-restored')).toBeTruthy();
    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });

  it('keeps the saved page and discards the older draft when the user chooses so', async () => {
    mockGetDraft.mockResolvedValue({ ...p1, text: 'older words', modified: p1.modified - 1 });
    const { getByText, queryByText } = await renderEditor();
    await waitFor(() => expect(conflictPrompt()).toBeDefined());

    act(() => conflictPrompt().find((button) => button.text === t.privacy.keepSaved)!.onPress!());
    await waitFor(() => expect(mockDeleteDraft).toHaveBeenCalledWith('j1', 'p1'));
    expect(getByText('Page p1 content')).toBeTruthy();
    expect(queryByText('older words')).toBeNull();
  });

  it('does not store a discarded draft again from a flush that fires right after', async () => {
    mockGetDraft.mockResolvedValue({ ...p1, text: 'restored words' });
    const { getByText, findByText } = await renderEditor();
    await findByText('restored words');
    fireEvent.press(getByText(t.privacy.discardDraft));
    const prompt = alertSpy.mock.calls.find((call) => call[0] === t.privacy.discardDraft);
    const discard = (prompt![2] as { style?: string; onPress?: () => void }[]).find(
      (button) => button.style === 'destructive',
    );
    mockSaveDraft.mockClear();
    // The background flush fires in the same tick as the discard.
    await act(async () => {
      discard!.onPress?.();
      await Promise.all(appStateHandlers.map((handler) => handler('background')));
    });
    expect(mockSaveDraft).not.toHaveBeenCalled();
    expect(mockDeleteDraft).toHaveBeenCalledWith('j1', 'p1');
  });

  it('stores the draft after a short idle period while typing', async () => {
    const { getByTestId } = await renderEditor();
    jest.useFakeTimers();
    fireEvent.press(getByTestId('page-content-edit'));
    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(mockSaveDraft).toHaveBeenCalledWith(
      'j1',
      expect.objectContaining({ text: 'edited text' }),
      expect.any(Uint8Array),
    );
  });

  it('keeps working when the draft cannot be stored or read', async () => {
    mockSaveDraft.mockRejectedValueOnce(new JournalLockedError());
    mockGetDraft.mockRejectedValueOnce(new Error('unreadable'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { getByTestId, getByText } = await renderEditor();
    fireEvent.press(getByTestId('page-content-edit'));
    await emitAppState('background');
    expect(warn).toHaveBeenCalled();
    expect(getByText('edited text')).toBeTruthy();
  });
});

describe('page editor without a key in memory', () => {
  // Regression (web reload): a reloaded editor has no key and its page does
  // not open. It must say the journal is locked rather than render blank.
  it('shows the locked placeholder instead of a blank screen', () => {
    mockPageError = new Error('password layer did not open');
    const { getByTestId, queryByTestId } = render(
      <JournalKeyProvider>
        <PageScreen />
      </JournalKeyProvider>,
    );
    expect(getByTestId('journal-locked')).toBeTruthy();
    expect(queryByTestId('page-content-text')).toBeNull();
    mockPageError = null;
  });
});

describe('page editor on web', () => {
  const originalOS = require('react-native').Platform.OS;
  const setOS = (os: string) =>
    Object.defineProperty(require('react-native').Platform, 'OS', {
      configurable: true,
      get: () => os,
    });

  afterEach(() => setOS(originalOS));

  // Cross-platform review: a reload cannot finish an encrypted write, so the
  // browser warns before leaving while edits are unsaved.
  it('warns before unload only while there are unsaved edits', async () => {
    setOS('web');
    const target = globalThis as unknown as Record<string, unknown>;
    const add = jest.fn();
    const remove = jest.fn();
    target.addEventListener = add;
    target.removeEventListener = remove;
    const { getByTestId, unmount } = await renderEditor();
    const registered = () =>
      (add.mock.calls as unknown[][]).filter((call) => call[0] === 'beforeunload');
    expect(registered()).toHaveLength(0);

    fireEvent.press(getByTestId('page-content-edit'));
    await waitFor(() => expect(registered()).toHaveLength(1));
    const listener = registered()[0][1] as (event: Event) => void;
    const event = { preventDefault: jest.fn(), returnValue: undefined } as unknown as Event;
    mockSaveDraft.mockClear();
    listener(event);
    expect((event as unknown as { preventDefault: jest.Mock }).preventDefault).toHaveBeenCalled();
    expect((event as unknown as { returnValue: unknown }).returnValue).toBe('');
    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalled());

    unmount();
    expect((remove.mock.calls as unknown[][]).some((call) => call[1] === listener)).toBe(true);
    delete target.addEventListener;
    delete target.removeEventListener;
  });
});
