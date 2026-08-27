jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeModules: {},
}));

import {
  closeNativeArchive,
  nativeArchiveAvailableBytes,
  openNativeArchive,
  supportsNativeArchive,
} from '../backup/native-archive';

describe('native archive availability', () => {
  it('fails explicitly outside Android while close remains a safe no-op', async () => {
    const archive = { id: 'archive-1', entries: [] };

    expect(supportsNativeArchive()).toBe(false);
    await expect(openNativeArchive('file:///backup.zip')).rejects.toThrow(
      'Native archive reader is unavailable',
    );
    await expect(nativeArchiveAvailableBytes()).rejects.toThrow(
      'Native archive reader is unavailable',
    );
    await expect(closeNativeArchive(archive)).resolves.toBeUndefined();
  });
});
