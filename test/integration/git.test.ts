import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import {
  captureGit,
  getAheadBehind,
  getCurrentBranch,
  getInProgressOperation,
  getUpstream,
  hasRemote,
  isCommitPushed,
  isGitRepo,
  isWorkingTreeClean,
  localBranchExists,
  remoteBranchExists,
  runGit,
  tagExists,
  tryCaptureGit,
} from '../../src/core/git.js';
import { createTempRepo, type TempRepo } from './helpers/temp-repo.js';

describe('core/git', () => {
  const repos: TempRepo[] = [];
  const origins: string[] = [];

  function repo(options?: { initialCommit?: boolean }): TempRepo {
    const r = createTempRepo(options);
    repos.push(r);
    return r;
  }

  afterAll(() => {
    for (const r of repos) r.cleanup();
    for (const o of origins) rmSync(o, { recursive: true, force: true, maxRetries: 5 });
  });

  it('detects git repos and branches', () => {
    const r = repo();
    const opts = { cwd: r.dir };

    expect(isGitRepo(opts)).toBe(true);
    expect(getCurrentBranch(opts)).toBe('main');
    expect(isWorkingTreeClean(opts)).toBe(true);
    expect(localBranchExists('main', opts)).toBe(true);
    expect(localBranchExists('nope', opts)).toBe(false);

    r.writeFile('dirty.txt', 'hello');
    expect(isWorkingTreeClean(opts)).toBe(false);
  });

  it('runGit creates branches with arg arrays (no shell)', () => {
    const r = repo();
    const opts = { cwd: r.dir };

    runGit(['switch', '-c', 'feature/spaces-are-fine'], opts);
    expect(getCurrentBranch(opts)).toBe('feature/spaces-are-fine');
  });

  it('commits messages containing quotes and $ verbatim', () => {
    const r = repo();
    const opts = { cwd: r.dir };
    const tricky = 'feat: handle "quotes" and $VARS & ampersands';

    r.writeFile('a.txt', 'x');
    runGit(['add', '-A'], opts);
    runGit(['commit', '-m', tricky], opts);
    expect(captureGit(['log', '-1', '--format=%s'], opts)).toBe(tricky);
  });

  it('tryCaptureGit returns null on failure instead of throwing', () => {
    const r = repo();
    expect(tryCaptureGit(['rev-parse', '-q', '--verify', 'refs/heads/ghost'], { cwd: r.dir })).toBeNull();
  });

  it('tracks remotes, upstreams and ahead/behind counts', () => {
    const r = repo();
    const opts = { cwd: r.dir };
    expect(hasRemote(opts)).toBe(false);

    origins.push(r.addBareOrigin());
    expect(hasRemote(opts)).toBe(true);
    expect(getUpstream(opts)).toBe('origin/main');
    expect(remoteBranchExists('main', opts)).toBe(true);

    const pushedHead = captureGit(['rev-parse', 'HEAD'], opts);
    expect(isCommitPushed(pushedHead, opts)).toBe(true);

    r.commit('feat: local only');
    expect(getAheadBehind('origin/main', 'HEAD', opts)).toEqual({ ahead: 1, behind: 0 });
    expect(isCommitPushed(captureGit(['rev-parse', 'HEAD'], opts), opts)).toBe(false);
  });

  it('detects tags and in-progress operations', () => {
    const r = repo();
    const opts = { cwd: r.dir };

    expect(tagExists('v1.0.0', opts)).toBe(false);
    runGit(['tag', '-a', 'v1.0.0', '-m', 'Release 1.0.0'], opts);
    expect(tagExists('v1.0.0', opts)).toBe(true);

    expect(getInProgressOperation(opts)).toBeNull();

    // Force a merge conflict to leave a merge in progress.
    r.commit('feat: main change', { 'conflict.txt': 'main version\n' });
    runGit(['switch', '-c', 'other', 'HEAD~1'], opts);
    r.commit('feat: other change', { 'conflict.txt': 'other version\n' });
    runGit(['switch', 'main'], opts);
    const merged = spawnMergeExpectConflict(r);
    expect(merged).toBe(false);
    expect(getInProgressOperation(opts)).toBe('merge');
    runGit(['merge', '--abort'], opts);
    expect(getInProgressOperation(opts)).toBeNull();
  });
});

function spawnMergeExpectConflict(r: TempRepo): boolean {
  try {
    r.git('merge', 'other');
    return true;
  } catch {
    return false;
  }
}
