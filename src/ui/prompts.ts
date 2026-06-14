import {
  confirm as clackConfirm,
  isCancel,
  multiselect as clackMultiselect,
  select as clackSelect,
  text as clackText,
} from '@clack/prompts';
import { GitwizError } from './errors.js';
import { t } from './i18n.js';

// ── Cancellation ─────────────────────────────────────────────────────────────
// clack returns a `cancel` symbol on Ctrl-C instead of throwing. We re-throw an
// error tagged `ExitPromptError` so cli.ts's central handler (which already knew
// inquirer's error) prints "Cancelled." and exits 130 — no call site changes.

function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) {
    const err = new Error('Prompt cancelled');
    err.name = 'ExitPromptError';
    throw err;
  }
  return value as T;
}

/** inquirer-style validate: returns `true` when valid, or an error string. */
type Validate = (value: string) => boolean | string | undefined;

/** Adapt an inquirer validate to clack's (string = error, undefined = ok). */
function adaptValidate(validate?: Validate) {
  if (!validate) return undefined;
  return (value: string | undefined): string | undefined => {
    const result = validate(value ?? '');
    return result === true || result === undefined ? undefined : (result as string);
  };
}

// ── Prompts ──────────────────────────────────────────────────────────────────

export interface Choice<T> {
  name: string;
  value: T;
  /** Pre-checked in a checkbox / multiselect. */
  checked?: boolean;
  /** Dimmed help text shown next to the option. */
  hint?: string;
  /** inquirer compatibility — a short label; clack has no equivalent, so ignored. */
  short?: string;
}

// The generic `T` is erased to `unknown` at clack's boundary: clack's `Option<T>`
// is a conditional type that TS cannot satisfy against an un-instantiated generic,
// but resolves cleanly for the concrete `unknown` (non-primitive) branch.

export async function select<T>(opts: {
  message: string;
  choices: Choice<T>[];
  pageSize?: number;
}): Promise<T> {
  const options = opts.choices.map((c) => ({
    value: c.value as unknown,
    label: c.name,
    hint: c.hint,
  }));
  return unwrap(
    await clackSelect({ message: opts.message, options, maxItems: opts.pageSize }),
  ) as T;
}

export async function input(opts: {
  message: string;
  default?: string;
  validate?: Validate;
}): Promise<string> {
  return unwrap(
    await clackText({
      message: opts.message,
      placeholder: opts.default,
      defaultValue: opts.default,
      validate: adaptValidate(opts.validate),
    }),
  );
}

export async function confirm(opts: { message: string; default?: boolean }): Promise<boolean> {
  return unwrap(
    await clackConfirm({
      message: opts.message,
      initialValue: opts.default ?? true,
    }),
  );
}

export async function checkbox<T>(opts: {
  message: string;
  choices: Choice<T>[];
}): Promise<T[]> {
  const options = opts.choices.map((c) => ({
    value: c.value as unknown,
    label: c.name,
    hint: c.hint,
  }));
  const initialValues = opts.choices.filter((c) => c.checked).map((c) => c.value as unknown);
  return unwrap(
    await clackMultiselect({
      message: opts.message,
      options,
      initialValues,
      // Match inquirer's checkbox: an empty selection is allowed.
      required: false,
    }),
  ) as T[];
}

export function assertInteractive(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new GitwizError(t('This command is interactive and requires a terminal.'), {
      hint: t('Run it directly in your terminal, not from a script or CI.'),
    });
  }
}
