export function useAuthRequest() {
  return [null, null, () => Promise.resolve({ type: 'dismiss' })];
}
