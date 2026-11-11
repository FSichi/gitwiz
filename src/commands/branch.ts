import pc from 'picocolors';
import { normalizeBranchName, validateBranchName } from '../core/branch-name.js';
import { baseBranchFor, loadConfig, type BranchType } from '../core/config.js';
import {
  captureGit,
  ensureGitRepo,
  getCurrentBranch,
  hasRemote,
  isAncestor,
  isCheckedOutElsewhere,
  isWorkingTreeClean,
  localBranchExists,
  remoteBranchExists,
  runGit,
  tryCaptureGit,
  tryRunGit,
} from '../core/git.js';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
import { assertInteractive, confirm, input, select } from '../ui/prompts.js';

export interface BranchOptions {
  type?: string;
  name?: string;
  push?: boolean;
}

/**
 * The freshest copy of the base to start a branch from without switching to it:
 * the local base when it already has everything origin has (it may carry
 * unpushed commits), otherwise origin's — a base checked out in another
 * worktree is often behind, because nobody pulls it there.
 */
function baseStartPoint(base: string, target: string): string {
  let remoteRef: string | null = null;
  if (hasRemote()) {
    if (!tryRunGit(['fetch', 'origin', base])) {
      log.warn(t('Could not fetch {base} from origin (offline?); using what you have locally.', { base }));
    }
    if (remoteBranchExists(base)) remoteRef = `origin/${base}`;
  }
  if (remoteRef === null) return base;
  if (!localBranchExists(base)) return remoteRef;
  if (isAncestor(remoteRef, base)) return base;
  if (!isAncestor(base, remoteRef)) {
    log.warn(
      t('Your local {base} and {remote} have diverged, so {branch} starts from {remote}.', {
        base,
        remote: remoteRef,
        branch: target,
      }),
    );
  }
  return remoteRef;
}

export async function branchCommand(opts: BranchOptions = {}): Promise<void> {
  ensureGitRepo();
  const { config, source } = loadConfig();
  const nonInteractive = Boolean(opts.type && opts.name);

  // A detached HEAD is fine (a worktree made with `git worktree add --detach`):
  // the new branch starts from the base without switching to it.
  const startBranch = getCurrentBranch();
  const detached = startBranch === '';
  const startCommit = detached ? captureGit(['rev-parse', 'HEAD']) : '';

  // Resolve the branch type and name (from flags or prompts).
  let branchType: BranchType;
  let nameRaw: string;
  if (nonInteractive) {
    const found = config.branchTypes.find((bt) => bt.type === opts.type);
    if (!found) {
      throw new GitwizError(t('Unknown branch type "{type}".', { type: opts.type! }), {
        hint: t('Valid types: {types}.', { types: config.branchTypes.map((bt) => bt.type).join(', ') }),
      });
    }
    branchType = found;
    nameRaw = opts.name!;
  } else {
    assertInteractive(
      opts.type || opts.name ? t('To create a branch without prompts, pass both --type and --name.') : undefined,
    );
    if (source === 'detected') {
      log.dim(
        t('Using auto-detected branches (main: {main}, work base: {develop}). Run "gitwiz init" to pin them.', {
          main: config.mainBranch,
          develop: config.developBranch,
        }),
      );
    }
    branchType = await select({
      message: t('What kind of work are you starting?'),
      choices: config.branchTypes.map((bt) => ({
        name: `${bt.prefix.padEnd(10)} ${pc.dim(t(bt.description))}`,
        value: bt,
        short: bt.type,
      })),
    });
    nameRaw = await input({
      message: `${t('Name for the new branch')} ${pc.dim(t('(will become {prefix}<name>)', { prefix: branchType.prefix }))}: `,
      validate: (value) => validateBranchName(normalizeBranchName(value)) ?? true,
    });
  }

  const base = baseBranchFor(branchType, config);
  const name = normalizeBranchName(nameRaw);
  const nameError = validateBranchName(name);
  if (nameError) throw new GitwizError(nameError);
  const target = `${branchType.prefix}${name}`;

  if (localBranchExists(target)) {
    throw new GitwizError(t('Branch "{branch}" already exists.', { branch: target }), {
      hint: t('Switch to it with: git switch {branch}', { branch: target }),
    });
  }
  if (tryCaptureGit(['check-ref-format', '--branch', target]) === null) {
    throw new GitwizError(t('"{branch}" is not a valid git branch name.', { branch: target }));
  }

  // git cannot switch to a base that another worktree has checked out, and a
  // detached HEAD has no branch to come back to: in both cases the new branch
  // starts from the base's ref, and this worktree never visits the base.
  const fromBaseRef = detached || isCheckedOutElsewhere(base);

  // Decide how to handle uncommitted changes before touching the base branch.
  let stashed = false;
  let updateBase = true;
  // Headless, uncommitted changes simply come along: an agent that edited first
  // and branches second wants its edits on the new branch, not an error. Nothing
  // is stashed — git only switches to the base when that overwrites nothing — so
  // nothing can be left behind in a stash or half-applied with conflicts.
  let carryHeadless = false;
  if (!isWorkingTreeClean() && nonInteractive) {
    carryHeadless = true;
  } else if (!isWorkingTreeClean()) {
    const action = await select({
      message: t('You have uncommitted changes. What should we do with them?'),
      choices: [
        {
          name: `${t('Stash them and bring them to the new branch')} ${pc.dim(t('(recommended)'))}`,
          value: 'stash' as const,
        },
        {
          name: `${t('Carry them along without updating {base}', { base })} ${pc.dim(t('(branch starts from your current state)'))}`,
          value: 'carry' as const,
        },
        { name: t('Cancel — let me commit or clean up first'), value: 'abort' as const },
      ],
    });
    if (action === 'abort') {
      log.dim(t('Cancelled. Tip: "gitwiz commit" can help you commit what you have.'));
      return;
    }
    if (action === 'carry') updateBase = false;
    if (action === 'stash') {
      runGit(['stash', 'push', '-u', '-m', 'gitwiz branch autostash']);
      stashed = true;
    }
  }

  const popStash = () => {
    if (stashed && !tryRunGit(['stash', 'pop'])) {
      log.warn(t('Your stashed changes could not be re-applied cleanly.'));
      log.dim(`  ${t('Resolve the conflicts, then run: git stash drop')}`);
    }
  };
  // Cancelling or failing midway must leave the user where they started, with
  // their changes back — not on the base branch with the work hidden in a stash.
  const restoreStart = () => {
    const now = getCurrentBranch();
    if (detached) {
      if (now !== '') tryRunGit(['switch', '--detach', startCommit]);
    } else if (now !== startBranch) {
      tryRunGit(['switch', startBranch]);
    }
    popStash();
  };

  try {
    let created = false;
    if (updateBase) {
      if (!localBranchExists(base) && !remoteBranchExists(base)) {
        throw new GitwizError(t('Base branch "{base}" does not exist locally or on origin.', { base }), {
          hint: t('Check your gitwiz config or run "gitwiz init".'),
        });
      }
    }
    if (updateBase && fromBaseRef) {
      const from = baseStartPoint(base, target);
      // --no-track: the new branch must not take the base as its upstream.
      const args = ['switch', '--no-track', '-c', target, from];
      if (carryHeadless) created = tryRunGit(args);
      else {
        runGit(args);
        created = true;
      }
      if (!created) {
        log.warn(t('Your changes clash with {base}, so {branch} starts from your current commit instead.', { base: from, branch: target }));
      }
    } else if (updateBase) {
      let switched = true;
      if (carryHeadless) switched = tryRunGit(['switch', base]);
      else runGit(['switch', base]);
      if (!switched) {
        log.warn(t('Your changes clash with {base}, so {branch} starts from your current commit instead.', { base, branch: target }));
      } else if (hasRemote() && remoteBranchExists(base)) {
        if (!tryRunGit(['pull', '--ff-only', 'origin', base])) {
          log.warn(t('Could not fast-forward {base} (offline, or the branch has diverged).', { base }));
          if (!nonInteractive) {
            const go = await confirm({
              message: t('Create {branch} from your local {base} anyway?', { branch: target, base }),
              default: true,
            });
            if (!go) {
              restoreStart();
              log.dim(t('Cancelled.'));
              return;
            }
          }
        }
      }
    }
    if (!created) runGit(['switch', '-c', target]);
  } catch (err) {
    restoreStart();
    throw err;
  }

  popStash();
  if (carryHeadless) log.dim(`  ${t('Your uncommitted changes came along to {branch}.', { branch: target })}`);

  let doPush = false;
  if (hasRemote()) {
    doPush = nonInteractive
      ? Boolean(opts.push)
      : await confirm({
          message: t('Push {branch} to origin and set it as upstream?', { branch: target }),
          default: true,
        });
  }
  if (doPush) runGit(['push', '-u', 'origin', target]);

  log.blank();
  log.success(t('You are now on {branch}. Happy hacking!', { branch: pc.bold(target) }));
  log.dim(`  ${t('Next: make your changes, then run "gitwiz commit".')}`);
}
