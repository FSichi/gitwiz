import { describe, expect, it } from 'vitest';
import { formatArgs } from '../../src/ui/output.js';

describe('formatArgs (echoed commands)', () => {
  it('quotes arguments with spaces or quotes', () => {
    expect(formatArgs(['commit', '-m', 'fix: a "b" c'])).toBe('commit -m "fix: a \\"b\\" c"');
  });

  it('shows only the first line of a multi-line argument', () => {
    expect(formatArgs(['commit', '-m', 'feat: x\n\nA long body\nthat goes on'])).toBe('commit -m "feat: x …"');
  });
});
