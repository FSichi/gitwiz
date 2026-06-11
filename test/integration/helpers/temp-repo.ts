import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface TempRepo {
  dir: string;
  /** Run git in the repo, throw on failure, return trimmed stdout. */
  git(...args: string[]): string;
  writeFile(relPath: string, content: string): void;
  /** Write files (optional) and commit everything with the given message. */
  commit(message: string, files?: Record<string, string>): void;
  /** Create a bare sibling repo, add it as `origin`, push main. Returns its path. */
  addBareOrigin(): string;
  cleanup(): void;
}

function execGit(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${result.stderr}`);
  }
  return (result.stdout ?? '').trim();
}

export function createTempRepo(options: { initialCommit?: boolean } = {}): TempRepo {
  const { initialCommit = true } = options;
  const dir = mkdtempSync(join(tmpdir(), 'gitwiz-test-'));

  const git = (...args: string[]) => execGit(dir, args);

  git('init', '-b', 'main');
  git('config', 'user.name', 'Test User');
  git('config', 'user.email', 'test@example.com');
  git('config', 'core.autocrlf', 'false');
  git('config', 'commit.gpgsign', 'false');

  const writeFile = (relPath: string, content: string) => {
    const abs = join(dir, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  };

  const commit = (message: string, files?: Record<string, string>) => {
    if (files) {
      for (const [rel, content] of Object.entries(files)) writeFile(rel, content);
    }
    git('add', '-A');
    git('commit', '-m', message, '--allow-empty');
  };

  if (initialCommit) {
    commit('chore: initial commit', { 'README.md': '# Test repo\n' });
  }

  const addBareOrigin = () => {
    const bareDir = mkdtempSync(join(tmpdir(), 'gitwiz-origin-'));
    execGit(bareDir, ['init', '--bare', '-b', 'main']);
    git('remote', 'add', 'origin', bareDir);
    git('push', '-u', 'origin', 'main');
    return bareDir;
  };

  const cleanup = () => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  };

  return { dir, git, writeFile, commit, addBareOrigin, cleanup };
}
