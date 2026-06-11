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
import { log } from '../ui/output.js';
import { confirm, select } from '../ui/prompts.js';

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
    `The ${operation} stopped because of conflicts. This is normal — git needs your help:`,
    '  1. Open the conflicted files (run "gitwiz status" to list them) and fix the marked sections.',
    '  2. Stage the fixed files:  git add <file>',
    `  3. Continue with:          git ${operation} --continue`,
    `  Or undo everything with:   git ${operation} --abort`,
  ];
  if (stashed) {
    lines.push(`  Note: your local changes are stashed — recover them later with: git stash pop`);
  }
  return new GitwizError(lines.join('\n'));
}

export async function syncCommand(): Promise<void> {
  ensureGitRepo();
  const { config } = loadConfig();

  const current = getCurrentBranch();
  if (current === '') {
    throw new GitwizError('You are not on any branch (detached HEAD).', {
      hint: `Switch to a branch first: git switch ${config.developBranch}`,
    });
  }

  const remote = hasRemote();
  if (remote) {
    runGit(['fetch', 'origin']);
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
        `Your branch ${pc.bold(current)} is ${pc.green(`${counts.ahead} ahead`)} and ${
          counts.behind > 0 ? pc.yellow(`${counts.behind} behind`) : pc.green('0 behind')
        } ${pc.dim(baseRef)}.`,
      );
      log.blank();
      if (counts.behind === 0) {
        log.success(`Already up to date with ${baseRef}.`);
      } else {
        choices.push(
          {
            name: `Merge ${baseRef} into my branch ${pc.dim('(safe, recommended)')}`,
            value: 'merge',
            short: 'merge',
          },
          {
            name: `Rebase my branch onto ${baseRef} ${pc.dim('(linear history — rewrites your commits)')}`,
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
          name: `Just update my local copy of ${base} ${pc.dim(`(${baseCounts.behind} behind origin)`)}`,
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
        name: `Pull my own branch from ${upstream} ${pc.dim(`(${ownCounts.behind} behind)`)}`,
        value: 'pull-own',
        short: 'pull',
      });
    }
  }

  if (choices.length === 0) {
    log.success('Everything is already in sync. Nothing to do.');
    return;
  }
  choices.push({ name: 'Do nothing', value: 'nothing', short: 'nothing' });

  const strategy = await select({ message: 'How do you want to sync?', choices });
  if (strategy === 'nothing') {
    log.dim('Nothing changed.');
    return;
  }

  // Stash local changes when the chosen action rewrites the working tree.
  let stashed = false;
  if (strategy !== 'update-base' && !isWorkingTreeClean()) {
    const stash = await confirm({
      message: 'You have uncommitted changes. Stash them safely and re-apply after syncing?',
      default: true,
    });
    if (!stash) {
      log.dim('Cancelled — commit or stash your changes first.');
      return;
    }
    runGit(['stash', 'push', '-u', '-m', STASH_MESSAGE]);
    stashed = true;
  }

  const popStash = () => {
    if (!stashed) return;
    if (!tryRunGit(['stash', 'pop'])) {
      log.warn('Your stashed changes could not be re-applied cleanly.');
      log.dim('  Resolve the conflicts, then run: git stash drop');
    }
  };

  switch (strategy) {
    case 'merge': {
      if (!tryRunGit(['merge', '--no-edit', baseRef!])) {
        throw conflictError('merge', stashed);
      }
      popStash();
      log.success(`Merged ${baseRef} into ${current}.`);
      break;
    }
    case 'rebase': {
      if (upstream) {
        log.warn('This branch is already pushed — rebasing rewrites its history.');
        log.dim('  You will need "git push --force-with-lease" afterwards, and teammates on this branch will be disrupted.');
        const go = await confirm({ message: 'Rebase anyway?', default: false });
        if (!go) {
          popStash();
          log.dim('Cancelled.');
          return;
        }
      }
      if (!tryRunGit(['rebase', baseRef!])) {
        throw conflictError('rebase', stashed);
      }
      popStash();
      log.success(`Rebased ${current} onto ${baseRef}.`);
      if (upstream) log.dim('  Push with: git push --force-with-lease');
      break;
    }
    case 'update-base': {
      runGit(['switch', base!]);
      if (!tryRunGit(['pull', '--ff-only', 'origin', base!])) {
        runGit(['switch', current]);
        throw new GitwizError(`Could not fast-forward ${base} — it has diverged from origin.`);
      }
      runGit(['switch', current]);
      log.success(`Local ${base} is now up to date.`);
      break;
    }
    case 'pull-own': {
      if (!tryRunGit(['pull', '--ff-only'])) {
        popStash();
        throw new GitwizError('Could not fast-forward — your branch and its remote have diverged.', {
          hint: 'Run "gitwiz sync" again and choose merge or rebase against the base, or ask a teammate for help.',
        });
      }
      popStash();
      log.success(`Pulled latest ${current}.`);
      break;
    }
  }
}
