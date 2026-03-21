import {
  listFiles,
  getFile,
  getFileContent,
  createFile,
  updateFile,
  deleteFile,
} from '../sync/gdrive/api';

const TOKEN = 'test-access-token';

beforeEach(() => {
  (global.fetch as jest.Mock) = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOk(data: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function mockFetchError(status: number, body = '') {
  const response = {
    ok: false,
    status,
    text: () => Promise.resolve(body),
  };
  (global.fetch as jest.Mock).mockResolvedValueOnce(response);
  // 5xx triggers a retry, so provide a second identical response
  if (status >= 500) {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ...response });
  }
}

describe('Google Drive API helper', () => {
  describe('listFiles', () => {
    it('returns files from Drive API', async () => {
      const files = [
        { id: 'f1', name: 'test.json', mimeType: 'application/json', modifiedTime: '2026-01-01' },
      ];
      mockFetchOk({ files });

      const result = await listFiles(TOKEN, "name = 'test.json'");

      expect(result).toEqual(files);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('drive/v3/files'),
        expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
      );
    });

    it('returns empty array when no files', async () => {
      mockFetchOk({ files: [] });
      const result = await listFiles(TOKEN, "name = 'missing'");
      expect(result).toEqual([]);
    });

    it('uses custom spaces parameter', async () => {
      mockFetchOk({ files: [] });
      await listFiles(TOKEN, "name = 'test'", 'appDataFolder');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('spaces=appDataFolder'),
        expect.anything(),
      );
    });
  });

  describe('getFile', () => {
    it('returns file metadata', async () => {
      const file = {
        id: 'f1',
        name: 'test.json',
        mimeType: 'application/json',
        modifiedTime: '2026-01-01',
      };
      mockFetchOk(file);
      const result = await getFile(TOKEN, 'f1');
      expect(result).toEqual(file);
    });

    it('throws on 404', async () => {
      mockFetchError(404, 'Not found');
      await expect(getFile(TOKEN, 'missing')).rejects.toThrow('Drive API error (404)');
    });
  });

  describe('getFileContent', () => {
    it('returns file content as text', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{"key": "value"}'),
      });
      const result = await getFileContent(TOKEN, 'f1');
      expect(result).toBe('{"key": "value"}');
    });

    it('throws on expired token (401)', async () => {
      mockFetchError(401, 'Unauthorized');
      await expect(getFileContent(TOKEN, 'f1')).rejects.toThrow('Drive API error (401)');
    });
  });

  describe('createFile', () => {
    it('creates a file with multipart upload', async () => {
      const created = {
        id: 'new-id',
        name: 'test.json',
        mimeType: 'application/json',
        modifiedTime: '2026-01-01',
      };
      mockFetchOk(created);

      const result = await createFile(
        TOKEN,
        { name: 'test.json', mimeType: 'application/json' },
        '{"data": true}',
      );

      expect(result).toEqual(created);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('uploadType=multipart'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('uses a unique boundary per request', async () => {
      mockFetchOk({
        id: 'f1',
        name: 'a.json',
        mimeType: 'application/json',
        modifiedTime: '2026-01-01',
      });
      mockFetchOk({
        id: 'f2',
        name: 'b.json',
        mimeType: 'application/json',
        modifiedTime: '2026-01-01',
      });

      await createFile(TOKEN, { name: 'a.json' }, 'content-a');
      await createFile(TOKEN, { name: 'b.json' }, 'content-b');

      const call1 = (global.fetch as jest.Mock).mock.calls[0][1];
      const call2 = (global.fetch as jest.Mock).mock.calls[1][1];
      const boundary1 = call1.headers['Content-Type'].match(
        /boundary=(---canto-[a-f0-9]+---)/,
      )?.[1];
      const boundary2 = call2.headers['Content-Type'].match(
        /boundary=(---canto-[a-f0-9]+---)/,
      )?.[1];

      expect(boundary1).toBeDefined();
      expect(boundary2).toBeDefined();
      expect(boundary1).not.toBe(boundary2);
    });
  });

  describe('updateFile', () => {
    it('updates a file with multipart upload', async () => {
      const updated = {
        id: 'f1',
        name: 'test.json',
        mimeType: 'application/json',
        modifiedTime: '2026-01-02',
      };
      mockFetchOk(updated);

      const result = await updateFile(TOKEN, 'f1', { name: 'test.json' }, '{"data": true}');

      expect(result).toEqual(updated);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('files/f1'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('deleteFile', () => {
    it('deletes a file', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 204 });
      await deleteFile(TOKEN, 'f1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('files/f1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('does not throw on 404', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve(''),
      });
      await expect(deleteFile(TOKEN, 'missing')).resolves.toBeUndefined();
    });

    it('throws on other errors', async () => {
      mockFetchError(500, 'Server error');
      await expect(deleteFile(TOKEN, 'f1')).rejects.toThrow('Drive API error (500)');
    });
  });

  describe('error diagnostics', () => {
    it('does not leak response body in error messages', async () => {
      mockFetchError(403, 'insufficient permissions for this file');
      await expect(listFiles(TOKEN, "name = 'test'")).rejects.toThrow('Drive API error (403)');
      // Verify the sensitive body text is NOT in the error
      await mockFetchError(403, 'secret-token-leaked');
      try {
        await listFiles(TOKEN, "name = 'test'");
      } catch (err) {
        expect((err as Error).message).not.toContain('secret-token-leaked');
      }
    });

    it('throws diagnostic error when response is OK but not valid JSON', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: 'https://www.googleapis.com/drive/v3/files',
        text: () => Promise.resolve('<!DOCTYPE html><html>login required</html>'),
      });

      await expect(listFiles(TOKEN, "name = 'test'")).rejects.toThrow('invalid JSON response');
    });

    it('does not leak response content in JSON parse errors', async () => {
      const htmlResponse = '<html>' + 'x'.repeat(300) + '</html>';
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: 'https://example.com',
        text: () => Promise.resolve(htmlResponse),
      });

      await expect(listFiles(TOKEN, "name = 'test'")).rejects.toThrow(
        expect.objectContaining({
          message: expect.not.stringContaining('<html>'),
        }),
      );
    });
  });
});
