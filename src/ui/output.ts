import { intro as clackIntro, note as clackNote, outro as clackOutro } from '@clack/prompts';
import pc from 'picocolors';

let verbose = false;

export function setVerbose(value: boolean): void {
  verbose = value;
}

export function isVerbose(): boolean {
  return verbose;
}

// ── JSON mode ────────────────────────────────────────────────────────────────
// When a command runs with --json its stdout belongs to the caller's parser, so
// every human-facing line has to disappear — including the echoed commands.
// Warnings and errors still go to stderr, where they can't corrupt the payload.

let jsonMode = false;

export function setJsonMode(value: boolean): void {
  jsonMode = value;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/** Print the machine-readable payload. The only thing a --json run writes to stdout. */
export function emitJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ── Logging ──────────────────────────────────────────────────────────────────

export const log = {
  info(message: string): void {
    if (jsonMode) return;
    console.log(message);
  },
  success(message: string): void {
    if (jsonMode) return;
    console.log(pc.green(`  ✔ ${message}`));
  },
  warn(message: string): void {
    if (jsonMode) {
      console.error(pc.yellow(`  ⚠ ${message}`));
      return;
    }
    console.log(pc.yellow(`  ⚠ ${message}`));
  },
  error(message: string): void {
    console.error(pc.red(`  ✖ ${message}`));
  },
  dim(message: string): void {
    if (jsonMode) return;
    console.log(pc.dim(message));
  },
  step(message: string): void {
    if (jsonMode) return;
    console.log(pc.cyan(message));
  },
  blank(): void {
    if (jsonMode) return;
    console.log();
  },
};

// ── Styled elements ──────────────────────────────────────────────────────────

export function heading(text: string): void {
  console.log(pc.bold(pc.cyan(text)));
}

export function divider(): void {
  console.log(pc.dim('─'.repeat(50)));
}

/** Print a styled section header. */
export function section(title: string): void {
  console.log(`\n${pc.bold(pc.white(`  ${title}`))}`);
}

/**
 * Open a branded session header with the current version.
 * Called once when gitwiz starts the interactive menu (no subcommand).
 * Starts clack's connected gutter, which the prompts that follow continue.
 */
export function banner(version: string): void {
  clackIntro(`${pc.bold(pc.cyan('⚙ gitwiz'))} ${pc.dim(`v${version}`)}`);
}

/** Close a clack gutter session with a final line. */
export function outro(message = ''): void {
  clackOutro(message);
}

// ── Spinner ──────────────────────────────────────────────────────────────────

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Run an async function while showing a spinner.
 * Clears the spinner line when done and returns the result.
 */
export async function spin<T>(message: string, fn: () => Promise<T>): Promise<T> {
  let i = 0;
  let result: T;
  let error: unknown;

  const timer = setInterval(() => {
    process.stdout.write(`\r  ${pc.cyan(FRAMES[i++ % FRAMES.length])} ${message}`);
  }, 80);

  try {
    result = await fn();
  } catch (err) {
    error = err;
  } finally {
    clearInterval(timer);
    process.stdout.write('\r\x1b[K');
  }

  if (error) throw error;
  return result!;
}

/**
 * Run a synchronous function while showing a spinner.
 * Useful for blocking operations like spawnSync.
 */
export function spinSync<T>(message: string, fn: () => T): T {
  let i = 0;
  let result: T;
  let error: unknown;

  const timer = setInterval(() => {
    process.stdout.write(`\r  ${pc.cyan(FRAMES[i++ % FRAMES.length])} ${message}`);
  }, 80);

  try {
    result = fn();
  } catch (err) {
    error = err;
  } finally {
    clearInterval(timer);
    process.stdout.write('\r\x1b[K');
  }

  if (error) throw error;
  return result!;
}

// ── Box (improved) ───────────────────────────────────────────────────────────

/** Quote args containing whitespace or quotes so the echoed command is copy-pasteable. */
function formatArgs(args: string[]): string {
  return args.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(' ');
}

/** Print the command about to run — users learn the tool by seeing what gitwiz does. */
export function echoCommand(bin: string, args: string[]): void {
  if (jsonMode) return;
  console.log(pc.dim(`    $ ${bin} ${formatArgs(args)}`));
}

/** Print the git command about to run — users learn git by seeing what gitwiz does. */
export function echoGitCommand(args: string[]): void {
  echoCommand('git', args);
}

/**
 * Draw a box around lines of text — delegates to clack's `note`, which measures
 * ANSI-aware widths and renders inside the connected gutter.
 * Optional `title` renders a label in the top border.
 */
export function box(lines: string[], title?: string): void {
  clackNote(lines.join('\n'), title);
}
