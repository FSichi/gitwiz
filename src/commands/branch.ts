import pc from 'picocolors';
import { normalizeBranchName, validateBranchName } from '../core/branch-name.js';
import { baseBranchFor, loadConfig, type BranchType } from '../core/config.js';
import {
  ensureGitRepo,
  getCurrentBranch,
  hasRemote,
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

export async function branchCommand(opts: BranchOptions = {}): Promise<void> {
  ensureGitRepo();
  const { config, source } = loadConfig();
  const nonInteractive = Boolean(opts.type && opts.name);

  if (getCurrentBranch() === '') {
    throw new GitwizError(t('You are not on any branch (detached HEAD).'), {
      hint: t('Switch to a branch first: git switch {branch}', { branch: config.developBranch }),
    });
  }

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
    assertInteractive();
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

  // Decide how to handle uncommitted changes before touching the base branch.
  let stashed = false;
  let updateBase = true;
  if (!isWorkingTreeClean()) {
    if (nonInteractive) {
      throw new GitwizError(t('You have uncommitted changes.'), {
        hint: t('Commit or stash them first — create the branch before you start editing.'),
      });
    }
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

  if (updateBase) {
    if (!localBranchExists(base) && !remoteBranchExists(base)) {
      throw new GitwizError(t('Base branch "{base}" does not exist locally or on origin.', { base }), {
        hint: t('Check your gitwiz config or run "gitwiz init".'),
      });
    }
    runGit(['switch', base]);
    if (hasRemote() && remoteBranchExists(base)) {
      if (!tryRunGit(['pull', '--ff-only', 'origin', base])) {
        log.warn(t('Could not fast-forward {base} (offline, or the branch has diverged).', { base }));
        if (!nonInteractive) {
          const go = await confirm({
            message: t('Create {branch} from your local {base} anyway?', { branch: target, base }),
            default: true,
          });
          if (!go) {
            if (stashed) runGit(['stash', 'pop']);
            log.dim(t('Cancelled.'));
            return;
          }
        }
      }
    }
  }
  runGit(['switch', '-c', target]);

  if (stashed) {
    if (!tryRunGit(['stash', 'pop'])) {
      log.warn(t('Your stashed changes could not be re-applied cleanly.'));
      log.dim(`  ${t('Resolve the conflicts, then run: git stash drop')}`);
    }
  }

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
