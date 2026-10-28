/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * End-to-end: what the user reported ("part of what I typed stays visible
 * behind the password prompt") cannot happen, and unsaved typing survives the
 * lock encrypted with the journal password.
 *
 * Real editor screen, real JournalKeyProvider (AppState auto-lock), real
 * useStorage singleton, real native LocalStore, and real AES-GCM. Only the
 * file system, native modules, and leaf UI components are simulated.
 */
import React, { useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { JournalContent, Page } from 'canto-data';

const mockFs: Record<string, string> = {};
const mockGetAutoLockTimeout = jest.fn(async () => 0);

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').pop() ?? '';
    }
    get exists() {
      return this.uri in mockFs;
    }
    get size() {
      return Buffer.byteLength(mockFs[this.uri] ?? '', 'utf8');
    }
    create() {
      if (!(this.uri in mockFs)) mockFs[this.uri] = '';
    }
    write(content: string) {
      mockFs[this.uri] = content;
    }
    text() {
      return Promise.resolve(mockFs[this.uri] ?? '');
    }
    delete() {
      delete mockFs[this.uri];
    }
    move(target: any) {
      mockFs[target.uri] = mockFs[this.uri];
      delete mockFs[this.uri];
    }
  }
  class MockDirectory {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').pop() ?? '';
    }
    get exists() {
      return Object.keys(mockFs).some((key) => key.startsWith(`${this.uri}/`));
    }
    create() {}
    list() {
      const prefix = `${this.uri}/`;
      const out: any[] = [];
      const seen = new Set<string>();
      for (const key of Object.keys(mockFs)) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest.includes('/')) out.push(new MockFile(key));
        else {
          const dir = prefix + rest.split('/')[0];
          if (!seen.has(dir)) {
            seen.add(dir);
            out.push(new MockDirectory(dir));
          }
        }
      }
      return out;
    }
    delete() {
      for (const key of Object.keys(mockFs)) if (key.startsWith(`${this.uri}/`)) delete mockFs[key];
    }
  }
  return {
    Paths: { document: { uri: '/mock-docs' }, cache: { uri: '/mock-cache' } },
    File: MockFile,
    Directory: MockDirectory,
  };
});

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
  getAutoLockTimeout: () => mockGetAutoLockTimeout(),
  AUTO_LOCK_OPTIONS: [],
}));
jest.mock('@/lib/attachment-display', () => ({
  purgeAttachmentDisplayCache: jest.fn(),
  purgeEncryptedAttachmentDisplayCache: jest.fn(),
  materializeAttachmentDisplay: jest.fn(),
}));
jest.mock('@/lib/thumbnail', () => ({ generateThumbnail: jest.fn(async () => 'thumb') }));
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
for (const component of [
  'PageHeader',
  'TagEditor',
  'ImageCarousel',
  'FileRow',
  'LocationTag',
  'CommentList',
  'CommentModal',
  'AddAttachmentPopup',
]) {
  jest.doMock(`@/components/page/${component}`, () => ({ [component]: () => null }));
}
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
        <Pressable testID="type" onPress={() => onChangeText('half a private thought')}>
          <Text>type</Text>
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

import { JournalKeyProvider, useJournalKeys } from '@/contexts/JournalKeyContext';
import { getLocalStore, tryLoadJournalOverview } from '@/hooks/useStorage';
import { deriveKey } from '@/lib/encryption/password';
import { base64ToUint8 } from '@/lib/encryption/utils';
import { dictionaries } from '@/i18n/dictionaries';

const PageScreen = require('../[id]').default;
const t = dictionaries.en;
const SALT = 'c2FsdHNhbHRzYWx0c2FsdA==';
const PASSWORD = 'correct horse battery';
const TYPED = 'half a private thought';

let keysApi: ReturnType<typeof useJournalKeys> | undefined;

/** Unlock exactly like the home screen does, then open the editor. */
function UnlockedEditor() {
  const keys = useJournalKeys();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    keysApi = keys;
    void keys.deriveAndCache('j1', PASSWORD, SALT, 1000).then(() => setReady(true));
  }, []);
  return ready ? <PageScreen /> : null;
}

function savedPage(): Page {
  return {
    id: 'p1',
    text: 'what was saved yesterday',
    date: '2026-03-12T10:00:00Z',
    tags: [],
    files: [],
    images: [],
    comments: [],
    modified: 1_700_000_000_000,
    deleted: false,
  };
}

function secureJournal(): JournalContent {
  return {
    id: 'j1',
    title: 'Private',
    icon: 'book',
    date: '2026-01-01T00:00:00Z',
    secure: true,
    salt: SALT,
    kdfIterations: 1000,
    pages: [savedPage()],
    settings: {
      use24h: false,
      previewTags: true,
      previewThumbnail: true,
      previewIcons: true,
      filterBar: true,
      sort: 'descending',
      autoLocation: false,
      remoteSync: false,
      autoSync: false,
    },
    version: 1,
  } as JournalContent;
}

describe('lock privacy (e2e)', () => {
  let appStateHandlers: ((state: string) => unknown)[];

  beforeEach(() => {
    appStateHandlers = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      handler: (state: string) => unknown,
    ) => {
      appStateHandlers.push(handler);
      return {
        remove: () => {
          appStateHandlers = appStateHandlers.filter((candidate) => candidate !== handler);
        },
      };
    }) as never);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  async function emit(state: string) {
    await act(async () => {
      await Promise.all(appStateHandlers.map((handler) => handler(state)));
    });
  }

  it('hides typed text on lock, keeps it encrypted, and restores it only after unlock', async () => {
    const store = await getLocalStore();
    const key = await deriveKey(PASSWORD, base64ToUint8(SALT), 1000);
    await store.saveJournal(secureJournal(), key);

    // 1. Type into the editor of an unlocked, password-protected journal.
    const first = render(
      <JournalKeyProvider>
        <UnlockedEditor />
      </JournalKeyProvider>,
    );
    await waitFor(() => expect(first.getByTestId('page-content-text')).toBeTruthy());
    fireEvent.press(first.getByTestId('type'));
    expect(first.getByText(TYPED)).toBeTruthy();

    // 2. Leave the app: the unsaved text is stored, never in plaintext.
    mockGetAutoLockTimeout.mockResolvedValue(1);
    await emit('background');
    await waitFor(async () => expect(await store.listDrafts!('j1')).toEqual(['p1']));
    expect(Object.values(mockFs).some((value) => value.includes(TYPED))).toBe(false);
    expect(await store.getDraft!('j1', 'p1')).toBeNull();
    expect((await store.getDraft!('j1', 'p1', key))!.text).toBe(TYPED);

    // 3. Come back after the auto-lock timeout: nothing typed is on screen.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await emit('active');
    await waitFor(() => expect(first.getByTestId('journal-locked')).toBeTruthy());
    expect(first.queryByText(TYPED)).toBeNull();
    expect(first.queryByText('what was saved yesterday')).toBeNull();
    expect(keysApi!.getKey('j1')).toBeNull();
    first.unmount();

    // 4. Unlock again with the password: the draft comes back for editing.
    mockGetAutoLockTimeout.mockResolvedValue(0);
    const second = render(
      <JournalKeyProvider>
        <UnlockedEditor />
      </JournalKeyProvider>,
    );
    await waitFor(() => expect(second.getByText(TYPED)).toBeTruthy());
    expect(second.getByText(t.privacy.draftRestored)).toBeTruthy();

    // 5. Saving publishes the text and removes the draft.
    await act(async () => {
      fireEvent.press(second.getByTestId('fab-check'));
    });
    await waitFor(async () => expect(await store.listDrafts!('j1')).toEqual([]));
    expect((await store.getPage('j1', 'p1', key))!.text).toBe(TYPED);
    second.unmount();

    // 6. Reload (web): keys are gone from memory. The editor says the journal
    //    is locked instead of rendering blank, and the journal overview fails
    //    as a password-layer failure, which the journal screen treats as
    //    "unlock first" rather than damage.
    const reloaded = render(
      <JournalKeyProvider>
        <PageScreen />
      </JournalKeyProvider>,
    );
    await waitFor(() => expect(reloaded.getByTestId('journal-locked')).toBeTruthy());
    expect(reloaded.queryByText(TYPED)).toBeNull();
    await expect(tryLoadJournalOverview('j1')).rejects.toMatchObject({
      code: 'JOURNAL_UNREADABLE',
      causeLayer: 'PASSWORD_DECRYPT_FAILED',
    });
    reloaded.unmount();
  });
});
