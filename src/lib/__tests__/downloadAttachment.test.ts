/**
 * Tests for the web implementation of downloadAttachment.
 * We mock DOM APIs since this runs in a Node/Jest environment.
 */

// Mock DOM APIs before importing the module
const mockClick = jest.fn();
const mockCreateElement = jest.fn(() => ({
  href: '',
  download: '',
  click: mockClick,
}));
const mockCreateObjectURL = jest.fn(() => 'blob:http://localhost/fake-url');
const mockRevokeObjectURL = jest.fn();

Object.defineProperty(global, 'document', {
  value: { createElement: mockCreateElement },
  writable: true,
});

Object.defineProperty(global, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  writable: true,
});

// atob may not exist in all Jest environments
if (typeof global.atob === 'undefined') {
  (global as Record<string, unknown>).atob = (str: string) =>
    Buffer.from(str, 'base64').toString('binary');
}

// Import the web implementation directly

const { downloadAttachment } = require('../downloadAttachment.web') as {
  downloadAttachment: (base64Data: string, filename: string) => Promise<void>;
};

describe('downloadAttachment (web)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a blob from base64 data', async () => {
    const base64 = btoa('hello world');

    await downloadAttachment(base64, 'test.txt');

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('triggers download with correct filename', async () => {
    const base64 = btoa('test data');

    await downloadAttachment(base64, 'photo.jpg');

    expect(mockCreateElement).toHaveBeenCalledWith('a');
    const anchor = mockCreateElement.mock.results[0].value;
    expect(anchor.download).toBe('photo.jpg');
    expect(anchor.href).toBe('blob:http://localhost/fake-url');
    expect(mockClick).toHaveBeenCalledTimes(1);
  });

  it('cleans up object URL after download', async () => {
    const base64 = btoa('cleanup test');

    await downloadAttachment(base64, 'file.bin');

    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/fake-url');
  });
});
