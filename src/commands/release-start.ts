import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import semver from 'semver';
import { mergeChangelog } from '../core/changelog/merge.js';
import { collectCommitsSince, findLastTag } from '../core/changelog/parse.js';
import { parseRepoWebUrl, renderReleaseSection } from '../core/changelog/render.js';
import { loadConfig, type WizgitConfig } from '../core/config.js';
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
import { applyVersion, bumpPreviews, readPackageVersion } from '../core/version.js';
import { WizgitError } from '../ui/errors.js';
import { log } from '../ui/output.js';
import { input, select } from '../ui/prompts.js';

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
    throw new WizgitError(`A release is already in progress: ${local[0]}`, {
      hint: 'Finish it with "wizgit release finish" (or delete the branch) before starting a new one.',
    });
  }
  if (hasRemote(opts)) {
    const remote = listRemoteReleaseBranches(opts);
    if (remote.length > 0) {
      throw new WizgitError(`A release branch already exists on origin: ${remote[0]}`, {
        hint: 'Someone may have a release in progress. Finish or delete it first.',
      });
    }
  }
}

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Non-interactive release start — switches to develop, branches, bumps, writes the changelog, commits. */
export function performReleaseStart(
  config: WizgitConfig,
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

  const changedFiles = applyVersion(repoRoot, version);

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

export async function releaseStartCommand(): Promise<void> {
  ensureGitRepo();
  const { config, repoRoot } = loadConfig();

  if (!isWorkingTreeClean()) {
    throw new WizgitError('You have uncommitted changes.', {
      hint: 'Commit them ("wizgit commit") or stash them before starting a release.',
    });
  }
  assertNoOpenRelease();

  const current = readPackageVersion(repoRoot);
  const previews = bumpPreviews(current);

  const choice = await select({
    message: `Current version is ${pc.bold(current)}. What kind of release is this?`,
    choices: [
      { name: `patch  ${pc.dim(`bug fixes only          ${current} → ${previews.patch}`)}`, value: previews.patch },
      { name: `minor  ${pc.dim(`new features            ${current} → ${previews.minor}`)}`, value: previews.minor },
      { name: `major  ${pc.dim(`breaking changes        ${current} → ${previews.major}`)}`, value: previews.major },
      { name: `custom ${pc.dim('type a version yourself')}`, value: 'custom' },
    ],
  });

  let version: string;
  if (choice === 'custom') {
    version = await input({
      message: 'New version:',
      validate: (value) => {
        if (!semver.valid(value)) return 'Not a valid semver version (e.g. 1.4.0).';
        if (!semver.gt(value, current)) return `Must be greater than the current version (${current}).`;
        return true;
      },
    });
  } else {
    version = choice;
  }

  const { branch } = performReleaseStart(config, version);

  log.blank();
  log.success(`Release branch ${pc.bold(branch)} created — version bumped to ${version}.`);
  log.info('  Next steps:');
  log.info(`    1. Review ${config.release.changelogFile} (commit any edits to this branch).`);
  log.info(`    2. When everything looks good, run ${pc.bold('wizgit release finish')}.`);
}
