import { formatSyncWarning } from '../sync/warnings';

const messages = {
  legacyAttachmentTooLarge: 'Large legacy attachment was deferred',
  chunkGenerationMissing: 'Older chunk format was deferred',
  attachmentNotFound: 'Attachment was not found in cloud storage',
};

describe('formatSyncWarning', () => {
  it.each([
    ['legacy-attachment-too-large', 'Large legacy attachment was deferred'],
    ['chunk-generation-missing', 'Older chunk format was deferred'],
    ['attachment-not-found', 'Attachment was not found in cloud storage'],
  ])('maps %s to its specific localized message', (reason, expected) => {
    expect(
      formatSyncWarning({ name: 'video.mp4', size: 1_572_864, reason }, 'en-US', messages),
    ).toBe(`video.mp4 (1.5 MB): ${expected}`);
  });

  it('uses locale-formatted declared sizes and does not invent a size', () => {
    expect(
      formatSyncWarning(
        { name: 'small.jpg', size: 512 * 1024, reason: 'legacy-attachment-too-large' },
        'de-DE',
        messages,
      ),
    ).toBe('small.jpg (512 KB): Large legacy attachment was deferred');
    expect(
      formatSyncWarning(
        { name: 'unknown.jpg', reason: 'chunk-generation-missing' },
        'en-US',
        messages,
      ),
    ).toBe('unknown.jpg: Older chunk format was deferred');
  });
});
