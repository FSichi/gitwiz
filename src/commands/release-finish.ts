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
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
import { assertInteractive, confirm, select } from '../ui/prompts.js';

function mergeConflictError(target: string): GitwizError {
  return new GitwizError(
    [
      t('The merge into {target} stopped because of conflicts:', { target }),
      `  ${t('1. Fix the conflicted files ("gitwiz status" lists them).')}`,
      `  ${t('2. Stage them:    git add <file>')}`,
      `  ${t('3. Continue with: git merge --continue')}`,
      `  ${t('Or undo with:     git merge --abort  (then run "gitwiz release finish" again)')}`,
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
    throw new GitwizError(t('Tag "{tag}" already exists.', { tag }), {
      hint: t('This version seems to be released already. Delete the tag or pick another version.'),
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

export interface ReleaseFinishOptions {
  yes?: boolean;
}

export async function releaseFinishCommand(opts: ReleaseFinishOptions = {}): Promise<void> {
  ensureGitRepo();
  const { config } = loadConfig();
  const auto = Boolean(opts.yes);

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
      if (!auto) {
        assertInteractive();
        const get = await confirm({
          message: t('Release branch {branch} exists on origin but not locally. Check it out?', {
            branch: remoteReleases[0]!,
          }),
          default: true,
        });
        if (!get) {
          log.dim(t('Cancelled.'));
          return;
        }
      }
      runGit(['fetch', 'origin']);
      runGit(['switch', remoteReleases[0]!]);
      releases = [remoteReleases[0]!];
    }
  }

  if (releases.length === 0) {
    throw new GitwizError(t('No release branch found.'), {
      hint: t('Start one with "gitwiz release start".'),
    });
  }

  let branch: string;
  if (releases.length === 1) {
    branch = releases[0]!;
  } else if (auto) {
    throw new GitwizError(t('Multiple release branches are open: {branches}.', { branches: releases.join(', ') }), {
      hint: t('Finish them one at a time without --yes, or delete the extra branch.'),
    });
  } else {
    assertInteractive();
    branch = await select({
      message: t('Which release do you want to finish?'),
      choices: releases.map((r) => ({ name: r, value: r })),
    });
  }
  const version = branch.slice('release/'.length);
  const tag = `${config.tagPrefix}${version}`;

  if (tagExists(tag)) {
    throw new GitwizError(t('Tag "{tag}" already exists.', { tag }), {
      hint: t('This version seems to be released already.'),
    });
  }

  // Stray changes on the release branch must be dealt with explicitly.
  if (getCurrentBranch() === branch && !isWorkingTreeClean()) {
    log.warn(t('There are uncommitted changes on the release branch:'));
    for (const line of captureGit(['status', '--short']).split('\n').filter(Boolean)) {
      log.dim(`  ${line}`);
    }
    if (!auto) {
      assertInteractive();
      const commitThem = await confirm({
        message: t('Commit them to {branch} as part of the release?', { branch }),
        default: true,
      });
      if (!commitThem) {
        log.dim(t('Cancelled — clean up the release branch first.'));
        return;
      }
    }
    runGit(['add', '-A']);
    runGit(['commit', '-m', `chore(release): ${tag} updates`]);
  }

  log.blank();
  log.info(pc.bold(t('This will:')));
  log.info(`  ${t('1. Merge {branch} into {target} (--no-ff)', { branch: pc.cyan(branch), target: pc.cyan(config.developBranch) })}`);
  log.info(`  ${t('2. Create tag {tag}', { tag: pc.cyan(tag) })}`);
  if (hasRemote()) log.info(`  ${t('3. Push {branch} and the tag to origin', { branch: config.developBranch })}`);
  if (config.release.alsoMergeToMain && config.mainBranch !== config.developBranch) {
    log.info(`  ${t('4. Also merge into {branch} and push it', { branch: pc.cyan(config.mainBranch) })}`);
  }
  log.info(`  ${hasRemote() ? '5' : '4'}. ${t('Delete the {branch} branch', { branch })}`);
  log.blank();

  if (!auto) {
    assertInteractive();
    const go = await confirm({ message: t('Finish release {version}?', { version }), default: true });
    if (!go) {
      log.dim(t('Cancelled.'));
      return;
    }
  }

  performReleaseFinish(config, version);

  log.blank();
  log.success(t('Release {tag} is done! 🎉', { tag: pc.bold(tag) }));
  if (!config.release.alsoMergeToMain && config.mainBranch !== config.developBranch) {
    log.warn(t('{branch} was NOT modified — deploy/merge to production is a separate, manual step.', { branch: config.mainBranch }));
  }
}
