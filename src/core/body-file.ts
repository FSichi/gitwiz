import { readFileSync } from 'node:fs';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';

/**
 * Read a --body-file argument ("-" reads stdin). Long text with newlines, quotes
 * and backticks survives a file intact, where shell quoting tends to mangle it
 * (literal "\n", backticks eaten by the shell).
 */
export function readBodyFile(path: string): string {
  try {
    return readFileSync(path === '-' ? 0 : path, 'utf8');
  } catch (err) {
    throw new GitwizError(t('Could not read {file}: {message}', { file: path, message: (err as Error).message }));
  }
}
