import pc from 'picocolors';
import { baseBranchFor, loadConfig, type GitwizConfig } from '../core/config.js';
import {
  ensureGitRepo,
  getAheadBehind,
  getCurrentBranch,
  getUpstream,
  hasRemote,
  isWorkingTreeClean,
  localBranchExists,
  remoteBranchExists,
  runGit,
  tryRunGit,
} from '../core/git.js';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { log, spinSync } from '../ui/output.js';
import { assertInteractive, confirm, select } from '../ui/prompts.js';

const STASH_MESSAGE = 'gitwiz sync autostash';

function findBaseBranch(branch: string, config: GitwizConfig): string | null {
  for (const type of config.branchTypes) {
    if (branch.startsWith(type.prefix)) return baseBranchFor(type, config);
  }
  if (branch === config.mainBranch || branch === config.developBranch) return null;
  // Unknown naming — assume it branched off the work base.
  return config.developBranch;
}

function conflictError(operation: 'merge' | 'rebase', stashed: boolean): GitwizError {
  const lines = [
    t('The {operation} stopped because of conflicts. This is normal — git needs your help:', { operation }),
    `  ${t('1. Open the conflicted files (run "gitwiz status" to list them) and fix the marked sections.')}`,
    `  ${t('2. Stage the fixed files:  git add <file>')}`,
    `  ${t('3. Continue with:          git {operation} --continue', { operation })}`,
    `  ${t('Or undo everything with:   git {operation} --abort', { operation })}`,
  ];
  if (stashed) {
    lines.push(`  ${t('Note: your local changes are stashed — recover them later with: git stash pop')}`);
  }
  return new GitwizError(lines.join('\n'));
}

export async function syncCommand(): Promise<void> {
  ensureGitRepo();
  assertInteractive();
  const { config } = loadConfig();

  const current = getCurrentBranch();
  if (current === '') {
    throw new GitwizError(t('You are not on any branch (detached HEAD).'), {
      hint: t('Switch to a branch first: git switch {branch}', { branch: config.developBranch }),
    });
  }

  const remote = hasRemote();
  if (remote) {
    spinSync(t('Fetching from origin...'), () => runGit(['fetch', 'origin']));
  }

  const base = findBaseBranch(current, config);
  const upstream = getUpstream();

  // Resolve which ref represents the freshest copy of the base branch.
  let baseRef: string | null = null;
  if (base && base !== current) {
    if (remote && remoteBranchExists(base)) baseRef = `origin/${base}`;
    else if (localBranchExists(base)) baseRef = base;
  }

  type Strategy = 'merge' | 'rebase' | 'update-base' | 'pull-own' | 'nothing';
  const choices: { name: string; value: Strategy; short?: string }[] = [];

  if (baseRef) {
    const counts = getAheadBehind(baseRef, 'HEAD');
    if (counts) {
      log.blank();
      log.info(
        t('Your branch {branch} is {ahead} and {behind} {base}.', {
          branch: pc.bold(current),
          ahead: pc.green(t('{n} ahead', { n: counts.ahead })),
          behind:
            counts.behind > 0
              ? pc.yellow(t('{n} behind', { n: counts.behind }))
              : pc.green(t('0 behind')),
          base: pc.dim(baseRef),
        }),
      );
      log.blank();
      if (counts.behind === 0) {
        log.success(t('Already up to date with {base}.', { base: baseRef }));
      } else {
        choices.push(
          {
            name: `${t('Merge {base} into my branch', { base: baseRef })} ${pc.dim(t('(safe, recommended)'))}`,
            value: 'merge',
            short: 'merge',
          },
          {
            name: `${t('Rebase my branch onto {base}', { base: baseRef })} ${pc.dim(t('(linear history — rewrites your commits)'))}`,
            value: 'rebase',
            short: 'rebase',
          },
        );
      }
    }
    if (base && localBranchExists(base) && remote && remoteBranchExists(base)) {
      const baseCounts = getAheadBehind(`origin/${base}`, base);
      if (baseCounts && baseCounts.behind > 0) {
        choices.push({
          name: `${t('Just update my local copy of {base}', { base })} ${pc.dim(t('({n} behind origin)', { n: baseCounts.behind }))}`,
          value: 'update-base',
          short: 'update base',
        });
      }
    }
  }

  if (upstream) {
    const ownCounts = getAheadBehind(upstream, 'HEAD');
    if (ownCounts && ownCounts.behind > 0) {
      choices.push({
        name: `${t('Pull my own branch from {upstream}', { upstream })} ${pc.dim(t('({n} behind)', { n: ownCounts.behind }))}`,
        value: 'pull-own',
        short: 'pull',
      });
    }
  }

  if (choices.length === 0) {
    log.success(t('Everything is already in sync. Nothing to do.'));
    return;
  }
  choices.push({ name: t('Do nothing'), value: 'nothing', short: t('nothing') });

  const strategy = await select({ message: t('How do you want to sync?'), choices });
  if (strategy === 'nothing') {
    log.dim(t('Nothing changed.'));
    return;
  }

  // Stash local changes when the chosen action rewrites the working tree.
  let stashed = false;
  if (strategy !== 'update-base' && !isWorkingTreeClean()) {
    const stash = await confirm({
      message: t('You have uncommitted changes. Stash them safely and re-apply after syncing?'),
      default: true,
    });
    if (!stash) {
      log.dim(t('Cancelled — commit or stash your changes first.'));
      return;
    }
    runGit(['stash', 'push', '-u', '-m', STASH_MESSAGE]);
    stashed = true;
  }

  const popStash = () => {
    if (!stashed) return;
    if (!tryRunGit(['stash', 'pop'])) {
      log.warn(t('Your stashed changes could not be re-applied cleanly.'));
      log.dim(`  ${t('Resolve the conflicts, then run: git stash drop')}`);
    }
  };

  switch (strategy) {
    case 'merge': {
      if (!tryRunGit(['merge', '--no-edit', baseRef!])) {
        throw conflictError('merge', stashed);
      }
      popStash();
      log.success(t('Merged {base} into {branch}.', { base: baseRef!, branch: current }));
      break;
    }
    case 'rebase': {
      if (upstream) {
        log.warn(t('This branch is already pushed — rebasing rewrites its history.'));
        log.dim(`  ${t('You will need "git push --force-with-lease" afterwards, and teammates on this branch will be disrupted.')}`);
        const go = await confirm({ message: t('Rebase anyway?'), default: false });
        if (!go) {
          popStash();
          log.dim(t('Cancelled.'));
          return;
        }
      }
      if (!tryRunGit(['rebase', baseRef!])) {
        throw conflictError('rebase', stashed);
      }
      popStash();
      log.success(t('Rebased {branch} onto {base}.', { branch: current, base: baseRef! }));
      if (upstream) log.dim(`  ${t('Push with: git push --force-with-lease')}`);
      break;
    }
    case 'update-base': {
      runGit(['switch', base!]);
      if (!tryRunGit(['pull', '--ff-only', 'origin', base!])) {
        runGit(['switch', current]);
        throw new GitwizError(t('Could not fast-forward {base} — it has diverged from origin.', { base: base! }));
      }
      runGit(['switch', current]);
      log.success(t('Local {base} is now up to date.', { base: base! }));
      break;
    }
    case 'pull-own': {
      if (!tryRunGit(['pull', '--ff-only'])) {
        popStash();
        throw new GitwizError(t('Could not fast-forward — your branch and its remote have diverged.'), {
          hint: t('Run "gitwiz sync" again and choose merge or rebase against the base, or ask a teammate for help.'),
        });
      }
      popStash();
      log.success(t('Pulled latest {branch}.', { branch: current }));
      break;
    }
  }
}
