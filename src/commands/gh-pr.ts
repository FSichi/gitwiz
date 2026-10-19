import pc from 'picocolors';
import { baseBranchFor, loadConfig } from '../core/config.js';
import { captureGh, captureGhJson, ensureRepoSlug } from '../core/gh.js';
import {
  ensureGitRepo,
  getCurrentBranch,
  hasRemote,
  isWorkingTreeClean,
  localBranchExists,
  remoteBranchExists,
  runGit,
  tryCaptureGit,
} from '../core/git.js';
import { readBodyFile } from '../core/body-file.js';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { box, emitJson, isJsonMode, log } from '../ui/output.js';
import { assertInteractive, confirm, input, select } from '../ui/prompts.js';

export interface GhPrOptions {
  base?: string;
  title?: string;
  body?: string;
  /** Read the body from this file ("-" = stdin). */
  bodyFile?: string;
  /** Open the PR from this branch instead of the current one. */
  head?: string;
  draft?: boolean;
  json?: boolean;
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

export async function ghPrCommand(flags: GhPrOptions = {}): Promise<void> {
  ensureGitRepo();
  const opts = flags.bodyFile ? { ...flags, body: readBodyFile(flags.bodyFile) } : flags;
  const { config } = loadConfig();
  const slug = ensureRepoSlug();
  const current = getCurrentBranch();
  // --head opens the PR from another branch without checking it out — the
  // develop → main and release → main PRs agents used to open with raw gh.
  const branch = opts.head ?? current;
  const nonInteractive = Boolean(opts.title);

  if (branch === '') {
    throw new GitwizError(t('You are not on any branch (detached HEAD).'), {
      hint: t('Switch to the branch you want to open a pull request from.'),
    });
  }
  if ((branch === config.mainBranch || branch === config.developBranch) && !opts.base) {
    throw new GitwizError(t('"{branch}" is a base branch.', { branch }), {
      hint: t('Work goes through a work branch ("gitwiz branch"). To open a PR from it on purpose, pass --base (e.g. --head {develop} --base {main}).', {
        develop: config.developBranch,
        main: config.mainBranch,
      }),
    });
  }
  if (!hasRemote()) {
    throw new GitwizError(t('This repository has no remote named "origin".'));
  }
  if (!localBranchExists(branch) && !remoteBranchExists(branch)) {
    throw new GitwizError(t('Branch "{branch}" does not exist locally or on origin.', { branch }));
  }

  /** Send local commits origin lacks (publishing the branch if it is new); returns how many. */
  const pushBranch = (): number => {
    if (!localBranchExists(branch)) return 0;
    if (!remoteBranchExists(branch)) {
      log.step(t('Pushing "{branch}" to origin...', { branch }));
      runGit(['push', '-u', 'origin', branch]);
      return 0;
    }
    const ahead = Number(tryCaptureGit(['rev-list', '--count', `origin/${branch}..${branch}`]) ?? '0');
    if (ahead > 0) {
      log.step(t('Pushing {count} new commit(s)...', { count: ahead }));
      runGit(['push', 'origin', branch]);
    }
    return ahead;
  };

  // A branch can only have one open PR. Finding it early turns a confusing gh
  // error into a useful answer: here is your PR, push your fixes to update it.
  const existing = captureGhJson<ExistingPr[]>([
    'pr', 'list', '--repo', slug, '--head', branch, '--state', 'open',
    '--json', 'number,url,title,isDraft',
  ]);
  if (existing.length > 0) {
    const pr = existing[0]!;
    // Re-running after more commits is how an agent "updates" its PR: send them.
    const pushed = pushBranch();
    if (isJsonMode()) {
      emitJson({ created: false, number: pr.number, url: pr.url, title: pr.title, pushedCommits: pushed });
      return;
    }
    log.info(t('This branch already has an open pull request:'));
    box([`#${pr.number} ${pr.title}`, pc.dim(pr.url)]);
    if (pushed > 0) log.success(t('Pushed {count} new commit(s) — the pull request is up to date.', { count: pushed }));
    else log.dim(t('Push new commits to this branch and the pull request updates itself.'));
    return;
  }

  if (branch === current && !isWorkingTreeClean()) {
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

  // Resolve the base branch. The branch's own type knows where it came from:
  // a hotfix/ goes back to production, a feature/ to the work base.
  const branchType = config.branchTypes.find((bt) => branch.startsWith(bt.prefix));
  const typeBase = branchType ? baseBranchFor(branchType, config) : config.developBranch;
  let base: string;
  if (opts.base) {
    base = opts.base;
  } else if (nonInteractive) {
    base = typeBase;
  } else {
    assertInteractive();
    const candidates = [
      { name: config.developBranch, value: config.developBranch, hint: t('the usual target for feature work') },
      { name: config.mainBranch, value: config.mainBranch, hint: t('production') },
    ]
      // Trunk-based repos have one base: offer it once.
      .filter((c, i, all) => all.findIndex((o) => o.value === c.value) === i)
      .sort((a, b) => Number(b.value === typeBase) - Number(a.value === typeBase));
    base =
      candidates.length === 1
        ? candidates[0]!.value
        : await select({ message: t('Which branch should this pull request merge into?'), choices: candidates });
  }
  if (base === branch) {
    throw new GitwizError(t('A pull request cannot merge "{branch}" into itself.', { branch }));
  }

  // gh cannot open a PR for commits GitHub has never seen.
  pushBranch();

  const commits = collectCommits(base, branch);

  // Title: the flag, else the single commit's subject (the common case for a
  // small branch), else the branch's latest subject as a starting point.
  const suggestedTitle =
    commits.length === 1
      ? commits[0]!
      : (tryCaptureGit(['log', '-1', '--format=%s', localBranchExists(branch) ? branch : `origin/${branch}`]) ?? '');

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
  if (isJsonMode()) {
    const number = Number(url.match(/\/pull\/(\d+)/)?.[1] ?? NaN);
    emitJson({ created: true, number: Number.isNaN(number) ? null : number, url, title, base, head: branch, draft });
    return;
  }
  log.success(t('Pull request created.'));
  log.info(pc.cyan(url));
}
