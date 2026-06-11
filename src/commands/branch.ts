import pc from 'picocolors';
import { normalizeBranchName, validateBranchName } from '../core/branch-name.js';
import { baseBranchFor, loadConfig } from '../core/config.js';
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
import { WizgitError } from '../ui/errors.js';
import { log } from '../ui/output.js';
import { confirm, input, select } from '../ui/prompts.js';

export async function branchCommand(): Promise<void> {
  ensureGitRepo();
  const { config, source } = loadConfig();
  if (source === 'detected') {
    log.dim(
      `Using auto-detected branches (main: ${config.mainBranch}, work base: ${config.developBranch}). Run "wizgit init" to pin them.`,
    );
  }

  if (getCurrentBranch() === '') {
    throw new WizgitError('You are not on any branch (detached HEAD).', {
      hint: `Switch to a branch first: git switch ${config.developBranch}`,
    });
  }

  const branchType = await select({
    message: 'What kind of work are you starting?',
    choices: config.branchTypes.map((t) => ({
      name: `${t.prefix.padEnd(10)} ${pc.dim(t.description)}`,
      value: t,
      short: t.type,
    })),
  });
  const base = baseBranchFor(branchType, config);

  const nameRaw = await input({
    message: `Name for the new branch ${pc.dim(`(will become ${branchType.prefix}<name>)`)}: `,
    validate: (value) => validateBranchName(normalizeBranchName(value)) ?? true,
  });
  const name = normalizeBranchName(nameRaw);
  const target = `${branchType.prefix}${name}`;

  if (localBranchExists(target)) {
    throw new WizgitError(`Branch "${target}" already exists.`, {
      hint: `Switch to it with: git switch ${target}`,
    });
  }
  if (tryCaptureGit(['check-ref-format', '--branch', target]) === null) {
    throw new WizgitError(`"${target}" is not a valid git branch name.`);
  }

  // Decide how to handle uncommitted changes before touching the base branch.
  let stashed = false;
  let updateBase = true;
  if (!isWorkingTreeClean()) {
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
      log.dim('Cancelled. Tip: "wizgit commit" can help you commit what you have.');
      return;
    }
    if (action === 'carry') updateBase = false;
    if (action === 'stash') {
      runGit(['stash', 'push', '-u', '-m', 'wizgit branch autostash']);
      stashed = true;
    }
  }

  if (updateBase) {
    if (!localBranchExists(base) && !remoteBranchExists(base)) {
      throw new WizgitError(`Base branch "${base}" does not exist locally or on origin.`, {
        hint: 'Check your wizgit config or run "wizgit init".',
      });
    }
    runGit(['switch', base]);
    if (hasRemote() && remoteBranchExists(base)) {
      if (!tryRunGit(['pull', '--ff-only', 'origin', base])) {
        log.warn(`Could not fast-forward ${base} (offline, or the branch has diverged).`);
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
    runGit(['switch', '-c', target]);
  } else {
    runGit(['switch', '-c', target]);
  }

  if (stashed) {
    if (!tryRunGit(['stash', 'pop'])) {
      log.warn('Your stashed changes could not be re-applied cleanly.');
      log.dim('  Resolve the conflicts, then run: git stash drop');
    }
  }

  if (hasRemote()) {
    const push = await confirm({
      message: `Push ${target} to origin and set it as upstream?`,
      default: true,
    });
    if (push) runGit(['push', '-u', 'origin', target]);
  }

  log.blank();
  log.success(`You are now on ${pc.bold(target)}. Happy hacking!`);
  log.dim('  Next: make your changes, then run "wizgit commit".');
}
