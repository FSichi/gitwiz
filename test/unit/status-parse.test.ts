import { describe, expect, it } from 'vitest';
import { parsePorcelainV2 } from '../../src/commands/status.js';

describe('parsePorcelainV2', () => {
  it('parses branch, upstream and ahead/behind', () => {
    const out = [
      '# branch.oid abc',
      '# branch.head feature/login',
      '# branch.upstream origin/feature/login',
      '# branch.ab +2 -1',
    ].join('\n');
    const info = parsePorcelainV2(out);
    expect(info.branch).toBe('feature/login');
    expect(info.upstream).toBe('origin/feature/login');
    expect(info.ahead).toBe(2);
    expect(info.behind).toBe(1);
  });

  it('detects detached HEAD', () => {
    expect(parsePorcelainV2('# branch.head (detached)').branch).toBeNull();
  });

  it('groups staged, unstaged, untracked and conflicted files', () => {
    const out = [
      '# branch.head main',
      '1 M. N... 100644 100644 100644 abc def staged-only.ts',
      '1 .M N... 100644 100644 100644 abc def unstaged-only.ts',
      '1 MM N... 100644 100644 100644 abc def both.ts',
      '2 R. N... 100644 100644 100644 abc def R100 renamed-new.ts\trenamed-old.ts',
      'u UU N... 100644 100644 100644 100644 abc def ghi conflicted.ts',
      '? brand-new.ts',
    ].join('\n');
    const info = parsePorcelainV2(out);
    expect(info.staged).toEqual(['staged-only.ts', 'both.ts', 'renamed-new.ts']);
    expect(info.unstaged).toEqual(['unstaged-only.ts', 'both.ts']);
    expect(info.untracked).toEqual(['brand-new.ts']);
    expect(info.conflicted).toEqual(['conflicted.ts']);
  });
});
