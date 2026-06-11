import pc from 'picocolors';
import { loadConfig, type GitwizConfig } from '../core/config.js';
import {
  captureGit,
  ensureGitRepo,
  getCurrentBranch,
  hasRemote,
  isWorkingTreeClean,
  remoteBranchExists,
  runGit,
  tagExists,
  tryCaptureGit,
  tryRunGit,
  type GitOptions,
} from '../core/git.js';
import { GitwizError } from '../ui/errors.js';
import { log } from '../ui/output.js';
import { confirm, select } from '../ui/prompts.js';

function mergeConflictError(target: string): GitwizError {
  return new GitwizError(
    [
      `The merge into ${target} stopped because of conflicts:`,
      '  1. Fix the conflicted files ("gitwiz status" lists them).',
      '  2. Stage them:    git add <file>',
      '  3. Continue with: git merge --continue',
      '  Or undo with:     git merge --abort  (then run "gitwiz release finish" again)',
    ].join('\n'),
  );
}

/** Non-interactive release finish — merges, tags, pushes, deletes the release branch. */
export function performReleaseFinish(
  config: GitwizConfig,
  version: string,
  opts: GitOptions = {},
): { tag: string } {
  const branch = `release/${version}`;
  const tag = `${config.tagPrefix}${version}`;
  const remote = hasRemote(opts);

  // Pre-flight: never merge first and fail at the tag.
  if (tagExists(tag, opts)) {
    throw new GitwizError(`Tag "${tag}" already exists.`, {
      hint: 'This version seems to be released already. Delete the tag or pick another version.',
    });
  }

  runGit(['switch', config.developBranch], opts);
  if (remote && remoteBranchExists(config.developBranch, opts)) {
    runGit(['pull', '--ff-only', 'origin', config.developBranch], opts);
  }
  if (!tryRunGit(['merge', '--no-ff', '--no-edit', branch], opts)) {
    throw mergeConflictError(config.developBranch);
  }

  runGit(['tag', '-a', tag, '-m', `Release ${version}`], opts);
  if (remote) {
    runGit(['push', 'origin', config.developBranch, tag], opts);
  }

  if (config.release.alsoMergeToMain && config.mainBranch !== config.developBranch) {
    runGit(['switch', config.mainBranch], opts);
    if (remote && remoteBranchExists(config.mainBranch, opts)) {
      runGit(['pull', '--ff-only', 'origin', config.mainBranch], opts);
    }
    if (!tryRunGit(['merge', '--no-ff', '--no-edit', branch], opts)) {
      throw mergeConflictError(config.mainBranch);
    }
    if (remote) runGit(['push', 'origin', config.mainBranch], opts);
    runGit(['switch', config.developBranch], opts);
  }

  runGit(['branch', '-d', branch], opts);
  if (remote) {
    tryRunGit(['push', 'origin', '--delete', branch], opts);
  }
  return { tag };
}

export async function releaseFinishCommand(): Promise<void> {
  ensureGitRepo();
  const { config } = loadConfig();

  let releases = captureGit(['branch', '--list', 'release/*', '--format=%(refname:short)'])
    .split('\n')
    .filter(Boolean);

  // Release only on origin (started by a teammate)? Offer to check it out.
  if (releases.length === 0 && hasRemote()) {
    const remoteReleases = (tryCaptureGit(['ls-remote', '--heads', 'origin', 'release/*']) ?? '')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t')[1]?.replace('refs/heads/', '') ?? '')
      .filter(Boolean);
    if (remoteReleases.length > 0) {
      const get = await confirm({
        message: `Release branch ${remoteReleases[0]} exists on origin but not locally. Check it out?`,
        default: true,
      });
      if (!get) {
        log.dim('Cancelled.');
        return;
      }
      runGit(['fetch', 'origin']);
      runGit(['switch', remoteReleases[0]!]);
      releases = [remoteReleases[0]!];
    }
  }

  if (releases.length === 0) {
    throw new GitwizError('No release branch found.', {
      hint: 'Start one with "gitwiz release start".',
    });
  }

  const branch =
    releases.length === 1
      ? releases[0]!
      : await select({
          message: 'Which release do you want to finish?',
          choices: releases.map((r) => ({ name: r, value: r })),
        });
  const version = branch.slice('release/'.length);
  const tag = `${config.tagPrefix}${version}`;

  if (tagExists(tag)) {
    throw new GitwizError(`Tag "${tag}" already exists.`, {
      hint: 'This version seems to be released already.',
    });
  }

  // Stray changes on the release branch must be dealt with explicitly.
  if (getCurrentBranch() === branch && !isWorkingTreeClean()) {
    log.warn('There are uncommitted changes on the release branch:');
    for (const line of captureGit(['status', '--short']).split('\n').filter(Boolean)) {
      log.dim(`  ${line}`);
    }
    const commitThem = await confirm({
      message: `Commit them to ${branch} as part of the release?`,
      default: true,
    });
    if (!commitThem) {
      log.dim('Cancelled — clean up the release branch first.');
      return;
    }
    runGit(['add', '-A']);
    runGit(['commit', '-m', `chore(release): ${tag} updates`]);
  }

  log.blank();
  log.info(pc.bold('This will:'));
  log.info(`  1. Merge ${pc.cyan(branch)} into ${pc.cyan(config.developBranch)} (--no-ff)`);
  log.info(`  2. Create tag ${pc.cyan(tag)}`);
  if (hasRemote()) log.info(`  3. Push ${config.developBranch} and the tag to origin`);
  if (config.release.alsoMergeToMain && config.mainBranch !== config.developBranch) {
    log.info(`  4. Also merge into ${pc.cyan(config.mainBranch)} and push it`);
  }
  log.info(`  ${hasRemote() ? '5' : '4'}. Delete the ${branch} branch`);
  log.blank();

  const go = await confirm({ message: `Finish release ${version}?`, default: true });
  if (!go) {
    log.dim('Cancelled.');
    return;
  }

  performReleaseFinish(config, version);

  log.blank();
  log.success(`Release ${pc.bold(tag)} is done! 🎉`);
  if (!config.release.alsoMergeToMain && config.mainBranch !== config.developBranch) {
    log.warn(`${config.mainBranch} was NOT modified — deploy/merge to production is a separate, manual step.`);
  }
}
