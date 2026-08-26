/**
 * Make browser-native exceptions actionable. Some browsers expose a blank
 * message for DOMException, but its name distinguishes quota exhaustion from
 * cryptographic authentication failure.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name?.trim();
    const message = error.message?.trim();
    if (name && message) return `${name}: ${message}`;
    return name || message || 'Unknown error';
  }
  const value = String(error).trim();
  return value || 'Unknown error';
}
