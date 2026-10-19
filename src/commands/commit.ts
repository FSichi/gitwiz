import pc from 'picocolors';
import { loadConfig } from '../core/config.js';
import { buildCommitHeader, buildCommitMessage, normalizeScope } from '../core/commit-message.js';
import { captureGitPaths, captureGitRaw, ensureGitRepo, getCurrentBranch, runGit, type GitOptions } from '../core/git.js';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { box, log } from '../ui/output.js';
import { assertInteractive, checkbox, confirm, input, select } from '../ui/prompts.js';

export interface CommitOptions {
  type?: string;
  scope?: string;
  message?: string;
  /** true (flag with no value) → breaking; string → breaking with footer text. */
  breaking?: boolean | string;
  all?: boolean;
  allowProtected?: boolean;
}

function getStagedFiles(opts: GitOptions): string[] {
  return captureGitPaths(['diff', '--name-only', '--cached'], opts);
}

/**
 * Parse `git status --porcelain -z` into the changed (tracked) + untracked files
 * that could be staged. Paths come back verbatim and relative to the repo root.
 * Exported for unit tests.
 */
export function parseStageableFiles(porcelainZ: string): string[] {
  const entries = porcelainZ.split('\0');
  const files: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (entry.length < 4) continue;
    const xy = entry.slice(0, 2);
    // A rename or copy carries its original path as the next entry — skip it.
    if (/[RC]/.test(xy)) i++;
    if (xy === '??' || xy[1] !== ' ') files.push(entry.slice(3));
  }
  return files;
}

function getStageableFiles(opts: GitOptions): string[] {
  // Raw, not trimmed — a porcelain entry starts with a space for working-tree changes.
  return parseStageableFiles(captureGitRaw(['status', '--porcelain', '-z'], opts));
}

function createCommit(message: string): void {
  try {
    runGit(['commit', '-m', message]);
  } catch (err) {
    if (err instanceof GitwizError) {
      throw new GitwizError(t('The commit was rejected (a git hook may have failed).'), {
        hint: t('Fix the reported issue and run "gitwiz commit" again.'),
      });
    }
    throw err;
  }
  log.success(t('Commit created.'));
}

export async function commitCommand(opts: CommitOptions = {}): Promise<void> {
  ensureGitRepo();
  const { config, repoRoot } = loadConfig();
  // Paths from status/diff are relative to the repo root, so path-taking
  // commands run from there too — otherwise `git add` misses them from a subfolder.
  const atRoot: GitOptions = { cwd: repoRoot };
  const nonInteractive = Boolean(opts.type && opts.message);

  // Half the flags in a script would otherwise surface as a vague "needs a terminal".
  if (!nonInteractive && (opts.type || opts.message)) {
    assertInteractive(t('To commit without prompts, pass both --type and -m.'));
  }
  if (opts.type && !config.commitTypes.some((ct) => ct.type === opts.type)) {
    throw new GitwizError(t('Unknown commit type "{type}".', { type: opts.type }), {
      hint: t('Valid types: {types}.', { types: config.commitTypes.map((ct) => ct.type).join(', ') }),
    });
  }
  if (opts.message !== undefined && opts.message.trim() === '') {
    throw new GitwizError(t('Description cannot be empty.'));
  }

  // Protected-branch guard: committing straight to main/develop is usually a mistake.
  const currentBranch = getCurrentBranch();
  if (config.protectedBranches.includes(currentBranch)) {
    if (nonInteractive) {
      if (!opts.allowProtected) {
        throw new GitwizError(
          t('"{branch}" is a protected branch — commits should arrive via work branches.', { branch: currentBranch }),
          { hint: t('Create a branch first (gitwiz branch), or pass --allow-protected to override.') },
        );
      }
    } else {
      assertInteractive();
      log.warn(t('You are about to commit directly to {branch}, a protected branch.', { branch: pc.bold(currentBranch) }));
      const proceed = await confirm({
        message: t('Commit to {branch} anyway?', { branch: currentBranch }),
        default: false,
      });
      if (!proceed) {
        log.dim(t('Cancelled. Run "gitwiz branch" to start a work branch instead.'));
        return;
      }
    }
  }

  if (opts.all) runGit(['add', '-A']);

  // Non-interactive path: everything comes from flags, no prompts.
  if (nonInteractive) {
    if (getStagedFiles(atRoot).length === 0) {
      if (getStageableFiles(atRoot).length === 0) {
        log.success(t('Working tree clean — nothing to commit.'));
        return;
      }
      throw new GitwizError(t('Nothing is staged.'), {
        hint: t('Stage the files first, or pass --all to stage everything.'),
      });
    }
    const breaking = opts.breaking !== undefined && opts.breaking !== false;
    const parts = {
      type: opts.type!,
      scope: opts.scope ? normalizeScope(opts.scope) || undefined : undefined,
      description: opts.message!,
      breaking,
      breakingDescription: typeof opts.breaking === 'string' ? opts.breaking : undefined,
    };
    const header = buildCommitHeader(parts);
    if (header.length > 72) {
      log.warn(t('The commit subject is {n} characters (recommended ≤ 72).', { n: header.length }));
    }
    createCommit(buildCommitMessage(parts));
    return;
  }

  // Interactive path.
  assertInteractive();

  let staged = getStagedFiles(atRoot);
  if (staged.length === 0) {
    const stageable = getStageableFiles(atRoot);
    if (stageable.length === 0) {
      log.success(t('Working tree clean — nothing to commit.'));
      return;
    }
    log.info(t('No files are staged yet, but {n} file(s) have changes.', { n: stageable.length }));
    const stageAction = await select({
      message: t('How would you like to proceed?'),
      choices: [
        { name: t('Stage all changes and commit'), value: 'all' as const, short: t('Stage all') },
        { name: t('Pick specific files to stage'), value: 'pick' as const, short: t('Pick files') },
      ],
    });
    if (stageAction === 'all') {
      runGit(['add', '-A']);
    } else {
      const toStage = await checkbox({
        message: t('Pick the files to include in this commit:'),
        choices: stageable.map((f) => ({ name: f, value: f })),
      });
      if (toStage.length === 0) {
        log.dim(t('No files selected — nothing to commit.'));
        return;
      }
      runGit(['add', '--', ...toStage], atRoot);
    }
    staged = getStagedFiles(atRoot);
  }

  log.blank();
  log.info(pc.bold(t('Files in this commit:')));
  for (const file of staged) log.info(`  ${pc.green('+')} ${file}`);
  log.blank();

  // Any flag that was passed answers its own question; the wizard asks the rest.
  const type =
    opts.type ??
    (await select({
      message: t('Type of change:'),
      choices: config.commitTypes.map((ct) => ({
        name: `${ct.emoji} ${ct.type.padEnd(9)} ${pc.dim(t(ct.description))}`,
        value: ct.type,
        short: ct.type,
      })),
      pageSize: 12,
    }));

  const scopeRaw =
    opts.scope ??
    (await input({
      message: `${t('Scope')} ${pc.dim(t('(optional — the area affected, e.g. api, ui, auth)'))}:`,
    }));
  const scope = normalizeScope(scopeRaw) || undefined;

  const description =
    opts.message ??
    (await input({
      message: t('Short description (imperative: "add", "fix", not "added"):'),
      validate: (value) => (value.trim() === '' ? t('Description cannot be empty.') : true),
    }));

  const breaking = await confirm({
    message: t('Does this break existing behavior (breaking change)?'),
    default: false,
  });
  let breakingDescription: string | undefined;
  if (breaking) {
    breakingDescription = await input({
      message: t('Describe what breaks and how to migrate:'),
    });
  }

  const parts = { type, scope, description, breaking, breakingDescription };
  const header = buildCommitHeader(parts);
  if (header.length > 72) {
    log.warn(t('The first line is {n} characters — try to keep it under 72.', { n: header.length }));
  }

  const message = buildCommitMessage(parts);
  log.blank();
  box(message.split('\n'));
  log.blank();

  const proceed = await confirm({ message: t('Create this commit?'), default: true });
  if (!proceed) {
    log.dim(t('Commit cancelled. Your files are still staged.'));
    return;
  }

  createCommit(message);
}
