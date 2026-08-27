import { describeError } from '../error';

describe('describeError', () => {
  it('keeps a DOMException name when the browser supplies no message', () => {
    expect(describeError(new DOMException('', 'QuotaExceededError'))).toBe('QuotaExceededError');
  });

  it('includes both the error name and message when available', () => {
    expect(describeError(new DOMException('The operation failed', 'OperationError'))).toBe(
      'OperationError: The operation failed',
    );
  });

  it('uses whichever Error field is available and falls back for blank values', () => {
    const messageOnly = new Error('message only');
    messageOnly.name = '';
    const nameOnly = new Error('');
    nameOnly.name = 'NameOnly';
    const blank = new Error('');
    blank.name = '';

    expect(describeError(messageOnly)).toBe('message only');
    expect(describeError(nameOnly)).toBe('NameOnly');
    expect(describeError(blank)).toBe('Unknown error');
  });

  it('describes non-Error values without leaking blank output', () => {
    expect(describeError('  remote failure  ')).toBe('remote failure');
    expect(describeError('   ')).toBe('Unknown error');
    expect(describeError(null)).toBe('null');
  });
});
