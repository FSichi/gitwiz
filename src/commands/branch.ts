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
    throw new GitwizError('You are not on any branch (detached HEAD).', {
      hint: `Switch to a branch first: git switch ${config.developBranch}`,
    });
  }

  // Resolve the branch type and name (from flags or prompts).
  let branchType: BranchType;
  let nameRaw: string;
  if (nonInteractive) {
    const found = config.branchTypes.find((t) => t.type === opts.type);
    if (!found) {
      throw new GitwizError(`Unknown branch type "${opts.type}".`, {
        hint: `Valid types: ${config.branchTypes.map((t) => t.type).join(', ')}.`,
      });
    }
    branchType = found;
    nameRaw = opts.name!;
  } else {
    assertInteractive();
    if (source === 'detected') {
      log.dim(
        `Using auto-detected branches (main: ${config.mainBranch}, work base: ${config.developBranch}). Run "gitwiz init" to pin them.`,
      );
    }
    branchType = await select({
      message: 'What kind of work are you starting?',
      choices: config.branchTypes.map((t) => ({
        name: `${t.prefix.padEnd(10)} ${pc.dim(t.description)}`,
        value: t,
        short: t.type,
      })),
    });
    nameRaw = await input({
      message: `Name for the new branch ${pc.dim(`(will become ${branchType.prefix}<name>)`)}: `,
      validate: (value) => validateBranchName(normalizeBranchName(value)) ?? true,
    });
  }

  const base = baseBranchFor(branchType, config);
  const name = normalizeBranchName(nameRaw);
  const nameError = validateBranchName(name);
  if (nameError) throw new GitwizError(nameError);
  const target = `${branchType.prefix}${name}`;

  if (localBranchExists(target)) {
    throw new GitwizError(`Branch "${target}" already exists.`, {
      hint: `Switch to it with: git switch ${target}`,
    });
  }
  if (tryCaptureGit(['check-ref-format', '--branch', target]) === null) {
    throw new GitwizError(`"${target}" is not a valid git branch name.`);
  }

  // Decide how to handle uncommitted changes before touching the base branch.
  let stashed = false;
  let updateBase = true;
  if (!isWorkingTreeClean()) {
    if (nonInteractive) {
      throw new GitwizError('You have uncommitted changes.', {
        hint: 'Commit or stash them first — create the branch before you start editing.',
      });
    }
    const action = await select({
      message: 'You have uncommitted changes. What should we do with them?',
      choices: [
        {
          name: `Stash them and bring them to the new branch ${pc.dim('(recommended)')}`,
          value: 'stash' as const,
        },
        {
          name: `Carry them along without updating ${base} ${pc.dim('(branch starts from your current state)')}`,
          value: 'carry' as const,
        },
        { name: 'Cancel — let me commit or clean up first', value: 'abort' as const },
      ],
    });
    if (action === 'abort') {
      log.dim('Cancelled. Tip: "gitwiz commit" can help you commit what you have.');
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
      throw new GitwizError(`Base branch "${base}" does not exist locally or on origin.`, {
        hint: 'Check your gitwiz config or run "gitwiz init".',
      });
    }
    runGit(['switch', base]);
    if (hasRemote() && remoteBranchExists(base)) {
      if (!tryRunGit(['pull', '--ff-only', 'origin', base])) {
        log.warn(`Could not fast-forward ${base} (offline, or the branch has diverged).`);
        if (!nonInteractive) {
          const go = await confirm({
            message: `Create ${target} from your local ${base} anyway?`,
            default: true,
          });
          if (!go) {
            if (stashed) runGit(['stash', 'pop']);
            log.dim('Cancelled.');
            return;
          }
        }
      }
    }
  }
  runGit(['switch', '-c', target]);

  if (stashed) {
    if (!tryRunGit(['stash', 'pop'])) {
      log.warn('Your stashed changes could not be re-applied cleanly.');
      log.dim('  Resolve the conflicts, then run: git stash drop');
    }
  }

  let doPush = false;
  if (hasRemote()) {
    doPush = nonInteractive
      ? Boolean(opts.push)
      : await confirm({ message: `Push ${target} to origin and set it as upstream?`, default: true });
  }
  if (doPush) runGit(['push', '-u', 'origin', target]);

  log.blank();
  log.success(`You are now on ${pc.bold(target)}. Happy hacking!`);
  log.dim('  Next: make your changes, then run "gitwiz commit".');
}
