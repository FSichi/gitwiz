import { spawnSync } from 'node:child_process';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { echoCommand, isVerbose } from '../ui/output.js';
import { parseRepoWebUrl } from './changelog/render.js';
import { getRemoteUrl } from './git.js';

export interface GhOptions {
  cwd?: string;
  /**
   * Force echoing the command even though it is captured. Mutating commands whose
   * output we need (e.g. `gh pr create`, which prints the new PR's URL) still owe
   * the user the same visible trail as a streamed one.
   */
  echo?: boolean;
}

function spawnGh(args: string[], opts: GhOptions, stdio: 'inherit' | 'pipe') {
  const result = spawnSync('gh', args, {
    cwd: opts.cwd,
    stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    // No shell — same reasoning as git.ts: args pass verbatim, so PR bodies with
    // quotes, backticks or $VARS survive untouched.
  });
  if (result.error) {
    throw new GitwizError(t('Could not run the GitHub CLI (gh): {message}', {
      message: result.error.message,
    }), {
      hint: t('Install it from https://cli.github.com and run "gh auth login".'),
    });
  }
  return result;
}

/** Run a mutating gh command: echoes the command and streams output to the user. */
export function runGh(args: string[], opts: GhOptions = {}): void {
  echoCommand('gh', args);
  const result = spawnGh(args, opts, 'inherit');
  if (result.status !== 0) {
    throw new GitwizError(t('gh {sub} failed (exit code {code}).', {
      sub: args[0] ?? '',
      code: String(result.status),
    }));
  }
}

/** Run a mutating gh command, returning success instead of throwing. Still echoes. */
export function tryRunGh(args: string[], opts: GhOptions = {}): boolean {
  echoCommand('gh', args);
  return spawnGh(args, opts, 'inherit').status === 0;
}

/**
 * Run a read-only gh command and capture trimmed stdout. Throws on failure.
 * gh reports scope and auth problems on stderr, so we surface it verbatim —
 * its messages already name the missing scope and the command to fix it.
 */
export function captureGh(args: string[], opts: GhOptions = {}): string {
  if (opts.echo || isVerbose()) echoCommand('gh', args);
  const result = spawnGh(args, opts, 'pipe');
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    throw new GitwizError(t('gh {args} failed{detail}', {
      args: args.join(' '),
      detail: stderr ? `: ${stderr}` : '.',
    }), { hint: hintForStderr(stderr) });
  }
  return (result.stdout ?? '').trim();
}

/** Like captureGh but returns null on failure. */
export function tryCaptureGh(args: string[], opts: GhOptions = {}): string | null {
  if (isVerbose()) echoCommand('gh', args);
  const result = spawnGh(args, opts, 'pipe');
  if (result.status !== 0) return null;
  return (result.stdout ?? '').trim();
}

/** Run a gh command that emits JSON and parse it. */
export function captureGhJson<T>(args: string[], opts: GhOptions = {}): T {
  const out = captureGh(args, opts);
  try {
    return JSON.parse(out) as T;
  } catch {
    throw new GitwizError(t('gh returned output that is not valid JSON.'), {
      hint: t('Run the same command with --verbose to see what it printed.'),
    });
  }
}

/**
 * Turn gh's rawest failures into an actionable next step. Missing scopes are by
 * far the most common wall — reading a project board needs read:project, and
 * writing to one needs the separate `project` scope, which a default login lacks.
 */
function hintForStderr(stderr: string): string | undefined {
  const lower = stderr.toLowerCase();
  if (lower.includes('project') && (lower.includes('scope') || lower.includes('insufficient'))) {
    return t('Your token is missing the "project" scope. Run: gh auth refresh -s project');
  }
  if (lower.includes('scope')) {
    return t('Your token is missing a scope. Run: gh auth refresh -s <scope>');
  }
  if (lower.includes('not logged') || lower.includes('authentication')) {
    return t('Run "gh auth login" to authenticate.');
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Environment checks
// ---------------------------------------------------------------------------

export function isGhInstalled(): boolean {
  const result = spawnSync('gh', ['--version'], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

export function isGhAuthenticated(): boolean {
  const result = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

/**
 * Guard for every GitHub command. Checks the two failure modes separately so the
 * hint names the actual fix instead of a generic "something went wrong".
 */
export function ensureGh(): void {
  if (!isGhInstalled()) {
    throw new GitwizError(t('The GitHub CLI (gh) is not installed.'), {
      hint: t('Install it from https://cli.github.com — gitwiz uses it for everything GitHub.'),
    });
  }
  if (!isGhAuthenticated()) {
    throw new GitwizError(t('You are not logged in to GitHub.'), {
      hint: t('Run: gh auth login'),
    });
  }
}

// ---------------------------------------------------------------------------
// Repo identity
// ---------------------------------------------------------------------------

/**
 * Extract "owner/repo" from a browsable repo URL.
 * Exported for unit tests — the remote URL shapes in the wild are the fiddly part.
 */
export function parseRepoSlug(webUrl: string): string | null {
  const match = webUrl.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)\/?$/);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

/**
 * The "owner/repo" of the current repository, or null when origin is missing or
 * is not a GitHub remote. Callers decide whether that is fatal.
 */
export function getRepoSlug(opts: GhOptions = {}): string | null {
  const web = parseRepoWebUrl(getRemoteUrl(opts));
  if (!web || web.host !== 'github') return null;
  return parseRepoSlug(web.url);
}

/** Like getRepoSlug but throws a guiding error, for commands that cannot proceed without it. */
export function ensureRepoSlug(opts: GhOptions = {}): string {
  const slug = getRepoSlug(opts);
  if (!slug) {
    throw new GitwizError(t('This repository has no GitHub remote named "origin".'), {
      hint: t('Add one with: git remote add origin <url>'),
    });
  }
  return slug;
}
