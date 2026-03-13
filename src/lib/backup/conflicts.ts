/**
 * Check if a journal name already exists among the given journals.
 */
export function hasNameConflict(name: string, existingTitles: string[]): boolean {
  const lower = name.toLowerCase().trim();
  return existingTitles.some((t) => t.toLowerCase().trim() === lower);
}

/**
 * Generate a non-conflicting name by appending (copy), (copy 2), etc.
 */
export function resolveNameConflict(name: string, existingTitles: string[]): string {
  if (!hasNameConflict(name, existingTitles)) return name;

  const copyName = `${name} (copy)`;
  if (!hasNameConflict(copyName, existingTitles)) return copyName;

  let n = 2;
  while (hasNameConflict(`${name} (copy ${n})`, existingTitles)) {
    n++;
  }
  return `${name} (copy ${n})`;
}
