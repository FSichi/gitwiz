import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import semver from 'semver';
import { mergeChangelog } from '../core/changelog/merge.js';
import { collectCommitsSince, findLastTag, type ConventionalCommit } from '../core/changelog/parse.js';
import { parseRepoWebUrl, renderReleaseSection } from '../core/changelog/render.js';
import { loadConfig, type GitwizConfig } from '../core/config.js';
import {
  captureGit,
  ensureGitRepo,
  getRemoteUrl,
  getRepoRoot,
  hasRemote,
  isWorkingTreeClean,
  remoteBranchExists,
  runGit,
  tryCaptureGit,
  type GitOptions,
} from '../core/git.js';
import { applyVersion, bumpPreviews, readPackageVersion, suggestBump, type BumpKind } from '../core/version.js';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
import { assertInteractive, input, select } from '../ui/prompts.js';

function listLocalReleaseBranches(opts: GitOptions = {}): string[] {
  return captureGit(['branch', '--list', 'release/*', '--format=%(refname:short)'], opts)
    .split('\n')
    .filter(Boolean);
}

function listRemoteReleaseBranches(opts: GitOptions = {}): string[] {
  const out = tryCaptureGit(['ls-remote', '--heads', 'origin', 'release/*'], opts);
  if (!out) return [];
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')[1]?.replace('refs/heads/', '') ?? '')
    .filter(Boolean);
}

export function assertNoOpenRelease(opts: GitOptions = {}): void {
  const local = listLocalReleaseBranches(opts);
  if (local.length > 0) {
    throw new GitwizError(t('A release is already in progress: {branch}', { branch: local[0]! }), {
      hint: t('Finish it with "gitwiz release finish" (or delete the branch) before starting a new one.'),
    });
  }
  if (hasRemote(opts)) {
    const remote = listRemoteReleaseBranches(opts);
    if (remote.length > 0) {
      throw new GitwizError(t('A release branch already exists on origin: {branch}', { branch: remote[0]! }), {
        hint: t('Someone may have a release in progress. Finish or delete it first.'),
      });
    }
  }
}

/**
 * Current project version: package.json when present, otherwise derived from
 * the latest release tag (so non-npm projects can release too).
 */
export function getCurrentProjectVersion(
  repoRoot: string,
  config: GitwizConfig,
  opts: GitOptions = {},
): string {
  if (existsSync(join(repoRoot, 'package.json'))) {
    return readPackageVersion(repoRoot);
  }
  const lastTag = findLastTag(config.tagPrefix, opts);
  if (lastTag) {
    const version = semver.valid(lastTag.slice(config.tagPrefix.length));
    if (version) return version;
  }
  return '0.0.0';
}

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Non-interactive release start — switches to develop, branches, bumps, writes the changelog, commits. */
export function performReleaseStart(
  config: GitwizConfig,
  version: string,
  opts: GitOptions = {},
): { branch: string; changelogPath: string } {
  const repoRoot = getRepoRoot(opts);
  const remote = hasRemote(opts);
  const branch = `release/${version}`;

  runGit(['switch', config.developBranch], opts);
  if (remote && remoteBranchExists(config.developBranch, opts)) {
    runGit(['pull', '--ff-only', 'origin', config.developBranch], opts);
  }
  runGit(['switch', '-c', branch], opts);

  // Non-npm projects have no manifest to bump — the tag carries the version.
  const changedFiles = existsSync(join(repoRoot, 'package.json'))
    ? applyVersion(repoRoot, version)
    : [];

  const lastTag = findLastTag(config.tagPrefix, opts);
  const commits = collectCommitsSince(lastTag, opts);
  const section = renderReleaseSection(commits, {
    version,
    date: today(),
    tagPrefix: config.tagPrefix,
    previousTag: lastTag,
    web: parseRepoWebUrl(getRemoteUrl(opts)),
    commitTypes: config.commitTypes,
  });

  const changelogPath = join(repoRoot, config.release.changelogFile);
  const existing = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : null;
  writeFileSync(changelogPath, mergeChangelog(existing, section, version), 'utf8');

  runGit(['add', '--', ...changedFiles, config.release.changelogFile], opts);
  runGit(['commit', '-m', `chore(release): ${config.tagPrefix}${version}`], opts);
  if (remote) {
    runGit(['push', '-u', 'origin', branch], opts);
  }
  return { branch, changelogPath };
}

export interface ReleaseStartOptions {
  major?: boolean;
  minor?: boolean;
  patch?: boolean;
  version?: string;
}

function summarizeCommits(commits: ConventionalCommit[]): string {
  const counts = new Map<string, number>();
  let breaking = 0;
  for (const commit of commits) {
    if (commit.breaking) breaking++;
    const key = commit.type ?? 'other';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts: string[] = [];
  if (breaking > 0) parts.push(`${breaking} breaking`);
  for (const type of ['feat', 'fix', 'perf']) {
    const n = counts.get(type);
    if (n) parts.push(`${n} ${type}`);
  }
  const shown = breaking + ['feat', 'fix', 'perf'].reduce((acc, k) => acc + (counts.get(k) ?? 0), 0);
  const other = commits.length - shown;
  if (other > 0) parts.push(t('{n} other', { n: other }));
  return parts.join(' · ');
}

export async function releaseStartCommand(opts: ReleaseStartOptions = {}): Promise<void> {
  ensureGitRepo();
  const { config, repoRoot } = loadConfig();

  if (!isWorkingTreeClean()) {
    throw new GitwizError(t('You have uncommitted changes.'), {
      hint: t('Commit them ("gitwiz commit") or stash them before starting a release.'),
    });
  }
  assertNoOpenRelease();

  const current = getCurrentProjectVersion(repoRoot, config);
  const previews = bumpPreviews(current);

  // Non-interactive: a bump flag or explicit version picks it without prompting.
  let version: string | undefined;
  if (opts.version) {
    if (!semver.valid(opts.version)) throw new GitwizError(t('"{version}" is not a valid semver version.', { version: opts.version }));
    if (!semver.gt(opts.version, current)) {
      throw new GitwizError(t('Version {version} must be greater than the current {current}.', { version: opts.version, current }));
    }
    version = opts.version;
  } else if (opts.major) version = previews.major;
  else if (opts.minor) version = previews.minor;
  else if (opts.patch) version = previews.patch;

  if (version === undefined) {
    assertInteractive();

    // Suggest the bump from what actually changed since the last release.
    const lastTag = findLastTag(config.tagPrefix);
    const commits = collectCommitsSince(lastTag);
    const suggested: BumpKind | null = commits.length > 0 ? suggestBump(commits) : null;
    if (suggested) {
      const since = lastTag ?? t('the beginning');
      log.blank();
      log.info(
        t('Since {ref}: {summary} → suggested bump: {bump}', {
          ref: pc.bold(since),
          summary: summarizeCommits(commits),
          bump: pc.bold(suggested),
        }),
      );
    }

    const kindChoices: { kind: BumpKind; hint: string; value: string }[] = [
      { kind: 'patch', hint: t('bug fixes only'), value: previews.patch },
      { kind: 'minor', hint: t('new features'), value: previews.minor },
      { kind: 'major', hint: t('breaking changes'), value: previews.major },
    ];
    if (suggested) {
      kindChoices.sort((a, b) => Number(b.kind === suggested) - Number(a.kind === suggested));
    }

    const choice = await select({
      message: t('Current version is {version}. What kind of release is this?', { version: pc.bold(current) }),
      choices: [
        ...kindChoices.map((c) => ({
          name: `${c.kind.padEnd(6)} ${pc.dim(`${c.hint.padEnd(22)} ${current} → ${c.value}`)}${
            c.kind === suggested ? ` ${pc.green(t('(suggested)'))}` : ''
          }`,
          value: c.value,
          short: c.kind,
        })),
        { name: `custom ${pc.dim(t('type a version yourself'))}`, value: 'custom', short: 'custom' },
      ],
    });

    if (choice === 'custom') {
      version = await input({
        message: t('New version:'),
        validate: (value) => {
          if (!semver.valid(value)) return t('Not a valid semver version (e.g. 1.4.0).');
          if (!semver.gt(value, current)) return t('Must be greater than the current version ({current}).', { current });
          return true;
        },
      });
    } else {
      version = choice;
    }
  }

  const { branch } = performReleaseStart(config, version);

  log.blank();
  log.success(t('Release branch {branch} created — version bumped to {version}.', { branch: pc.bold(branch), version }));
  log.info(`  ${t('Next steps:')}`);
  log.info(`    ${t('1. Review {file} (commit any edits to this branch).', { file: config.release.changelogFile })}`);
  log.info(`    ${t('2. When everything looks good, run {cmd}.', { cmd: pc.bold('gitwiz release finish') })}`);
}
