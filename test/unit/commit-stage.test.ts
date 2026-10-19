import { describe, expect, it } from 'vitest';
import { parseStageableFiles } from '../../src/commands/commit.js';

// `git status --porcelain -z`: "XY path\0", a rename followed by its old path.
const z = (...entries: string[]) => `${entries.join('\0')}\0`;

describe('parseStageableFiles', () => {
  it('keeps names with spaces and accents verbatim (no C-quoting)', () => {
    expect(parseStageableFiles(z(' M src/con espacio.ts', '?? src/configuración.ts'))).toEqual([
      'src/con espacio.ts',
      'src/configuración.ts',
    ]);
  });

  it('skips files that are only staged — they need no staging', () => {
    expect(parseStageableFiles(z('M  staged.ts', 'MM both.ts', 'A  added.ts'))).toEqual(['both.ts']);
  });

  it('takes the new path of a rename and does not mistake the old one for a file', () => {
    expect(parseStageableFiles(z('RM new name.ts', 'old name.ts', ' D gone.ts'))).toEqual([
      'new name.ts',
      'gone.ts',
    ]);
  });

  it('returns nothing for a clean tree', () => {
    expect(parseStageableFiles('')).toEqual([]);
  });
});
