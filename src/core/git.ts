import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { echoGitCommand, isVerbose } from '../ui/output.js';

export interface GitOptions {
  cwd?: string;
}

function spawnGit(args: string[], opts: GitOptions, stdio: 'inherit' | 'pipe') {
  const result = spawnSync('git', args, {
    cwd: opts.cwd,
    stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    // No shell — args are passed verbatim, immune to quoting/injection issues.
  });
  if (result.error) {
    throw new GitwizError(`Could not run git: ${result.error.message}`, {
      hint: 'Is git installed and on your PATH?',
    });
  }
  return result;
}

// Subcommands whose progress/summary chatter is noise next to gitwiz's own
// ✔ messages. We pass --quiet to these so the console stays clean.
const QUIET_SUBCOMMANDS = new Set([
  'switch',
  'pull',
  'push',
  'fetch',
  'merge',
  'rebase',
  'commit',
  'stash',
  'clone',
]);

// Control modes (e.g. `merge --abort`, `rebase --continue`) reject --quiet.
const NO_QUIET_FLAGS = ['--abort', '--continue', '--skip', '--quit'];

/**
 * Append --quiet for noisy subcommands. Skipped when the command already sets a
 * quiet flag, uses a "--" pathspec separator (where a trailing flag would be
 * read as a path), or is a control mode that doesn't accept --quiet.
 */
function withQuiet(args: string[]): string[] {
  const sub = args[0];
  if (
    sub !== undefined &&
    QUIET_SUBCOMMANDS.has(sub) &&
    !args.includes('--') &&
    !args.includes('--quiet') &&
    !args.includes('-q') &&
    !args.some((a) => NO_QUIET_FLAGS.includes(a))
  ) {
    return [...args, '--quiet'];
  }
  return args;
}

/** Run a mutating git command: echoes the (clean) command and streams output to the user. */
export function runGit(args: string[], opts: GitOptions = {}): void {
  echoGitCommand(args);
  const result = spawnGit(withQuiet(args), opts, 'inherit');
  if (result.status !== 0) {
    throw new GitwizError(`git ${args[0]} failed (exit code ${result.status}).`);
  }
}

/** Run a mutating git command, returning success instead of throwing. Still echoes. */
export function tryRunGit(args: string[], opts: GitOptions = {}): boolean {
  echoGitCommand(args);
  const result = spawnGit(withQuiet(args), opts, 'inherit');
  return result.status === 0;
}

/** Run a read-only git command and capture trimmed stdout. Throws on failure. */
export function captureGit(args: string[], opts: GitOptions = {}): string {
  if (isVerbose()) echoGitCommand(args);
  const result = spawnGit(args, opts, 'pipe');
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    throw new GitwizError(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : '.'}`);
  }
  return (result.stdout ?? '').trim();
}

/** Like captureGit but returns null on failure. */
export function tryCaptureGit(args: string[], opts: GitOptions = {}): string | null {
  if (isVerbose()) echoGitCommand(args);
  const result = spawnGit(args, opts, 'pipe');
  if (result.status !== 0) return null;
  return (result.stdout ?? '').trim();
}

// ---------------------------------------------------------------------------
// Repo query helpers
// ---------------------------------------------------------------------------

export function isGitRepo(opts: GitOptions = {}): boolean {
  return tryCaptureGit(['rev-parse', '--is-inside-work-tree'], opts) === 'true';
}

export function ensureGitRepo(opts: GitOptions = {}): void {
  if (!isGitRepo(opts)) {
    throw new GitwizError(t('This folder is not a git repository.'), {
      hint: t('Move into your project folder, or run "gitwiz init" to set one up.'),
    });
  }
}

export function getRepoRoot(opts: GitOptions = {}): string {
  return captureGit(['rev-parse', '--show-toplevel'], opts);
}

/** Current branch name; empty string when HEAD is detached. */
export function getCurrentBranch(opts: GitOptions = {}): string {
  return captureGit(['branch', '--show-current'], opts);
}

export function isWorkingTreeClean(opts: GitOptions = {}): boolean {
  return captureGit(['status', '--porcelain'], opts) === '';
}

export function localBranchExists(name: string, opts: GitOptions = {}): boolean {
  return tryCaptureGit(['rev-parse', '-q', '--verify', `refs/heads/${name}`], opts) !== null;
}

export function remoteBranchExists(name: string, opts: GitOptions = {}): boolean {
  return tryCaptureGit(['rev-parse', '-q', '--verify', `refs/remotes/origin/${name}`], opts) !== null;
}

export function tagExists(tag: string, opts: GitOptions = {}): boolean {
  return tryCaptureGit(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], opts) !== null;
}

export function hasRemote(opts: GitOptions = {}): boolean {
  return tryCaptureGit(['remote', 'get-url', 'origin'], opts) !== null;
}

export function getRemoteUrl(opts: GitOptions = {}): string | null {
  return tryCaptureGit(['remote', 'get-url', 'origin'], opts);
}

/** Upstream ref of the current branch (e.g. "origin/feature/x"), or null if none. */
export function getUpstream(opts: GitOptions = {}): string | null {
  return tryCaptureGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], opts);
}

/**
 * How many commits `head` is ahead of / behind `base`.
 * Returns null when the ranges can't be compared (e.g. unknown ref).
 */
export function getAheadBehind(
  base: string,
  head: string = 'HEAD',
  opts: GitOptions = {},
): { ahead: number; behind: number } | null {
  const out = tryCaptureGit(['rev-list', '--left-right', '--count', `${base}...${head}`], opts);
  if (out === null) return null;
  const [behind = '0', ahead = '0'] = out.split(/\s+/);
  return { ahead: Number(ahead), behind: Number(behind) };
}

export function getInProgressOperation(opts: GitOptions = {}): 'merge' | 'rebase' | null {
  const gitDir = tryCaptureGit(['rev-parse', '--absolute-git-dir'], opts);
  if (!gitDir) return null;
  if (existsSync(join(gitDir, 'MERGE_HEAD'))) return 'merge';
  if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) {
    return 'rebase';
  }
  return null;
}

/** True when the given commit is reachable from any remote-tracking branch (i.e. pushed). */
export function isCommitPushed(commit: string, opts: GitOptions = {}): boolean {
  const out = tryCaptureGit(['branch', '-r', '--contains', commit], opts);
  return out !== null && out !== '';
}
