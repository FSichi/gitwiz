import { WizgitError } from './errors.js';

export { select, input, confirm, checkbox } from '@inquirer/prompts';

export function assertInteractive(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new WizgitError('This command is interactive and requires a terminal.', {
      hint: 'Run it directly in your terminal, not from a script or CI.',
    });
  }
}
