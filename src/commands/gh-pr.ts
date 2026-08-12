import pc from 'picocolors';
import { loadConfig } from '../core/config.js';
import { captureGh, captureGhJson, ensureGh, ensureRepoSlug } from '../core/gh.js';
import {
  captureGit,
  ensureGitRepo,
  getCurrentBranch,
  getUpstream,
  hasRemote,
  isWorkingTreeClean,
  runGit,
  tryCaptureGit,
} from '../core/git.js';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { box, log } from '../ui/output.js';
import { assertInteractive, confirm, input, select } from '../ui/prompts.js';

export interface GhPrOptions {
  base?: string;
  title?: string;
  body?: string;
  draft?: boolean;
}

interface ExistingPr {
  number: number;
  url: string;
  title: string;
  isDraft: boolean;
}

/**
 * Commits on this branch that the base doesn't have, oldest first.
 * They double as the PR body's first draft — the same conventional commits that
 * already feed the changelog.
 */
export function collectCommits(base: string, head: string): string[] {
  const out = tryCaptureGit(['log', '--reverse', '--format=%s', `origin/${base}..${head}`]);
  if (!out) return [];
  return out.split('\n').filter((line) => line.trim() !== '');
}

/** Build a PR body from commit subjects. Kept pure so it can be unit-tested. */
export function buildPrBody(commits: string[]): string {
  if (commits.length === 0) return '';
  const bullets = commits.map((c) => `- ${c}`).join('\n');
  return `## ${t('Changes')}\n\n${bullets}\n`;
}

export async function ghPrCommand(opts: GhPrOptions = {}): Promise<void> {
  ensureGitRepo();
  ensureGh();
  const { config } = loadConfig();
  const slug = ensureRepoSlug();
  const branch = getCurrentBranch();
  const nonInteractive = Boolean(opts.title);

  if (branch === '') {
    throw new GitwizError(t('You are not on any branch (detached HEAD).'), {
      hint: t('Switch to the branch you want to open a pull request from.'),
    });
  }
  if (branch === config.mainBranch || branch === config.developBranch) {
    throw new GitwizError(t('You are on "{branch}", which is a base branch.', { branch }), {
      hint: t('Pull requests are opened from a work branch. Create one with "gitwiz branch".'),
    });
  }
  if (!hasRemote()) {
    throw new GitwizError(t('This repository has no remote named "origin".'));
  }

  // A branch can only have one open PR. Finding it early turns a confusing gh
  // error into a useful answer: here is your PR, push your fixes to update it.
  const existing = captureGhJson<ExistingPr[]>([
    'pr', 'list', '--repo', slug, '--head', branch, '--state', 'open',
    '--json', 'number,url,title,isDraft',
  ]);
  if (existing.length > 0) {
    const pr = existing[0]!;
    log.info(t('This branch already has an open pull request:'));
    box([`#${pr.number} ${pr.title}`, pc.dim(pr.url)]);
    log.dim(t('Push new commits to this branch and the pull request updates itself.'));
    return;
  }

  if (!isWorkingTreeClean()) {
    log.warn(t('You have uncommitted changes — they will not be part of this pull request.'));
    if (!nonInteractive) {
      assertInteractive();
      const proceed = await confirm({ message: t('Continue anyway?'), default: false });
      if (!proceed) {
        log.dim(t('Nothing was created. Commit your changes with "gitwiz commit" first.'));
        return;
      }
    }
  }

  // Resolve the base branch.
  let base: string;
  if (opts.base) {
    base = opts.base;
  } else if (nonInteractive) {
    base = config.developBranch;
  } else {
    assertInteractive();
    base = await select({
      message: t('Which branch should this pull request merge into?'),
      choices: [
        {
          name: config.developBranch,
          value: config.developBranch,
          hint: t('the usual target for feature work'),
        },
        { name: config.mainBranch, value: config.mainBranch, hint: t('production') },
      ],
    });
  }
  if (base === branch) {
    throw new GitwizError(t('A pull request cannot merge "{branch}" into itself.', { branch }));
  }

  // Push the branch if the remote does not have it yet — gh cannot open a PR
  // for a branch GitHub has never seen.
  if (getUpstream() === null) {
    log.step(t('Pushing "{branch}" to origin...', { branch }));
    runGit(['push', '-u', 'origin', branch]);
  } else {
    const ahead = tryCaptureGit(['rev-list', '--count', '@{u}..HEAD']);
    if (ahead && ahead !== '0') {
      log.step(t('Pushing {count} new commit(s)...', { count: ahead }));
      runGit(['push']);
    }
  }

  const commits = collectCommits(base, branch);

  // Title: the flag, else the single commit's subject (the common case for a
  // small branch), else the branch name humanized as a starting point.
  const suggestedTitle =
    commits.length === 1
      ? commits[0]!
      : captureGit(['log', '-1', '--format=%s']);

  let title: string;
  let body: string;
  let draft: boolean;
  if (nonInteractive) {
    title = opts.title!;
    body = opts.body ?? buildPrBody(commits);
    draft = Boolean(opts.draft);
  } else {
    assertInteractive();
    if (commits.length === 0) {
      log.warn(t('"{branch}" has no commits that {base} does not already have.', { branch, base }));
    }
    title = await input({
      message: t('Pull request title'),
      default: suggestedTitle,
      validate: (value) => (value.trim() === '' ? t('The title cannot be empty.') : true),
    });
    const useGenerated =
      commits.length > 0 &&
      (await confirm({
        message: t('Use the {count} commit(s) on this branch as the description?', {
          count: String(commits.length),
        }),
        default: true,
      }));
    body = useGenerated
      ? buildPrBody(commits)
      : await input({ message: t('Description (optional)'), default: '' });
    draft = opts.draft ?? (await confirm({ message: t('Open as a draft?'), default: false }));
  }

  // Show exactly what is about to be published before publishing it.
  if (!nonInteractive) {
    box(
      [
        `${pc.bold(title)}${draft ? pc.dim(` ${t('(draft)')}`) : ''}`,
        pc.dim(`${branch} → ${base}  ·  ${slug}`),
        ...(body ? ['', body.trim()] : []),
      ],
      t('Pull request'),
    );
    const go = await confirm({ message: t('Create this pull request?'), default: true });
    if (!go) {
      log.dim(t('Cancelled — nothing was created.'));
      return;
    }
  }

  const args = ['pr', 'create', '--repo', slug, '--base', base, '--head', branch, '--title', title];
  if (body) args.push('--body', body);
  else args.push('--body', '');
  if (draft) args.push('--draft');

  const url = captureGh(args, { echo: true });
  log.success(t('Pull request created.'));
  log.info(pc.cyan(url));
}
