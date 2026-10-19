import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';
import { GitwizError } from '../ui/errors.js';
import { rewriteJson } from './json-file.js';

export interface BumpPreviews {
  major: string;
  minor: string;
  patch: string;
}

export type BumpKind = 'major' | 'minor' | 'patch';

/** Recommend a bump from the conventional commits since the last release. */
export function suggestBump(
  commits: ReadonlyArray<{ type: string | null; breaking: boolean }>,
): BumpKind {
  if (commits.some((c) => c.breaking)) return 'major';
  if (commits.some((c) => c.type === 'feat')) return 'minor';
  return 'patch';
}

export function bumpPreviews(current: string): BumpPreviews {
  const base = semver.valid(current);
  if (!base) throw new GitwizError(`Current version "${current}" is not valid semver.`);
  return {
    major: semver.inc(base, 'major')!,
    minor: semver.inc(base, 'minor')!,
    patch: semver.inc(base, 'patch')!,
  };
}

function readPackageJson(pkgPath: string): { version?: unknown } {
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  } catch (err) {
    throw new GitwizError(`Could not parse package.json: ${(err as Error).message}`);
  }
}

/**
 * True when the root package.json carries a "version" — the one gitwiz bumps.
 * An app or monorepo root without it releases like a non-npm project: the
 * version lives in the tags.
 */
export function hasPackageVersion(repoRoot: string): boolean {
  const pkgPath = join(repoRoot, 'package.json');
  return existsSync(pkgPath) && readPackageJson(pkgPath).version !== undefined;
}

export function readPackageVersion(repoRoot: string): string {
  const pkgPath = join(repoRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new GitwizError('No package.json found at the repository root.', {
      hint: 'gitwiz release currently requires an npm project (version lives in package.json).',
    });
  }
  const { version } = readPackageJson(pkgPath);
  if (typeof version !== 'string' || !semver.valid(version)) {
    throw new GitwizError(`package.json has a missing or invalid "version" (${String(version ?? 'none')}).`);
  }
  return version;
}

/**
 * Write `newVersion` into package.json (and package-lock.json when present),
 * preserving indentation, key order and line endings. Avoids spawning `npm version`
 * (slow, and npm.cmd needs a shell on Windows).
 * Returns repo-root-relative paths of the files that were changed.
 */
export function applyVersion(repoRoot: string, newVersion: string): string[] {
  if (!semver.valid(newVersion)) {
    throw new GitwizError(`"${newVersion}" is not a valid semver version.`);
  }
  const changed: string[] = [];

  const pkgPath = join(repoRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new GitwizError('No package.json found at the repository root.');
  }
  rewriteJson(pkgPath, (pkg) => {
    pkg.version = newVersion;
  });
  changed.push('package.json');

  const lockPath = join(repoRoot, 'package-lock.json');
  if (existsSync(lockPath)) {
    rewriteJson(lockPath, (lock) => {
      lock.version = newVersion;
      const packages = lock.packages as Record<string, { version?: string }> | undefined;
      if (packages?.['']) packages[''].version = newVersion;
    });
    changed.push('package-lock.json');
  }

  return changed;
}
