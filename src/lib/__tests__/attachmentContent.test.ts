import type { Attachment } from 'canto-data';
import {
  base64ByteLength,
  chunkedContentForBase64,
  chunkedContentForByteLength,
  decodeChunkFrame,
  encodeChunkFrame,
  joinBase64Chunks,
  splitBase64Chunks,
  ATTACHMENT_CHUNK_SIZE,
} from '../storage/attachment-content';

function attachment(generation?: string): Attachment {
  return {
    id: 'attachment-1',
    path: 'journal/page/attachment-1',
    name: 'photo.jpg',
    type: 'image',
    encrypted: false,
    deleted: false,
    content: {
      format: 'canto-chunked-v1',
      byteLength: 3,
      chunkSize: ATTACHMENT_CHUNK_SIZE,
      chunkCount: 1,
      ...(generation ? { generation } : {}),
    },
  };
}

describe('attachment content helpers', () => {
  it('normalizes trailing whitespace before calculating base64 padding', () => {
    const data = 'QQ==\n';
    const content = chunkedContentForBase64(data);

    expect(base64ByteLength(data)).toBe(1);
    expect(content.byteLength).toBe(1);
    expect(splitBase64Chunks(data, content)).toEqual(['QQ==']);
  });

  it('calculates empty and single-padding base64 payload sizes', () => {
    expect(base64ByteLength(' \n')).toBe(0);
    expect(base64ByteLength('QUI=')).toBe(2);
  });

  it('creates a generated descriptor for an exact byte length', () => {
    const content = chunkedContentForByteLength(ATTACHMENT_CHUNK_SIZE + 1);

    expect(content).toMatchObject({
      format: 'canto-chunked-v1',
      byteLength: ATTACHMENT_CHUNK_SIZE + 1,
      chunkSize: ATTACHMENT_CHUNK_SIZE,
      chunkCount: 2,
    });
    expect(content.generation).toEqual(expect.any(String));
  });

  it.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid byte length: %p',
    (byteLength) => {
      expect(() => chunkedContentForByteLength(byteLength)).toThrow(
        'Invalid attachment byte length',
      );
    },
  );

  it('splits non-three-byte-aligned payloads without adding a partial chunk', () => {
    const content = { ...chunkedContentForByteLength(5), chunkSize: 4, chunkCount: 2 };

    expect(splitBase64Chunks('AQIDBAU=', content)).toEqual(['AQIDBA==', 'BQ==']);
    expect(joinBase64Chunks(['AQIDBA==', 'BQ=='])).toBe('AQIDBAU=');
  });

  it('rejects malformed or descriptor-inconsistent base64 input', () => {
    const content = { ...chunkedContentForByteLength(1), chunkSize: 1, chunkCount: 1 };

    expect(() => splitBase64Chunks('QQ==', { ...content, byteLength: 2 })).toThrow(
      'Attachment byte length does not match',
    );
    expect(() => splitBase64Chunks('!Q==', content)).toThrow('Invalid base64 attachment data');
    expect(() => splitBase64Chunks('QQ==', { ...content, chunkCount: 2 })).toThrow(
      'Attachment chunk count mismatch',
    );
  });
});

describe('attachment chunk frames', () => {
  it('rejects a valid frame from a stale content generation', () => {
    const staleFrame = encodeChunkFrame('journal', 'page', attachment('generation-old'), 0, 'YWJj');

    expect(() =>
      decodeChunkFrame(staleFrame, 'journal', 'page', attachment('generation-new'), 0),
    ).toThrow('Invalid attachment chunk identity: photo.jpg #0');
  });

  it('accepts a frame only when its descriptor generation matches', () => {
    const att = attachment('generation-current');
    const frame = encodeChunkFrame('journal', 'page', att, 0, 'YWJj');

    expect(decodeChunkFrame(frame, 'journal', 'page', att, 0)).toBe('YWJj');
  });

  it('rejects a frame without a generated attachment descriptor', () => {
    expect(() => encodeChunkFrame('journal', 'page', attachment(), 0, 'YWJj')).toThrow(
      'Generated chunk descriptor required for attachment: photo.jpg',
    );
  });

  it('rejects invalid JSON and every mismatched frame identity field', () => {
    const att = attachment('generation-current');
    const frame = JSON.parse(encodeChunkFrame('journal', 'page', att, 0, 'YWJj')) as Record<
      string,
      unknown
    >;

    expect(() => decodeChunkFrame('{', 'journal', 'page', att, 0)).toThrow(
      'Invalid attachment chunk frame: photo.jpg #0',
    );
    const invalidFields: Array<[string, unknown]> = [
      ['format', 'other-format'],
      ['journalId', 'other-journal'],
      ['pageId', 'other-page'],
      ['attachmentId', 'other-attachment'],
      ['index', 1],
      ['count', 2],
      ['generation', undefined],
      ['data', 1],
    ];
    for (const [field, value] of invalidFields) {
      expect(() =>
        decodeChunkFrame(JSON.stringify({ ...frame, [field]: value }), 'journal', 'page', att, 0),
      ).toThrow('Invalid attachment chunk identity: photo.jpg #0');
    }
  });

  it('accepts generation-less legacy descriptors only with generation-less frames', () => {
    const att = attachment();
    const frame = JSON.stringify({
      format: 'canto-chunked-v1',
      journalId: 'journal',
      pageId: 'page',
      attachmentId: att.id,
      index: 0,
      count: 1,
      data: 'YWJj',
    });

    expect(decodeChunkFrame(frame, 'journal', 'page', att, 0)).toBe('YWJj');
  });
});
