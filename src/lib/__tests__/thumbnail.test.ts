import { generateThumbnail, generateThumbnailFromChunks } from '../thumbnail';

// expo-image-manipulator is globally mocked in jest.setup.ts

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  Paths: { cache: '/tmp/cache' },
  File: jest.fn().mockImplementation((...args: unknown[]) => ({
    uri:
      typeof args[0] === 'string' && args.length === 1
        ? args[0]
        : `/tmp/cache/${args[1] ?? 'file'}`,
    exists: false,
    create: jest.fn(),
    write: jest.fn(),
    open: jest.fn(() => ({ writeBytes: jest.fn(), close: jest.fn() })),
    delete: jest.fn(),
  })),
}));

const ImageManipulator = jest.requireMock('expo-image-manipulator');
const { File: MockFile } = jest.requireMock('expo-file-system');

describe('generateThumbnail', () => {
  it('calls manipulateAsync with correct resize params', async () => {
    const result = await generateThumbnail('aW1hZ2VkYXRh');

    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      expect.any(String),
      [{ resize: { width: 120 } }],
      { compress: 0.5, format: 'jpeg', base64: true },
    );
    expect(result).toBe('dGh1bWJuYWls');
  });

  it('writes import thumbnail input incrementally to a temporary file before manipulating its URI', async () => {
    const writeBytes = jest.fn();
    const close = jest.fn();
    const deleteFn = jest.fn();
    MockFile.mockImplementation((...args: unknown[]) => ({
      uri:
        typeof args[0] === 'string' && args.length === 1
          ? args[0]
          : `/tmp/cache/${args[1] ?? 'file'}`,
      exists: true,
      create: jest.fn(),
      write: jest.fn(),
      open: jest.fn(() => ({ writeBytes, close })),
      delete: deleteFn,
    }));

    async function* chunks() {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3]);
    }
    await expect(generateThumbnailFromChunks(chunks())).resolves.toBe('dGh1bWJuYWls');

    expect(writeBytes).toHaveBeenNthCalledWith(1, new Uint8Array([1, 2]));
    expect(writeBytes).toHaveBeenNthCalledWith(2, new Uint8Array([3]));
    expect(close).toHaveBeenCalledTimes(1);
    expect(deleteFn).toHaveBeenCalled();
  });

  it('cleans up result file when it exists', async () => {
    // Make the result file report exists = true
    const deleteFn = jest.fn();
    MockFile.mockImplementation((...args: unknown[]) => {
      const uri =
        typeof args[0] === 'string' && args.length === 1
          ? args[0]
          : `/tmp/cache/${args[1] ?? 'file'}`;
      return {
        uri,
        exists: true,
        create: jest.fn(),
        write: jest.fn(),
        delete: deleteFn,
      };
    });

    await generateThumbnail('aW1hZ2VkYXRh');

    // delete should have been called for both result file cleanup and source file cleanup
    expect(deleteFn).toHaveBeenCalled();
  });

  it('ignores cleanup errors for result file', async () => {
    MockFile.mockImplementation((...args: unknown[]) => {
      const uri =
        typeof args[0] === 'string' && args.length === 1
          ? args[0]
          : `/tmp/cache/${args[1] ?? 'file'}`;
      return {
        uri,
        exists: true,
        create: jest.fn(),
        write: jest.fn(),
        delete: jest.fn().mockImplementation(() => {
          throw new Error('cleanup error');
        }),
      };
    });

    // Should not throw despite cleanup errors
    const result = await generateThumbnail('aW1hZ2VkYXRh');
    expect(result).toBe('dGh1bWJuYWls');
  });
});
