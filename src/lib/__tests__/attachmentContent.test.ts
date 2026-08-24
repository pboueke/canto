import type { Attachment } from 'canto-data';
import { decodeChunkFrame, encodeChunkFrame } from '../storage/attachment-content';

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
      chunkSize: 512 * 1024,
      chunkCount: 1,
      ...(generation ? { generation } : {}),
    },
  };
}

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
