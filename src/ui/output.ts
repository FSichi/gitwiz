import pc from 'picocolors';

let verbose = false;

export function setVerbose(value: boolean): void {
  verbose = value;
}

export function isVerbose(): boolean {
  return verbose;
}

// ── Logging ──────────────────────────────────────────────────────────────────

export const log = {
  info(message: string): void {
    console.log(message);
  },
  success(message: string): void {
    console.log(pc.green(`  ✔ ${message}`));
  },
  warn(message: string): void {
    console.log(pc.yellow(`  ⚠ ${message}`));
  },
  error(message: string): void {
    console.error(pc.red(`  ✖ ${message}`));
  },
  dim(message: string): void {
    console.log(pc.dim(message));
  },
  step(message: string): void {
    console.log(pc.cyan(message));
  },
  blank(): void {
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
 * Show a branded banner with the current version.
 * Called once when gitwiz starts (no subcommand).
 */
export function banner(version: string): void {
  const lines = [
    '',
    `  ${pc.bold(pc.cyan('⚙'))}  ${pc.bold(pc.cyan('gitwiz'))} ${pc.dim(`v${version}`)}`,
    `  ${pc.dim('Friendly git workflows')}`,
    '',
  ];
  for (const line of lines) console.log(line);
}

/**
 * Progress indicator for multi-step flows.
 *   step(1, 4, 'Bumping version')
 *   →  ① ②③④  Bumping version
 */
export function progressBar(current: number, total: number, label: string): void {
  const filled = '●';
  const empty = '○';
  const dots = Array.from({ length: total }, (_, i) =>
    i < current ? pc.cyan(filled) : pc.dim(empty),
  ).join(' ');
  console.log(`  ${dots}  ${pc.bold(label)}`);
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

/** Print the git command about to run — users learn git by seeing what gitwiz does. */
export function echoGitCommand(args: string[]): void {
  console.log(pc.dim(`    $ git ${formatArgs(args)}`));
}

/** Strip ANSI escape codes from a string for accurate length measurement. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

/**
 * Draw a box around lines of text.
 * Optional `title` renders a label in the top border.
 */
export function box(lines: string[], title?: string): void {
  const width = Math.max(...lines.map((l) => stripAnsi(l).length), title?.length ?? 0);

  if (title) {
    const titleStr = ` ${title} `;
    const rightPad = width + 2 - titleStr.length;
    console.log(`  ┌${pc.dim(titleStr)}${'─'.repeat(rightPad)}┐`);
  } else {
    console.log(pc.dim(`  ┌${'─'.repeat(width + 2)}┐`));
  }

  for (const line of lines) {
    const visibleLen = stripAnsi(line).length;
    console.log(`  ${pc.dim('│')} ${line.padEnd(width + 2 - visibleLen)} ${pc.dim('│')}`);
  }
  console.log(pc.dim(`  └${'─'.repeat(width + 2)}┘`));
}
