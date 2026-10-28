/**
 * Journal and page ids become path segments (native files) and key segments
 * (web IndexedDB). Route parameters are not trusted: a separator or dot
 * segment could address another journal's records, e.g. a deep link whose
 * page id is `../metadata`.
 */
export function isSafeRecordId(id: string): boolean {
  return !!id && id !== '.' && id !== '..' && !/[/\\]/.test(id);
}

export function safeRecordId(id: string): string {
  if (!isSafeRecordId(id)) throw new Error('Invalid record id');
  return id;
}
