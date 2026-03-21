/**
 * Tests for the native implementation of downloadAttachment.
 * Mocks expo-file-system and expo-sharing.
 */

const mockShareAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-sharing', () => ({
  shareAsync: mockShareAsync,
}));

const mockFile = {
  exists: false,
  uri: 'file:///cache/photo.jpg',
  create: jest.fn(),
  write: jest.fn(),
};
jest.mock('expo-file-system', () => ({
  Paths: { cache: '/cache' },
  File: jest.fn(() => mockFile),
}));

const { downloadAttachment } = require('../downloadAttachment') as {
  downloadAttachment: (base64Data: string, filename: string) => Promise<void>;
};

describe('downloadAttachment (native)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFile.exists = false;
  });

  it('writes base64 data and opens share sheet', async () => {
    const base64 = 'SGVsbG8gV29ybGQ=';
    await downloadAttachment(base64, 'photo.jpg');

    expect(mockFile.create).toHaveBeenCalledWith({ intermediates: true });
    expect(mockFile.write).toHaveBeenCalledWith(base64, { encoding: 'base64' });
    expect(mockShareAsync).toHaveBeenCalledWith(mockFile.uri);
  });

  it('skips create if file already exists', async () => {
    mockFile.exists = true;
    await downloadAttachment('data', 'file.bin');

    expect(mockFile.create).not.toHaveBeenCalled();
    expect(mockFile.write).toHaveBeenCalled();
    expect(mockShareAsync).toHaveBeenCalled();
  });

  it('propagates sharing errors', async () => {
    mockShareAsync.mockRejectedValueOnce(new Error('sharing cancelled'));
    await expect(downloadAttachment('data', 'file.bin')).rejects.toThrow('sharing cancelled');
  });
});
