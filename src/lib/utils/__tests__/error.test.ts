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
});
