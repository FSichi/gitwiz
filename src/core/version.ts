import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';
import { WizgitError } from '../ui/errors.js';
import { rewriteJson } from './json-file.js';

export interface BumpPreviews {
  major: string;
  minor: string;
  patch: string;
}

export function bumpPreviews(current: string): BumpPreviews {
  const base = semver.valid(current);
  if (!base) throw new WizgitError(`Current version "${current}" is not valid semver.`);
  return {
    major: semver.inc(base, 'major')!,
    minor: semver.inc(base, 'minor')!,
    patch: semver.inc(base, 'patch')!,
  };
}

export function readPackageVersion(repoRoot: string): string {
  const pkgPath = join(repoRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new WizgitError('No package.json found at the repository root.', {
      hint: 'wizgit release currently requires an npm project (version lives in package.json).',
    });
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
  if (!pkg.version || !semver.valid(pkg.version)) {
    throw new WizgitError(`package.json has a missing or invalid "version" (${pkg.version ?? 'none'}).`);
  }
  return pkg.version;
}

/**
 * Write `newVersion` into package.json (and package-lock.json when present),
 * preserving indentation, key order and line endings. Avoids spawning `npm version`
 * (slow, and npm.cmd needs a shell on Windows).
 * Returns repo-root-relative paths of the files that were changed.
 */
export function applyVersion(repoRoot: string, newVersion: string): string[] {
  if (!semver.valid(newVersion)) {
    throw new WizgitError(`"${newVersion}" is not a valid semver version.`);
  }
  const changed: string[] = [];

  const pkgPath = join(repoRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new WizgitError('No package.json found at the repository root.');
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
