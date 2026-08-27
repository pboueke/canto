const mockOpenNativeArchive = jest.fn();
const mockReadNativeArchiveText = jest.fn();
const mockCloseNativeArchive = jest.fn();
const mockImportNativeJournal = jest.fn();

jest.mock('../backup/native-archive', () => ({
  supportsNativeArchive: () => true,
  openNativeArchive: (...args: unknown[]) => mockOpenNativeArchive(...args),
  readNativeArchiveText: (...args: unknown[]) => mockReadNativeArchiveText(...args),
  closeNativeArchive: (...args: unknown[]) => mockCloseNativeArchive(...args),
}));
jest.mock('../backup/native-importer', () => ({
  importNativeJournal: (...args: unknown[]) => mockImportNativeJournal(...args),
}));

import { importJournal, inspectBackup } from '../backup/import';

describe('Android backup routing', () => {
  beforeEach(() => {
    mockOpenNativeArchive.mockReset();
    mockReadNativeArchiveText.mockReset();
    mockCloseNativeArchive.mockReset();
    mockImportNativeJournal.mockReset();
  });

  it('inspects native metadata and closes the archive even when it is encrypted', async () => {
    const archive = { id: 'native-archive', entries: [], sourceFingerprint: '123:456' };
    mockOpenNativeArchive.mockResolvedValue(archive);
    mockReadNativeArchiveText.mockResolvedValue(
      JSON.stringify({
        version: 1,
        appVersion: '1.0.0',
        exportDate: '2026-08-26T00:00:00Z',
        encrypted: true,
        salt: 'dGVzdA==',
        kdfIterations: 50_000,
        journalTitle: 'Encrypted',
      }),
    );

    await expect(inspectBackup('content://backup')).resolves.toEqual({
      manifest: expect.objectContaining({ encrypted: true }),
      needsPassword: true,
      canProvidePassword: false,
      sourceFingerprint: '123:456',
    });
    expect(mockCloseNativeArchive).toHaveBeenCalledWith(archive);
  });

  it('delegates Android import arguments without opening the JavaScript ZIP reader', async () => {
    const progress = jest.fn();
    const signal = new AbortController().signal;
    const result = { journal: { id: 'imported' }, attachmentErrors: [], skippedAttachments: [] };
    mockImportNativeJournal.mockResolvedValue(result);

    await expect(
      importJournal(
        'content://backup',
        'Imported',
        new Uint8Array(32),
        progress,
        signal,
        '123:456',
      ),
    ).resolves.toBe(result);
    expect(mockImportNativeJournal).toHaveBeenCalledWith(
      'content://backup',
      'Imported',
      expect.any(Uint8Array),
      progress,
      signal,
      '123:456',
    );
  });
});
