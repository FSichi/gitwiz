import pc from 'picocolors';

let verbose = false;

export function setVerbose(value: boolean): void {
  verbose = value;
}

export function isVerbose(): boolean {
  return verbose;
}

export const log = {
  info(message: string): void {
    console.log(message);
  },
  success(message: string): void {
    console.log(pc.green(`✔ ${message}`));
  },
  warn(message: string): void {
    console.log(pc.yellow(`⚠ ${message}`));
  },
  error(message: string): void {
    console.error(pc.red(`✖ ${message}`));
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

export function heading(text: string): void {
  console.log(pc.bold(pc.cyan(text)));
}

/** Quote args containing whitespace or quotes so the echoed command is copy-pasteable. */
function formatArgs(args: string[]): string {
  return args.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(' ');
}

/** Print the git command about to run — users learn git by seeing what gitwiz does. */
export function echoGitCommand(args: string[]): void {
  console.log(pc.dim(`  $ git ${formatArgs(args)}`));
}

export function box(lines: string[]): void {
  const width = Math.max(...lines.map((l) => l.length));
  const top = `┌${'─'.repeat(width + 2)}┐`;
  const bottom = `└${'─'.repeat(width + 2)}┘`;
  console.log(pc.dim(top));
  for (const line of lines) {
    console.log(`${pc.dim('│')} ${line.padEnd(width)} ${pc.dim('│')}`);
  }
  console.log(pc.dim(bottom));
}
