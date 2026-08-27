const mockExtract = jest.fn();
const mockCancel = jest.fn();
const mockOpen = jest.fn();
const mockReadText = jest.fn();
const mockClose = jest.fn();
const mockAvailableBytes = jest.fn();

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    CantoArchive: {
      open: (...args: unknown[]) => mockOpen(...args),
      extract: (...args: unknown[]) => mockExtract(...args),
      cancel: (...args: unknown[]) => mockCancel(...args),
      readText: (...args: unknown[]) => mockReadText(...args),
      close: (...args: unknown[]) => mockClose(...args),
      availableBytes: (...args: unknown[]) => mockAvailableBytes(...args),
    },
  },
}));

import {
  closeNativeArchive,
  extractNativeArchiveEntry,
  nativeArchiveAvailableBytes,
  openNativeArchive,
  readNativeArchiveText,
  supportsNativeArchive,
} from '../backup/native-archive';

const archive = {
  id: 'archive-1',
  entries: [
    { name: 'manifest.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
    { name: 'journal.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
  ],
};

describe('native archive extraction cancellation', () => {
  beforeEach(() => {
    mockOpen.mockReset();
    mockExtract.mockReset();
    mockCancel.mockReset();
    mockReadText.mockReset();
    mockClose.mockReset();
    mockAvailableBytes.mockReset();
  });

  it('forwards the inspection fingerprint when reopening an archive', async () => {
    mockOpen.mockResolvedValueOnce({
      id: 'archive-1',
      sourceFingerprint: '224:42',
      entries: [
        { name: 'manifest.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
        { name: 'journal.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
      ],
    });

    await expect(openNativeArchive('content://backup', undefined, '224:42')).resolves.toMatchObject(
      {
        sourceFingerprint: '224:42',
      },
    );
    expect(mockOpen).toHaveBeenCalledWith('content://backup', expect.any(String), '224:42');
  });

  it('forwards an AbortSignal to the archive-copy operation', async () => {
    let resolveOpen: ((value: { id: string; entries: unknown[] }) => void) | undefined;
    mockOpen.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );
    mockCancel.mockResolvedValue(undefined);
    const controller = new AbortController();

    const opening = openNativeArchive('content://backup', controller.signal);
    controller.abort();

    expect(mockOpen).toHaveBeenCalledWith('content://backup', expect.any(String), undefined);
    expect(mockCancel).toHaveBeenCalledWith(mockOpen.mock.calls[0][1]);
    resolveOpen?.({
      id: 'archive-1',
      entries: [
        { name: 'manifest.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
        { name: 'journal.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
      ],
    });
    await expect(opening).resolves.toMatchObject({ id: 'archive-1' });
  });

  it('forwards an AbortSignal to the active native extraction operation', async () => {
    let resolveExtraction: ((value: { uri: string; size: number }) => void) | undefined;
    mockExtract.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExtraction = resolve;
        }),
    );
    mockCancel.mockResolvedValue(undefined);
    const controller = new AbortController();
    const archive = {
      id: 'archive-1',
      entries: [
        { name: 'manifest.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
      ],
    };

    const extraction = extractNativeArchiveEntry(
      archive,
      'manifest.json',
      'file:///cache/entry',
      controller.signal,
    );
    controller.abort();

    expect(mockExtract).toHaveBeenCalledWith(
      'archive-1',
      'manifest.json',
      'file:///cache/entry',
      expect.any(String),
    );
    expect(mockCancel).toHaveBeenCalledWith(mockExtract.mock.calls[0][3]);

    resolveExtraction?.({ uri: 'file:///cache/entry', size: 1 });
    await expect(extraction).resolves.toEqual({ uri: 'file:///cache/entry', size: 1 });
  });

  it('reads bounded metadata, closes archives, and validates available space', async () => {
    mockReadText.mockResolvedValue('{"title":"Journal"}');
    mockAvailableBytes.mockResolvedValue(1024);

    await expect(readNativeArchiveText(archive, 'manifest.json')).resolves.toBe(
      '{"title":"Journal"}',
    );
    expect(mockReadText).toHaveBeenCalledWith('archive-1', 'manifest.json', 4 * 1024 * 1024);
    await expect(
      readNativeArchiveText(
        { ...archive, entries: [{ ...archive.entries[0], size: 5 }] },
        'manifest.json',
        4,
      ),
    ).rejects.toThrow('exceeds limit');
    await expect(nativeArchiveAvailableBytes()).resolves.toBe(1024);
    await closeNativeArchive(archive);
    expect(mockClose).toHaveBeenCalledWith('archive-1');

    mockAvailableBytes.mockResolvedValueOnce(-1);
    await expect(nativeArchiveAvailableBytes()).rejects.toThrow('free space is unavailable');
  });

  it('rejects bad inventory after closing it and rejects mismatched extraction output', async () => {
    mockOpen.mockResolvedValueOnce({ id: 'bad-archive', entries: [] });
    mockClose.mockResolvedValue(undefined);
    await expect(openNativeArchive('content://bad')).rejects.toThrow('missing manifest.json');
    expect(mockClose).toHaveBeenCalledWith('bad-archive');

    mockExtract.mockResolvedValueOnce({ uri: 'file:///cache/entry', size: 2 });
    await expect(
      extractNativeArchiveEntry(archive, 'manifest.json', 'file:///cache/entry'),
    ).rejects.toThrow('length mismatch');
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      extractNativeArchiveEntry(archive, 'manifest.json', 'file:///cache/entry', aborted.signal),
    ).rejects.toThrow('Archive extraction cancelled');
  });

  it('rejects an archive open that was cancelled before native work begins', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(openNativeArchive('content://backup', controller.signal)).rejects.toThrow(
      'Archive opening cancelled',
    );
    expect(mockOpen).not.toHaveBeenCalled();
    expect(supportsNativeArchive()).toBe(true);
  });

  it('accepts cancellation implementations that reject after receiving an abort', async () => {
    let resolveOpen!: (value: typeof archive) => void;
    mockOpen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );
    mockCancel.mockRejectedValueOnce(new Error('already finished'));
    const controller = new AbortController();
    const opening = openNativeArchive('content://backup', controller.signal);
    controller.abort();
    resolveOpen(archive);

    await expect(opening).resolves.toEqual(archive);
  });
});
