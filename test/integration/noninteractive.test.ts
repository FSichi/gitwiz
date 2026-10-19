import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { branchCommand } from '../../src/commands/branch.js';
import { commitCommand } from '../../src/commands/commit.js';
import { releaseFinishCommand } from '../../src/commands/release-finish.js';
import { releaseStartCommand } from '../../src/commands/release-start.js';
import { captureGit, captureGitPaths, getCurrentBranch, tagExists } from '../../src/core/git.js';
import { createTempRepo, type TempRepo } from './helpers/temp-repo.js';

// The command functions operate on process.cwd(), so each test chdirs into a
// temp repo and restores afterwards.
describe('non-interactive commands (agent-facing)', () => {
  const originalCwd = process.cwd();
  const repos: TempRepo[] = [];

  function repo(opts?: { initialCommit?: boolean }): TempRepo {
    const r = createTempRepo(opts);
    repos.push(r);
    process.chdir(r.dir);
    return r;
  }

  afterEach(() => {
    process.chdir(originalCwd);
    for (const r of repos.splice(0)) r.cleanup();
  });

  it('commit --type/--scope/-m --all builds a conventional commit', async () => {
    const r = repo();
    r.writeFile('a.txt', 'hello');
    await commitCommand({ type: 'feat', scope: 'core', message: 'add a', all: true });
    expect(captureGit(['log', '-1', '--format=%s'])).toBe('feat(core): add a');
  });

  it('commit --breaking adds the bang and footer', async () => {
    const r = repo();
    r.writeFile('a.txt', 'x');
    await commitCommand({ type: 'feat', message: 'change api', all: true, breaking: 'drop v1' });
    expect(captureGit(['log', '-1', '--format=%s'])).toBe('feat!: change api');
    expect(captureGit(['log', '-1', '--format=%b'])).toContain('BREAKING CHANGE: drop v1');
  });

  it('commit rejects an unknown type', async () => {
    repo().writeFile('a.txt', 'x');
    await expect(commitCommand({ type: 'nope', message: 'x', all: true })).rejects.toThrow(/Unknown commit type/);
  });

  it('commit errors when nothing is staged and --all is absent', async () => {
    repo().writeFile('a.txt', 'x');
    await expect(commitCommand({ type: 'feat', message: 'x' })).rejects.toThrow(/Nothing is staged/);
  });

  it('branch --type/--name creates a normalized branch from the base', async () => {
    const r = repo();
    r.writeFile('.gitwizrc.json', JSON.stringify({ mainBranch: 'main', developBranch: 'develop', tagPrefix: 'v' }));
    r.commit('chore: config');
    r.git('branch', 'develop'); // base exists at the config commit
    await branchCommand({ type: 'feature', name: 'My Cool Thing' });
    expect(getCurrentBranch()).toBe('feature/my-cool-thing');
  });

  it('branch rejects an unknown type', async () => {
    repo();
    await expect(branchCommand({ type: 'ghost', name: 'x' })).rejects.toThrow(/Unknown branch type/);
  });

  it('commit refuses protected branches unless --allow-protected', async () => {
    const r = repo();
    r.writeFile('.gitwizrc.json', JSON.stringify({ mainBranch: 'main', developBranch: 'develop' }));
    r.commit('chore: config');
    r.git('branch', 'develop'); // main+develop distinct → main is protected

    r.writeFile('a.txt', 'x');
    await expect(commitCommand({ type: 'feat', message: 'x', all: true })).rejects.toThrow(/protected branch/);

    await commitCommand({ type: 'feat', message: 'allowed', all: true, allowProtected: true });
    expect(captureGit(['log', '-1', '--format=%s'])).toBe('feat: allowed');
  });

  it('release start works without a package.json (version from last tag)', async () => {
    const r = repo({ initialCommit: false });
    r.commit('feat: initial', {
      '.gitwizrc.json': JSON.stringify({ mainBranch: 'main', developBranch: 'main', tagPrefix: 'v' }),
      'main.py': 'print("hi")\n',
    });
    r.git('tag', '-a', 'v1.0.0', '-m', 'Release 1.0.0');
    r.commit('feat: add feature', { 'main.py': 'print("hi v2")\n' });

    await releaseStartCommand({ minor: true });
    expect(getCurrentBranch()).toBe('release/1.1.0');
    const changelog = captureGit(['show', 'HEAD:CHANGELOG.md']);
    expect(changelog).toContain('## 1.1.0');
    expect(changelog).toContain('add feature');

    await releaseFinishCommand({ yes: true });
    expect(tagExists('v1.1.0')).toBe(true);
  });

  // An agent that passes half the flags must learn which ones are missing.
  it('commit with only some flags names the missing ones', async () => {
    repo().writeFile('a.txt', 'x');
    await expect(commitCommand({ message: 'x', all: true })).rejects.toMatchObject({
      hint: expect.stringContaining('--type'),
    });
  });

  it('branch with only some flags names the missing ones', async () => {
    repo();
    await expect(branchCommand({ name: 'x' })).rejects.toMatchObject({
      hint: expect.stringContaining('--name'),
    });
  });

  it('commits files with spaces and accents from a subfolder', async () => {
    const r = repo();
    r.writeFile('src/con espacio.ts', 'a');
    r.writeFile('src/configuración.ts', 'b');
    process.chdir(join(r.dir, 'src'));
    await commitCommand({ type: 'feat', message: 'add files', all: true });
    expect(captureGitPaths(['show', '--name-only', '--format=', 'HEAD'])).toEqual([
      'src/con espacio.ts',
      'src/configuración.ts',
    ]);
  });

  it('release start reads the version from tags when package.json has none', async () => {
    const r = repo({ initialCommit: false });
    r.commit('feat: initial', {
      'package.json': '{\n  "name": "app",\n  "private": true\n}\n',
      '.gitwizrc.json': JSON.stringify({ mainBranch: 'main', developBranch: 'main', tagPrefix: 'v' }),
    });
    r.git('tag', '-a', 'v2.0.0', '-m', 'Release 2.0.0');
    r.commit('fix: patch it', { 'a.txt': 'x' });

    await releaseStartCommand({ patch: true });
    expect(getCurrentBranch()).toBe('release/2.0.1');
    // The manifest without a version is left exactly as it was.
    expect(JSON.parse(captureGit(['show', 'HEAD:package.json']))).toEqual({ name: 'app', private: true });
  });

  it('release finish refuses to start with unrelated uncommitted changes', async () => {
    const r = repo({ initialCommit: false });
    r.commit('feat: initial', {
      '.gitwizrc.json': JSON.stringify({ mainBranch: 'main', developBranch: 'main', tagPrefix: 'v' }),
    });
    r.git('branch', 'release/1.0.0');
    r.writeFile('wip.txt', 'half done');
    await expect(releaseFinishCommand({ yes: true })).rejects.toThrow(/uncommitted changes/);
    expect(tagExists('v1.0.0')).toBe(false);
    expect(getCurrentBranch()).toBe('main');
  });

  it('release start --minor then finish --yes run fully headless', async () => {
    const r = repo({ initialCommit: false });
    r.commit('feat: initial', {
      'package.json': '{\n  "name": "x",\n  "version": "1.0.0"\n}\n',
      '.gitwizrc.json': JSON.stringify({ mainBranch: 'main', developBranch: 'main', tagPrefix: 'v' }),
    });

    await releaseStartCommand({ minor: true });
    expect(getCurrentBranch()).toBe('release/1.1.0');
    expect(JSON.parse(captureGit(['show', 'HEAD:package.json'])).version).toBe('1.1.0');

    await releaseFinishCommand({ yes: true });
    expect(getCurrentBranch()).toBe('main');
    expect(tagExists('v1.1.0')).toBe(true);
  });
});
