import { safeJsonParse } from '../json';

describe('safeJsonParse', () => {
  test('parses valid JSON', () => {
    const result = safeJsonParse<{ name: string }>('{"name":"test"}', 'test');
    expect(result).toEqual({ name: 'test' });
  });

  test('throws with descriptive error on invalid JSON', () => {
    expect(() => safeJsonParse('not json', 'settings file')).toThrow(
      /Invalid JSON in settings file/,
    );
  });

  test('throws with descriptive error on empty string', () => {
    expect(() => safeJsonParse('', 'empty')).toThrow(/Invalid JSON in empty/);
  });

  test('parses arrays', () => {
    const result = safeJsonParse<number[]>('[1,2,3]', 'array');
    expect(result).toEqual([1, 2, 3]);
  });
});
