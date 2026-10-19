import pc from 'picocolors';
import { loadConfig } from '../core/config.js';
import { buildCommitHeader, buildCommitMessage, normalizeScope, parseCommitHeader } from '../core/commit-message.js';
import { captureGitPaths, captureGitRaw, ensureGitRepo, getCurrentBranch, runGit, type GitOptions } from '../core/git.js';
import { readBodyFile } from '../core/body-file.js';
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
  /** Text after the header: details, footers. */
  body?: string;
  /** Read the body from this file ("-" = stdin). */
  bodyFile?: string;
  all?: boolean;
  allowProtected?: boolean;
  /** Commit only these files (relative to the current folder); others stay as they are. */
  paths?: string[];
}

/**
 * Read -m the way agents write it. A full conventional header ("feat(auth): add
 * login") supplies the type and scope instead of being prefixed a second time
 * ("feat: feat(auth): …"), and any lines after the first become the body.
 * Exported for unit tests.
 */
export function resolveMessageFlags(opts: CommitOptions, knownTypes: readonly string[]): CommitOptions {
  if (opts.message === undefined) return opts;
  const [first = '', ...rest] = opts.message.replace(/\r\n/g, '\n').split('\n');
  const body = [rest.join('\n').trim(), opts.body?.trim() ?? ''].filter(Boolean).join('\n\n') || undefined;
  const header = parseCommitHeader(first, knownTypes);
  if (!header) return { ...opts, message: first.trim(), body };
  if (opts.type && opts.type !== header.type) {
    throw new GitwizError(t('-m starts with "{found}:" but --type is "{type}".', { found: header.type, type: opts.type }), {
      hint: t('Give the type once: in --type, or at the start of -m.'),
    });
  }
  return {
    ...opts,
    type: header.type,
    scope: opts.scope ?? header.scope,
    breaking: opts.breaking ?? (header.breaking || undefined),
    message: header.description,
    body,
  };
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

/** Create the commit. With paths, only those files go in (git's --only), whatever else is staged. */
function createCommit(message: string, paths: string[]): void {
  try {
    runGit(['commit', '-m', message, ...(paths.length > 0 ? ['--', ...paths] : [])]);
  } catch (err) {
    if (err instanceof GitwizError) {
      // Usually commitlint or a pre-commit check; its own output is printed above.
      throw new GitwizError(t('The commit was rejected (a git hook may have failed).'), {
        hint: t('Nothing was committed and your changes are still there: fix what the hook reported (often the message) and run the same command again.'),
      });
    }
    throw err;
  }
  log.success(t('Commit created.'));
}

export async function commitCommand(flags: CommitOptions = {}): Promise<void> {
  ensureGitRepo();
  const { config, repoRoot } = loadConfig();
  const fileBody = flags.bodyFile ? readBodyFile(flags.bodyFile) : undefined;
  const body = [flags.body, fileBody].map((text) => text?.trim()).filter(Boolean).join('\n\n') || undefined;
  const opts = resolveMessageFlags({ ...flags, body }, config.commitTypes.map((ct) => ct.type));
  const paths = opts.paths ?? [];
  // Paths from status/diff are relative to the repo root, so path-taking
  // commands run from there too — otherwise `git add` misses them from a subfolder.
  const atRoot: GitOptions = { cwd: repoRoot };
  const nonInteractive = Boolean(opts.type && opts.message);

  // Half the flags in a script would otherwise surface as a vague "needs a terminal".
  if (!nonInteractive && (opts.type || opts.message)) {
    assertInteractive(t('To commit without prompts, pass --type and -m (or a full "type: description" in -m).'));
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

  if (paths.length > 0 && opts.all) {
    throw new GitwizError(t('Pass either --all or a list of files, not both.'));
  }
  if (opts.all) runGit(['add', '-A']);
  // Named files: stage exactly those, from the folder they were named in, so
  // whatever else is lying around (the user's own edits) stays out of the commit.
  if (paths.length > 0) {
    runGit(['add', '--', ...paths]);
    if (captureGitPaths(['diff', '--name-only', '--cached', '--', ...paths]).length === 0) {
      log.success(t('Those files have no changes — nothing to commit.'));
      return;
    }
  }

  // Non-interactive path: everything comes from flags, no prompts.
  if (nonInteractive) {
    if (paths.length === 0 && getStagedFiles(atRoot).length === 0) {
      if (getStageableFiles(atRoot).length === 0) {
        log.success(t('Working tree clean — nothing to commit.'));
        return;
      }
      throw new GitwizError(t('Nothing is staged.'), {
        hint: t('Name the files to commit (gitwiz commit -m "…" -- <files>), stage them with git add, or pass --all.'),
      });
    }
    const breaking = opts.breaking !== undefined && opts.breaking !== false;
    const parts = {
      type: opts.type!,
      scope: opts.scope ? normalizeScope(opts.scope) || undefined : undefined,
      description: opts.message!,
      breaking,
      breakingDescription: typeof opts.breaking === 'string' ? opts.breaking : undefined,
      body: opts.body,
    };
    const header = buildCommitHeader(parts);
    if (header.length > 72) {
      log.warn(t('The commit subject is {n} characters (recommended ≤ 72).', { n: header.length }));
    }
    createCommit(buildCommitMessage(parts), paths);
    return;
  }

  // Interactive path.
  assertInteractive();

  let staged =
    paths.length > 0
      ? captureGitPaths(['diff', '--name-only', '--cached', '--', ...paths])
      : getStagedFiles(atRoot);
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

  const breaking =
    opts.breaking !== undefined
      ? opts.breaking !== false
      : await confirm({
          message: t('Does this break existing behavior (breaking change)?'),
          default: false,
        });
  let breakingDescription = typeof opts.breaking === 'string' ? opts.breaking : undefined;
  if (breaking && breakingDescription === undefined) {
    breakingDescription = await input({
      message: t('Describe what breaks and how to migrate:'),
    });
  }

  const parts = { type, scope, description, breaking, breakingDescription, body: opts.body };
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

  createCommit(message, paths);
}
