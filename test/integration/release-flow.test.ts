import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { performReleaseFinish } from '../../src/commands/release-finish.js';
import { assertNoOpenRelease, performReleaseStart } from '../../src/commands/release-start.js';
import { collectCommitsSince, findLastTag } from '../../src/core/changelog/parse.js';
import { loadConfig } from '../../src/core/config.js';
import { getCurrentBranch, localBranchExists, remoteBranchExists, tagExists } from '../../src/core/git.js';
import { createTempRepo, type TempRepo } from './helpers/temp-repo.js';

describe('release flow end-to-end', () => {
  let r: TempRepo;
  let origin: string;

  afterAll(() => {
    r?.cleanup();
    if (origin) rmSync(origin, { recursive: true, force: true, maxRetries: 5 });
  });

  it('runs two full release cycles against a real repo with origin', () => {
    r = createTempRepo({ initialCommit: false });
    r.commit('chore: initial commit', {
      'package.json': '{\n  "name": "demo",\n  "version": "1.0.0"\n}\n',
      'README.md': '# Demo\n',
    });
    origin = r.addBareOrigin();
    r.git('branch', 'develop');
    r.git('push', '-u', 'origin', 'develop');
    r.git('switch', 'develop');
    r.writeFile('.gitwizrc.json', JSON.stringify({ mainBranch: 'main', developBranch: 'develop', tagPrefix: 'v' }, null, 2));
    r.commit('chore: add gitwiz config');
    r.commit('feat(auth): add login flow', { 'src/auth.ts': 'export const login = 1;\n' });
    r.commit('fix: handle empty passwords', { 'src/auth.ts': 'export const login = 2;\n' });
    r.git('push');

    const opts = { cwd: r.dir };
    const { config } = loadConfig(opts);
    expect(config.developBranch).toBe('develop');

    // ---- Release 1: start ----
    assertNoOpenRelease(opts);
    performReleaseStart(config, '1.1.0', opts);

    expect(getCurrentBranch(opts)).toBe('release/1.1.0');
    expect(remoteBranchExists('release/1.1.0', opts)).toBe(true);
    expect(JSON.parse(readFileSync(join(r.dir, 'package.json'), 'utf8')).version).toBe('1.1.0');

    const changelog1 = readFileSync(join(r.dir, 'CHANGELOG.md'), 'utf8');
    expect(changelog1).toContain('# Changelog');
    expect(changelog1).toContain('## 1.1.0');
    expect(changelog1).toContain('### Features');
    expect(changelog1).toContain('**auth:** add login flow');
    expect(changelog1).toContain('### Bug Fixes');
    expect(changelog1).toContain('handle empty passwords');
    expect(changelog1).not.toContain('initial commit'); // chore is hidden

    // A second release cannot start while this one is open.
    expect(() => assertNoOpenRelease(opts)).toThrow(/already in progress/);

    // ---- Release 1: finish ----
    performReleaseFinish(config, '1.1.0', opts);
    expect(getCurrentBranch(opts)).toBe('develop');
    expect(tagExists('v1.1.0', opts)).toBe(true);
    expect(localBranchExists('release/1.1.0', opts)).toBe(false);
    expect(remoteBranchExists('release/1.1.0', opts)).toBe(false);
    // The merge commit landed on develop and was pushed.
    expect(r.git('log', '-1', '--format=%s', 'origin/develop')).toContain("Merge branch 'release/1.1.0'");
    // main untouched (alsoMergeToMain defaults to false).
    expect(r.git('log', '-1', '--format=%s', 'main')).toBe('chore: initial commit');

    // ---- Release 2: only commits since v1.1.0, changelog merged on top ----
    r.commit('feat: add dashboard', { 'src/dash.ts': 'export const d = 1;\n' });
    r.git('push');

    expect(findLastTag('v', opts)).toBe('v1.1.0');
    const since = collectCommitsSince('v1.1.0', opts);
    expect(since.some((c) => c.description === 'add dashboard')).toBe(true);
    expect(since.some((c) => c.description === 'add login flow')).toBe(false);

    performReleaseStart(config, '1.2.0', opts);
    const changelog2 = readFileSync(join(r.dir, 'CHANGELOG.md'), 'utf8');
    expect(changelog2.indexOf('## 1.2.0')).toBeLessThan(changelog2.indexOf('## 1.1.0'));
    expect(changelog2).toContain('add dashboard');
    expect(changelog2).toContain('**auth:** add login flow'); // old entries preserved
    expect(changelog2.match(/# Changelog/g)).toHaveLength(1);
    // The 1.2.0 section only contains commits since the last release.
    const section2 = changelog2.slice(changelog2.indexOf('## 1.2.0'), changelog2.indexOf('## 1.1.0'));
    expect(section2).not.toContain('add login flow');

    performReleaseFinish(config, '1.2.0', opts);
    expect(tagExists('v1.2.0', opts)).toBe(true);
    expect(getCurrentBranch(opts)).toBe('develop');

    // Finishing the same version twice fails on the tag pre-flight.
    expect(() => performReleaseFinish(config, '1.2.0', opts)).toThrow(/already exists/);
  });

  // git's v:refname sort puts 1.3.0-rc.1 *above* 1.3.0; the changelog of the
  // next release would then repeat everything 1.3.0 already shipped.
  it('picks the last tag by semver, with a release above its own release candidate', () => {
    const t = createTempRepo();
    try {
      for (const tag of ['v1.2.0', 'v1.3.0-rc.1', 'v1.3.0', 'v1.10.0-beta.2', 'not-a-version']) {
        t.git('tag', tag);
      }
      expect(findLastTag('v', { cwd: t.dir })).toBe('v1.10.0-beta.2');
      t.git('tag', 'v1.10.0');
      expect(findLastTag('v', { cwd: t.dir })).toBe('v1.10.0');
    } finally {
      t.cleanup();
    }
  });
});
