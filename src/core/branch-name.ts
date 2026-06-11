/**
 * Normalize a user-typed branch name into a safe ref segment:
 * lowercase, spaces → hyphens, strip characters git refs disallow.
 * The final gate at runtime is `git check-ref-format --branch`.
 */
export function normalizeBranchName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/\.lock$/, '')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '');
}

/** Returns an error message for an unusable branch name, or null when it looks valid. */
export function validateBranchName(name: string): string | null {
  if (name === '') return 'Branch name cannot be empty.';
  if (name.length > 100) return 'Branch name is too long (max 100 characters).';
  if (!/^[a-z0-9._-]+$/.test(name)) return 'Branch name can only contain letters, numbers, dots, hyphens and underscores.';
  return null;
}
