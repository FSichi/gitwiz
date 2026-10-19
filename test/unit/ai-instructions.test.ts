import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addAgentsImport,
  BLOCK_END,
  BLOCK_START,
  buildAgentInstructions,
  claudeFileMissingImport,
  writeManagedBlock,
} from '../../src/core/ai-instructions.js';
import {
  DEFAULT_BRANCH_TYPES,
  DEFAULT_COMMIT_TYPES,
  type GitwizConfig,
} from '../../src/core/config.js';

function config(over: Partial<GitwizConfig> = {}): GitwizConfig {
  return {
    mainBranch: 'main',
    developBranch: 'develop',
    tagPrefix: 'v',
    language: 'auto',
    protectedBranches: ['main', 'develop'],
    branchTypes: DEFAULT_BRANCH_TYPES,
    commitTypes: DEFAULT_COMMIT_TYPES,
    release: { alsoMergeToMain: false, changelogFile: 'CHANGELOG.md' },
    ...over,
  };
}

describe('buildAgentInstructions', () => {
  it('wraps the content in the managed markers', () => {
    const block = buildAgentInstructions(config());
    expect(block.startsWith(BLOCK_START)).toBe(true);
    expect(block.trimEnd().endsWith(BLOCK_END)).toBe(true);
  });

  it('reflects the configured branches and base mapping', () => {
    const block = buildAgentInstructions(config({ developBranch: 'integration' }));
    expect(block).toContain('`feature/`');
    expect(block).toContain('`hotfix/`');
    expect(block).toContain('branch from `integration`');
    expect(block).toContain('branch from `main`'); // hotfix base
  });

  it('lists commit types and which appear in the changelog', () => {
    const block = buildAgentInstructions(config());
    expect(block).toContain('feat, fix, docs');
    expect(block).toContain('`feat`'); // changelog-visible
    expect(block).toContain('`fix`');
    expect(block).toContain('`perf`');
  });

  it('documents the non-interactive commands', () => {
    const block = buildAgentInstructions(config());
    expect(block).toContain('gitwiz status --json');
    expect(block).toContain('gitwiz commit -m "feat(auth): add login form" -- ');
    expect(block).toContain('--body-file');
    expect(block).toContain('gitwiz gh pr --title');
    expect(block).toContain('gitwiz release start --patch');
    expect(block).toContain('gitwiz release finish --yes');
    expect(block).toContain('gitwiz init --agents');
  });

  // Seen in practice: the old text said a bare command "will hang" (it fails
  // fast) and pointed agents at Co-Authored-By trailers some repos forbid.
  it('does not claim commands hang or suggest co-author trailers', () => {
    const block = buildAgentInstructions(config());
    expect(block).not.toMatch(/\bhang/i);
    expect(block).not.toContain('Co-Authored-By');
  });

  // cmd.exe reports the NVM shim failure in the system language.
  it('names the Windows shim error in English and Spanish, with the fallback', () => {
    const block = buildAgentInstructions(config());
    expect(block).toContain('"C:\\…\\Author" is not recognized');
    expect(block).toContain('"C:\\…\\Author" no se reconoce');
    expect(block).toContain('node "$(npm root -g)/@fsichi/gitwiz/dist/cli.js" <args>');
  });

  it('names the branches a release is merged into', () => {
    expect(buildAgentInstructions(config())).toContain('merges the release into `develop`, tags');
    const both = buildAgentInstructions(config({ release: { alsoMergeToMain: true, changelogFile: 'CHANGELOG.md' } }));
    expect(both).toContain('merges the release into `develop` and `main`');
  });

  it('mentions protected branches when configured', () => {
    const block = buildAgentInstructions(config());
    expect(block).toContain('Never commit directly to `main`, `develop`');
    const none = buildAgentInstructions(config({ protectedBranches: [] }));
    expect(none).not.toContain('Never commit directly');
  });
});

describe('writeManagedBlock', () => {
  const dirs: string[] = [];
  function tempFile(name = 'AGENTS.md'): string {
    const dir = mkdtempSync(join(tmpdir(), 'gitwiz-ai-'));
    dirs.push(dir);
    return join(dir, name);
  }
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const block = `${BLOCK_START}\nhello\n${BLOCK_END}`;
  const header = '# AGENTS.md\n\nHeader text.';

  it('creates a new file with the header and block', () => {
    const path = tempFile();
    expect(writeManagedBlock(path, block, header)).toBe('created');
    const content = readFileSync(path, 'utf8');
    expect(content.startsWith('# AGENTS.md')).toBe(true);
    expect(content).toContain(block);
  });

  it('appends to an existing file that has no block', () => {
    const path = tempFile();
    writeFileSync(path, '# My agents\n\nExisting rules.\n');
    expect(writeManagedBlock(path, block, header)).toBe('updated');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('Existing rules.');
    expect(content).toContain(block);
  });

  it('replaces only the managed block, preserving surrounding content', () => {
    const path = tempFile();
    writeFileSync(path, `Top.\n\n${BLOCK_START}\nold\n${BLOCK_END}\n\nBottom.\n`);
    const next = `${BLOCK_START}\nnew\n${BLOCK_END}`;
    expect(writeManagedBlock(path, next, header)).toBe('updated');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('Top.');
    expect(content).toContain('Bottom.');
    expect(content).toContain('new');
    expect(content).not.toContain('old');
    expect(content.match(new RegExp(BLOCK_START, 'g'))).toHaveLength(1);
  });

  it('is idempotent when run twice', () => {
    const path = tempFile();
    writeManagedBlock(path, block, header);
    const first = readFileSync(path, 'utf8');
    writeManagedBlock(path, block, header);
    expect(readFileSync(path, 'utf8')).toBe(first);
  });

  it('keeps a CRLF file CRLF', () => {
    const path = tempFile();
    writeFileSync(path, '# Rules\r\n\r\nKeep it tidy.\r\n');
    writeManagedBlock(path, block, header);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain(`${BLOCK_START}\r\nhello\r\n${BLOCK_END}`);
    expect(content.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

// Claude Code skips AGENTS.md whenever a CLAUDE.md exists, unless CLAUDE.md imports it.
describe('CLAUDE.md import', () => {
  const dirs: string[] = [];
  function repoDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'gitwiz-claude-'));
    dirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(join(dir, rel, '..'), { recursive: true });
      writeFileSync(join(dir, rel), content);
    }
    return dir;
  }
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('needs nothing when there is no CLAUDE.md (AGENTS.md is read directly)', () => {
    expect(claudeFileMissingImport(repoDir({}))).toBeNull();
  });

  it('adds the import at the top of a root CLAUDE.md, once', () => {
    const dir = repoDir({ 'CLAUDE.md': '# Project rules\n' });
    const target = claudeFileMissingImport(dir)!;
    expect(target).toEqual({ relPath: 'CLAUDE.md', importLine: '@AGENTS.md' });
    addAgentsImport(dir, target);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n\n# Project rules\n');
    expect(claudeFileMissingImport(dir)).toBeNull();
  });

  it('points .claude/CLAUDE.md one folder up', () => {
    const dir = repoDir({ '.claude/CLAUDE.md': 'rules\r\n' });
    const target = claudeFileMissingImport(dir)!;
    expect(target.importLine).toBe('@../AGENTS.md');
    addAgentsImport(dir, target);
    expect(readFileSync(join(dir, '.claude', 'CLAUDE.md'), 'utf8')).toBe('@../AGENTS.md\r\n\r\nrules\r\n');
  });

  it('recognizes an import that is already there', () => {
    expect(claudeFileMissingImport(repoDir({ 'CLAUDE.md': 'intro\n@AGENTS.md\nmore\n' }))).toBeNull();
  });
});
