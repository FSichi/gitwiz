import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WizgitError } from '../ui/errors.js';
import {
  getRepoRoot,
  localBranchExists,
  remoteBranchExists,
  tryCaptureGit,
  type GitOptions,
} from './git.js';

export interface BranchType {
  type: string;
  prefix: string;
  description: string;
  base: 'develop' | 'main';
}

export interface CommitType {
  type: string;
  emoji: string;
  description: string;
  /** Section title in the changelog, or false to hide commits of this type. */
  changelogSection: string | false;
}

export interface WizgitConfig {
  mainBranch: string;
  developBranch: string;
  tagPrefix: string;
  branchTypes: BranchType[];
  commitTypes: CommitType[];
  release: {
    alsoMergeToMain: boolean;
    changelogFile: string;
  };
}

export type ConfigSource = 'rc' | 'package.json' | 'detected';

export interface ResolvedConfig {
  config: WizgitConfig;
  source: ConfigSource;
  repoRoot: string;
}

export const RC_FILENAME = '.wizgitrc.json';

export const DEFAULT_BRANCH_TYPES: BranchType[] = [
  { type: 'feature', prefix: 'feature/', description: 'New functionality', base: 'develop' },
  { type: 'bugfix', prefix: 'bugfix/', description: 'Non-urgent bug fix', base: 'develop' },
  { type: 'hotfix', prefix: 'hotfix/', description: 'Urgent fix for production', base: 'main' },
  { type: 'refactor', prefix: 'refactor/', description: 'Code improvement, no behavior change', base: 'develop' },
  { type: 'chore', prefix: 'chore/', description: 'Maintenance task', base: 'develop' },
  { type: 'docs', prefix: 'docs/', description: 'Documentation changes', base: 'develop' },
];

export const DEFAULT_COMMIT_TYPES: CommitType[] = [
  { type: 'feat', emoji: '✨', description: 'A new feature', changelogSection: 'Features' },
  { type: 'fix', emoji: '🐛', description: 'A bug fix', changelogSection: 'Bug Fixes' },
  { type: 'docs', emoji: '📝', description: 'Documentation only', changelogSection: false },
  { type: 'style', emoji: '💄', description: 'Formatting, whitespace, no code change', changelogSection: false },
  { type: 'refactor', emoji: '♻️', description: 'Neither fixes a bug nor adds a feature', changelogSection: false },
  { type: 'perf', emoji: '⚡', description: 'Performance improvement', changelogSection: 'Performance' },
  { type: 'test', emoji: '✅', description: 'Adding or fixing tests', changelogSection: false },
  { type: 'chore', emoji: '🔧', description: 'Maintenance, tooling', changelogSection: false },
  { type: 'ci', emoji: '🤖', description: 'CI configuration', changelogSection: false },
  { type: 'build', emoji: '📦', description: 'Build system or dependencies', changelogSection: false },
];

function builtinDefaults(): WizgitConfig {
  return {
    mainBranch: 'main',
    developBranch: 'main',
    tagPrefix: 'v',
    branchTypes: structuredClone(DEFAULT_BRANCH_TYPES),
    commitTypes: structuredClone(DEFAULT_COMMIT_TYPES),
    release: {
      alsoMergeToMain: false,
      changelogFile: 'CHANGELOG.md',
    },
  };
}

// ---------------------------------------------------------------------------
// Branch auto-detection
// ---------------------------------------------------------------------------

export function detectMainBranch(opts: GitOptions = {}): string {
  const originHead = tryCaptureGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], opts);
  if (originHead?.startsWith('origin/')) return originHead.slice('origin/'.length);

  for (const candidate of ['main', 'master']) {
    if (localBranchExists(candidate, opts) || remoteBranchExists(candidate, opts)) return candidate;
  }
  return 'main';
}

export function detectDevelopBranch(mainBranch: string, opts: GitOptions = {}): string {
  for (const candidate of ['develop', 'development', 'dev']) {
    if (localBranchExists(candidate, opts) || remoteBranchExists(candidate, opts)) return candidate;
  }
  // Trunk-based fallback: work branches start from the main branch.
  return mainBranch;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function fail(path: string, expected: string): never {
  throw new WizgitError(`Invalid wizgit config: "${path}" must be ${expected}.`);
}

function validateUserConfig(raw: unknown, origin: string): Partial<WizgitConfig> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new WizgitError(`Invalid wizgit config in ${origin}: expected an object.`);
  }
  const cfg = raw as Record<string, unknown>;
  const out: Partial<WizgitConfig> = {};

  for (const key of ['mainBranch', 'developBranch', 'tagPrefix'] as const) {
    if (cfg[key] !== undefined) {
      if (typeof cfg[key] !== 'string') fail(key, 'a string');
      if (key !== 'tagPrefix' && (cfg[key] as string).trim() === '') fail(key, 'a non-empty string');
      out[key] = cfg[key] as string;
    }
  }

  if (cfg.branchTypes !== undefined) {
    if (!Array.isArray(cfg.branchTypes)) fail('branchTypes', 'an array');
    out.branchTypes = cfg.branchTypes.map((entry, i) => {
      const e = entry as Record<string, unknown>;
      if (typeof e?.type !== 'string' || typeof e?.prefix !== 'string') {
        fail(`branchTypes[${i}]`, 'an object with string "type" and "prefix"');
      }
      if (e.base !== undefined && e.base !== 'develop' && e.base !== 'main') {
        fail(`branchTypes[${i}].base`, '"develop" or "main"');
      }
      return {
        type: e.type as string,
        prefix: e.prefix as string,
        description: typeof e.description === 'string' ? e.description : '',
        base: (e.base as 'develop' | 'main' | undefined) ?? 'develop',
      };
    });
  }

  if (cfg.commitTypes !== undefined) {
    if (!Array.isArray(cfg.commitTypes)) fail('commitTypes', 'an array');
    out.commitTypes = cfg.commitTypes.map((entry, i) => {
      const e = entry as Record<string, unknown>;
      if (typeof e?.type !== 'string') fail(`commitTypes[${i}].type`, 'a string');
      if (
        e.changelogSection !== undefined &&
        e.changelogSection !== false &&
        typeof e.changelogSection !== 'string'
      ) {
        fail(`commitTypes[${i}].changelogSection`, 'a string or false');
      }
      return {
        type: e.type as string,
        emoji: typeof e.emoji === 'string' ? e.emoji : '•',
        description: typeof e.description === 'string' ? e.description : '',
        changelogSection: (e.changelogSection as string | false | undefined) ?? false,
      };
    });
  }

  if (cfg.release !== undefined) {
    const r = cfg.release as Record<string, unknown>;
    if (typeof r !== 'object' || r === null) fail('release', 'an object');
    out.release = {
      alsoMergeToMain: typeof r.alsoMergeToMain === 'boolean' ? r.alsoMergeToMain : false,
      changelogFile: typeof r.changelogFile === 'string' ? r.changelogFile : 'CHANGELOG.md',
    };
    if (r.alsoMergeToMain !== undefined && typeof r.alsoMergeToMain !== 'boolean') {
      fail('release.alsoMergeToMain', 'a boolean');
    }
    if (r.changelogFile !== undefined && typeof r.changelogFile !== 'string') {
      fail('release.changelogFile', 'a string');
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Resolution: .wizgitrc.json → package.json "wizgit" key → detection → defaults
// ---------------------------------------------------------------------------

function readUserConfig(repoRoot: string): { raw: unknown; source: ConfigSource } | null {
  const rcPath = join(repoRoot, RC_FILENAME);
  if (existsSync(rcPath)) {
    try {
      return { raw: JSON.parse(readFileSync(rcPath, 'utf8')), source: 'rc' };
    } catch (err) {
      throw new WizgitError(`Could not parse ${RC_FILENAME}: ${(err as Error).message}`);
    }
  }
  const pkgPath = join(repoRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      if (pkg.wizgit !== undefined) return { raw: pkg.wizgit, source: 'package.json' };
    } catch {
      // A broken package.json is not wizgit's problem to report here.
    }
  }
  return null;
}

export function loadConfig(opts: GitOptions = {}): ResolvedConfig {
  const repoRoot = getRepoRoot(opts);
  const config = builtinDefaults();

  const user = readUserConfig(repoRoot);
  const userConfig = user
    ? validateUserConfig(user.raw, user.source === 'rc' ? RC_FILENAME : 'package.json "wizgit" key')
    : {};

  config.mainBranch = userConfig.mainBranch ?? detectMainBranch(opts);
  config.developBranch =
    userConfig.developBranch ?? detectDevelopBranch(config.mainBranch, opts);
  if (userConfig.tagPrefix !== undefined) config.tagPrefix = userConfig.tagPrefix;
  if (userConfig.branchTypes) config.branchTypes = userConfig.branchTypes;
  if (userConfig.commitTypes) config.commitTypes = userConfig.commitTypes;
  if (userConfig.release) config.release = userConfig.release;

  return { config, source: user?.source ?? 'detected', repoRoot };
}

/** Base branch (actual name) for a given branch type. */
export function baseBranchFor(branchType: BranchType, config: WizgitConfig): string {
  return branchType.base === 'main' ? config.mainBranch : config.developBranch;
}
