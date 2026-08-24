import type { Attachment } from 'canto-data';
import {
  base64ByteLength,
  chunkedContentForBase64,
  decodeChunkFrame,
  encodeChunkFrame,
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
});
