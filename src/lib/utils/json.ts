/**
 * Parse JSON with a descriptive error message on failure.
 * Use instead of bare JSON.parse() for data from external sources
 * (files, network, user input) where corruption is possible.
 */
export function safeJsonParse<T>(content: string, label: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (err) {
    throw new Error(
      `Invalid JSON in ${label}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
