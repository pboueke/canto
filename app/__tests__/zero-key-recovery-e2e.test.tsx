/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * End-to-end: the reported lockout. A password-protected journal holds pages
 * that Canto <= 0.20.0 saved under an auto-locked (zeroed) key. Unlocking with
 * the correct password must open the journal rather than report "Wrong
 * password", a wrong password must still be rejected, and the recovery flow
 * must bring every page back under the real key.
 *
 * Real home screen unlock, real JournalKeyProvider, real useStorage singleton,
 * real native LocalStore, real AES-GCM, and the real RecoverPagesModal.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { JournalContent, Page } from 'canto-data';

const mockFs: Record<string, string> = {};

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

const mockPush = jest.fn();
let mockAccess: {
  visible: boolean;
  error?: string | null;
  onUnlock: (password: string) => Promise<void>;
} | null = null;

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@/styles/web', () => ({ webModalContent: {} }));
jest.mock('@/styles/themes', () => ({ getContrastText: () => '#fff' }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#fff',
        foreground: '#f5f5f5',
        surface: '#fff',
        border: '#ddd',
        text: '#111',
        textSecondary: '#666',
        highlight: '#eee',
        primary: '#000',
        error: '#d00',
        buttonCancel: '#eee',
        buttonDisabled: '#ccc',
      },
      fonts: { regular: 'System', bold: 'System' },
      borderWidth: 1,
    },
  }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: require('@/i18n/dictionaries').dictionaries.en }),
}));
jest.mock('@/components/home/SecuritySettingsModal', () => ({
  getAutoLockTimeout: async () => 0,
  AUTO_LOCK_OPTIONS: [],
}));
jest.mock('@/lib/attachment-display', () => ({
  purgeAttachmentDisplayCache: jest.fn(),
  purgeEncryptedAttachmentDisplayCache: jest.fn(),
  materializeAttachmentDisplay: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush }),
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../onboarding', () => ({
  ONBOARDING_KEY: 'canto:onboardingDone',
  isOnboardingDone: () => true,
  markOnboardingDone: jest.fn(),
}));
jest.mock('@/lib/biometric', () => ({ authenticateBiometric: jest.fn(async () => true) }));
jest.mock('@/components/common/Logo', () => ({ Logo: () => null }));
jest.mock('@/components/home/InfoBox', () => ({ InfoBox: () => null }));
jest.mock('@/components/home/NewJournalModal', () => ({ NewJournalModal: () => null }));
jest.mock('@/components/home/AccountButton', () => ({ AccountButton: () => null }));
jest.mock('@/components/home/NewJournalCard', () => ({ NewJournalCard: () => null }));
jest.mock('@/components/home/JournalCard', () => {
  const { Pressable, Text } = require('react-native');
  return {
    JournalCard: ({ journal, onPress }: { journal: { id: string }; onPress: () => void }) => (
      <Pressable testID={`journal-${journal.id}`} onPress={onPress}>
        <Text>{journal.id}</Text>
      </Pressable>
    ),
  };
});
jest.mock('@/components/home/JournalAccessModal', () => ({
  JournalAccessModal: (props: NonNullable<typeof mockAccess>) => {
    mockAccess = props;
    return null;
  },
}));

import { JournalKeyProvider, useJournalKeys } from '@/contexts/JournalKeyContext';
import { getEncryptionService, getLocalStore, tryLoadJournalOverview } from '@/hooks/useStorage';
import { RecoverPagesModal } from '@/components/journal/RecoverPagesModal';
import * as deviceKeyCustody from '@/lib/encryption/device';
import { deriveKey } from '@/lib/encryption/password';
import { aesGcmEncrypt, base64ToUint8 } from '@/lib/encryption/utils';
import { createPageCatalog } from '@/lib/journal-overview';
import { dictionaries } from '@/i18n/dictionaries';

const HomeScreen = require('../index').default;
const t = dictionaries.en;
const SALT = 'emVyb2tleXNhbHR6ZXJvaw==';
const PASSWORD = 'her real password';
const ZERO = new Uint8Array(32);

let keysApi: ReturnType<typeof useJournalKeys> | undefined;
function CaptureKeys() {
  keysApi = useJournalKeys();
  return null;
}

function page(id: string, text: string): Page {
  return {
    id,
    text,
    date: '2026-03-12T10:00:00Z',
    tags: [],
    files: [],
    images: [],
    comments: [],
    modified: 1,
    deleted: false,
  };
}

function journal(pages: Page[]): JournalContent {
  return {
    id: 's1',
    title: 'Her journal',
    icon: 'book',
    date: '2026-01-01T00:00:00Z',
    secure: true,
    salt: SALT,
    kdfIterations: 1000,
    pages,
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

describe('legacy zero-key lockout (e2e)', () => {
  it('opens with the right password, rejects a wrong one, and recovers every page', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const store = await getLocalStore();
    const device = getEncryptionService();
    const key = await deriveKey(PASSWORD, base64ToUint8(SALT), 1000);
    await store.saveJournal(
      journal([page('p1', 'first'), page('p2', 'second'), page('p3', 'third')]),
      key,
    );
    // What <= 0.20.0 wrote when an editor saved after an auto-lock.
    const edited = page('p2', 'edited after the auto-lock');
    mockFs['/mock-docs/canto/s1/pages/p2.json'] = await device.encrypt(
      await aesGcmEncrypt(JSON.stringify(edited), ZERO),
    );
    mockFs['/mock-docs/canto/s1/page-catalog.json'] = await device.encrypt(
      await aesGcmEncrypt(JSON.stringify(createPageCatalog('s1', [edited])), ZERO),
    );

    const home = render(
      <JournalKeyProvider>
        <CaptureKeys />
        <HomeScreen />
      </JournalKeyProvider>,
    );
    await waitFor(() => expect(home.getByTestId('journal-s1')).toBeTruthy());
    await act(async () => {
      fireEvent.press(home.getByTestId('journal-s1'));
    });
    await waitFor(() => expect(mockAccess?.visible).toBe(true));

    // A wrong password is still a wrong password.
    await act(async () => {
      await expect(mockAccess!.onUnlock('not her password')).rejects.toThrow('Wrong password');
    });
    expect(mockAccess!.error).toBe(t.home.wrongPassword);
    expect(keysApi!.getKey('s1')).toBeNull();

    // The right password opens the journal instead of "Wrong password".
    await act(async () => {
      await mockAccess!.onUnlock(PASSWORD);
    });
    expect(mockPush).toHaveBeenCalledWith('/journal/s1');
    const unlocked = keysApi!.getKey('s1')!;
    expect(unlocked).not.toBeNull();
    // The journal screen then shows the recoverable integrity state.
    await expect(tryLoadJournalOverview('s1', unlocked)).rejects.toMatchObject({
      code: 'LEGACY_ZERO_KEY',
    });
    home.unmount();

    // Recovery previews every page, then re-encrypts the legacy one.
    const onRecovered = jest.fn();
    const recovery = render(
      <RecoverPagesModal
        visible
        journal={{ id: 's1' }}
        derivedKey={unlocked}
        onClose={jest.fn()}
        onRecovered={onRecovered}
      />,
    );
    await waitFor(() =>
      expect(
        recovery.getByText(t.journalSettings.recoverFound.replace('{count}', '3')),
      ).toBeTruthy(),
    );
    expect(
      recovery.getByText(t.journalSettings.recoverLegacy.replace('{count}', '1')),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(recovery.getByText(t.journalSettings.recoverConfirm));
    });
    await waitFor(() => expect(onRecovered).toHaveBeenCalled());

    const overview = await tryLoadJournalOverview('s1', unlocked);
    expect(overview!.pages).toHaveLength(3);
    expect((await store.getPage('s1', 'p2', unlocked))!.text).toBe('edited after the auto-lock');

    // A device-key rotation afterwards keeps the recovered journal readable.
    await store.rotateDeviceKey!(deviceKeyCustody);
    expect((await tryLoadJournalOverview('s1', unlocked))!.pages).toHaveLength(3);
  });
});
