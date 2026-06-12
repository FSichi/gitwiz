import { GitwizError } from './errors.js';
import { t } from './i18n.js';

export { select, input, confirm, checkbox } from '@inquirer/prompts';

export function assertInteractive(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new GitwizError(t('This command is interactive and requires a terminal.'), {
      hint: t('Run it directly in your terminal, not from a script or CI.'),
    });
  }
}
