import { afterEach, describe, expect, it } from 'vitest';
import { branchCommand } from '../../src/commands/branch.js';
import { commitCommand } from '../../src/commands/commit.js';
import { releaseFinishCommand } from '../../src/commands/release-finish.js';
import { releaseStartCommand } from '../../src/commands/release-start.js';
import { captureGit, getCurrentBranch, tagExists } from '../../src/core/git.js';
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
