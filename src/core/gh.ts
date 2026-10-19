import { execFile, spawnSync } from 'node:child_process';
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

// gh exits with 4 when it has no usable login (documented in `gh help exit-codes`).
const EXIT_AUTH_REQUIRED = 4;
const MAX_BUFFER = 256 * 1024 * 1024;

function notInstalledError(): GitwizError {
  return new GitwizError(t('The GitHub CLI (gh) is not installed.'), {
    hint: t('Install it from https://cli.github.com — gitwiz uses it for everything GitHub.'),
  });
}

function notLoggedInError(): GitwizError {
  return new GitwizError(t('You are not logged in to GitHub.'), {
    hint: t('Run: gh auth login'),
  });
}

/** A failure to even start gh: "not installed" when it is missing from PATH. */
function launchError(error: Error & { code?: unknown }): GitwizError {
  if (error.code === 'ENOENT') return notInstalledError();
  return new GitwizError(t('Could not run the GitHub CLI (gh): {message}', {
    message: error.message,
  }), {
    hint: t('Install it from https://cli.github.com and run "gh auth login".'),
  });
}

function spawnGh(args: string[], opts: GhOptions, stdio: 'inherit' | 'pipe') {
  const result = spawnSync('gh', args, {
    cwd: opts.cwd,
    stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    // No shell — same reasoning as git.ts: args pass verbatim, so PR bodies with
    // quotes, backticks or $VARS survive untouched.
  });
  if (result.error) throw launchError(result.error);
  return result;
}

/**
 * The outcome of a captured gh run, or the error that explains it. gh is not
 * probed up front (`gh auth status` alone costs a network round trip on every
 * command): a missing install or login is recognized from the failure itself.
 */
function checkCaptured(args: string[], status: number | null, stdout: string, stderr: string): string {
  if (status === 0) return stdout.trim();
  const detail = stderr.trim();
  if (status === EXIT_AUTH_REQUIRED) throw notLoggedInError();
  throw new GitwizError(t('gh {args} failed{detail}', {
    args: args.join(' '),
    detail: detail ? `: ${detail}` : '.',
  }), { hint: hintForStderr(detail) });
}

function parseJson<T>(out: string): T {
  try {
    return JSON.parse(out) as T;
  } catch {
    throw new GitwizError(t('gh returned output that is not valid JSON.'), {
      hint: t('Run the same command with --verbose to see what it printed.'),
    });
  }
}

/** Run a mutating gh command: echoes the command and streams output to the user. */
export function runGh(args: string[], opts: GhOptions = {}): void {
  echoCommand('gh', args);
  const result = spawnGh(args, opts, 'inherit');
  if (result.status === EXIT_AUTH_REQUIRED) throw notLoggedInError();
  if (result.status !== 0) {
    throw new GitwizError(t('gh {sub} failed (exit code {code}).', {
      sub: args[0] ?? '',
      code: String(result.status),
    }));
  }
}

/**
 * Run a read-only gh command and capture trimmed stdout. Throws on failure.
 * gh reports scope and auth problems on stderr, so we surface it verbatim —
 * its messages already name the missing scope and the command to fix it.
 */
export function captureGh(args: string[], opts: GhOptions = {}): string {
  if (opts.echo || isVerbose()) echoCommand('gh', args);
  const result = spawnGh(args, opts, 'pipe');
  return checkCaptured(args, result.status, result.stdout ?? '', result.stderr ?? '');
}

/** Run a gh command that emits JSON and parse it. */
export function captureGhJson<T>(args: string[], opts: GhOptions = {}): T {
  return parseJson<T>(captureGh(args, opts));
}

/**
 * captureGh without blocking, so independent reads (orgs + login, a PR + who
 * is reviewing it) overlap their network round trips instead of queueing.
 */
export function captureGhAsync(args: string[], opts: GhOptions = {}): Promise<string> {
  if (opts.echo || isVerbose()) echoCommand('gh', args);
  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      args,
      { cwd: opts.cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER, windowsHide: true },
      (error, stdout, stderr) => {
        // A string code means gh never ran (ENOENT…); a number is its exit code.
        if (error && typeof error.code === 'string') {
          reject(launchError(error));
          return;
        }
        const status = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        try {
          resolve(checkCaptured(args, status, stdout, stderr));
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}

/** captureGhJson without blocking — see captureGhAsync. */
export async function captureGhJsonAsync<T>(args: string[], opts: GhOptions = {}): Promise<T> {
  return parseJson<T>(await captureGhAsync(args, opts));
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
