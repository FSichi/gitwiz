import { Listr, type ListrTask } from 'listr2';
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
import { log, spinSync } from '../ui/output.js';
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

// ── Step model ───────────────────────────────────────────────────────────────
// The release sequence lives in ONE place. How each git mutation is executed is
// abstracted behind ReleaseGit, so the same steps drive both worlds:
//   • headless  → inheritRunner: streams git output (current behaviour, tests rely on it)
//   • interactive → capturedRunner: captures output so listr2's live spinner stays intact

interface ReleaseGit {
  /** Run a mutating git command; throw on failure. */
  run(args: string[]): void;
  /** Run a mutating git command; return success instead of throwing. */
  tryRun(args: string[]): boolean;
}

interface StepDef {
  title: string;
  run: (g: ReleaseGit) => void;
}

function inheritRunner(opts: GitOptions): ReleaseGit {
  return {
    run: (args) => runGit(args, opts),
    tryRun: (args) => tryRunGit(args, opts),
  };
}

/** Captured runner — no inherited stdout, so it never corrupts a live renderer. */
function capturedRunner(opts: GitOptions, echo: (cmd: string) => void): ReleaseGit {
  return {
    run: (args) => {
      echo(`$ git ${args.join(' ')}`);
      captureGit(args, opts);
    },
    tryRun: (args) => {
      echo(`$ git ${args.join(' ')}`);
      return tryCaptureGit(args, opts) !== null;
    },
  };
}

/** The ordered release steps. Each title doubles as a progress label. */
function releaseFinishStepDefs(config: GitwizConfig, version: string, opts: GitOptions): StepDef[] {
  const branch = `release/${version}`;
  const tag = `${config.tagPrefix}${version}`;
  const remote = hasRemote(opts);
  const alsoMain = config.release.alsoMergeToMain && config.mainBranch !== config.developBranch;

  const steps: StepDef[] = [
    {
      title: t('Merge {branch} into {target}', { branch, target: config.developBranch }),
      run: (g) => {
        g.run(['switch', config.developBranch]);
        if (remote && remoteBranchExists(config.developBranch, opts)) {
          g.run(['pull', '--ff-only', 'origin', config.developBranch]);
        }
        if (!g.tryRun(['merge', '--no-ff', '--no-edit', branch])) {
          throw mergeConflictError(config.developBranch);
        }
      },
    },
    {
      title: t('Create tag {tag}', { tag }),
      run: (g) => g.run(['tag', '-a', tag, '-m', `Release ${version}`]),
    },
  ];

  if (remote) {
    steps.push({
      title: t('Push to origin'),
      run: (g) => g.run(['push', 'origin', config.developBranch, tag]),
    });
  }

  if (alsoMain) {
    steps.push({
      title: t('Also merge into {branch}', { branch: config.mainBranch }),
      run: (g) => {
        g.run(['switch', config.mainBranch]);
        if (remote && remoteBranchExists(config.mainBranch, opts)) {
          g.run(['pull', '--ff-only', 'origin', config.mainBranch]);
        }
        if (!g.tryRun(['merge', '--no-ff', '--no-edit', branch])) {
          throw mergeConflictError(config.mainBranch);
        }
        if (remote) g.run(['push', 'origin', config.mainBranch]);
        g.run(['switch', config.developBranch]);
      },
    });
  }

  steps.push({
    title: t('Delete release branch'),
    run: (g) => {
      g.run(['branch', '-d', branch]);
      if (remote) g.tryRun(['push', 'origin', '--delete', branch]);
    },
  });

  return steps;
}

/** Non-interactive release finish — merges, tags, pushes, deletes the release branch. */
export function performReleaseFinish(
  config: GitwizConfig,
  version: string,
  opts: GitOptions = {},
): { tag: string } {
  const tag = `${config.tagPrefix}${version}`;

  // Pre-flight: never merge first and fail at the tag.
  if (tagExists(tag, opts)) {
    throw new GitwizError(t('Tag "{tag}" already exists.', { tag }), {
      hint: t('This version seems to be released already. Delete the tag or pick another version.'),
    });
  }

  const g = inheritRunner(opts);
  for (const step of releaseFinishStepDefs(config, version, opts)) step.run(g);
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
      spinSync(t('Fetching from origin...'), () => runGit(['fetch', 'origin']));
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

  if (auto) {
    performReleaseFinish(config, version);
  } else {
    assertInteractive();
    const go = await confirm({ message: t('Finish release {version}?', { version }), default: true });
    if (!go) {
      log.dim(t('Cancelled.'));
      return;
    }

    // Live, in-place progress — listr2 owns the screen, so steps run captured.
    const taskList: ListrTask[] = releaseFinishStepDefs(config, version, {}).map((step) => ({
      title: step.title,
      task: async (_ctx, task) => {
        step.run(capturedRunner({}, (cmd) => { task.output = pc.dim(cmd); }));
      },
    }));

    try {
      await new Listr(taskList, { concurrent: false, exitOnError: true }).run();
    } catch (err) {
      // Surface the underlying GitwizError so cli.ts prints its hint.
      if (err instanceof GitwizError) throw err;
      const inner = (err as { errors?: unknown[] }).errors?.find((e) => e instanceof GitwizError);
      if (inner) throw inner;
      throw err;
    }
  }

  log.blank();
  log.success(t('Release {tag} is done! 🎉', { tag: pc.bold(tag) }));
  if (!config.release.alsoMergeToMain && config.mainBranch !== config.developBranch) {
    log.warn(t('{branch} was NOT modified — deploy/merge to production is a separate, manual step.', { branch: config.mainBranch }));
  }
}
