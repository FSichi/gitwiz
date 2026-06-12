import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BLOCK_END,
  BLOCK_START,
  buildAgentInstructions,
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
    expect(block).toContain('gitwiz commit --type feat');
    expect(block).toContain('gitwiz release start --minor');
    expect(block).toContain('gitwiz release finish --yes');
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
});
