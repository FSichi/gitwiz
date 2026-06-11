import { describe, expect, it } from 'vitest';
import { mergeChangelog } from '../../../src/core/changelog/merge.js';

const SECTION = ['## [1.1.0](https://example.com/compare/v1.0.0...v1.1.0) (2026-06-11)', '', '### Features', '', '* add things (abc1234)'].join('\n');

describe('mergeChangelog', () => {
  it('creates a canonical changelog when none exists', () => {
    const result = mergeChangelog(null, SECTION, '1.1.0');
    expect(result).toBe(
      `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n${SECTION}\n`,
    );
  });

  it('treats an empty file like a missing one', () => {
    const result = mergeChangelog('  \n', SECTION, '1.1.0');
    expect(result.startsWith('# Changelog\n')).toBe(true);
  });

  it('inserts the new release above existing ones, preserving them', () => {
    const existing = [
      '# Changelog',
      '',
      'All notable changes to this project will be documented in this file.',
      '',
      '## [1.0.0](https://example.com/tags/v1.0.0) (2026-01-01)',
      '',
      '### Features',
      '',
      '* first feature (aaa1111)',
      '',
    ].join('\n');

    const result = mergeChangelog(existing, SECTION, '1.1.0');
    const i110 = result.indexOf('## [1.1.0]');
    const i100 = result.indexOf('## [1.0.0]');
    expect(i110).toBeGreaterThan(-1);
    expect(i100).toBeGreaterThan(i110);
    expect(result).toContain('* first feature (aaa1111)');
    // The boilerplate header appears exactly once.
    expect(result.match(/# Changelog/g)).toHaveLength(1);
  });

  it('preserves a custom preamble verbatim (badges, custom intro)', () => {
    const existing = [
      '# My Project Changelog 🚀',
      '',
      '![badge](https://img.shields.io/badge/x-y-blue)',
      '',
      'Some custom intro text.',
      '',
      '## 1.0.0 (2026-01-01)',
      '',
      '* stuff',
    ].join('\n');

    const result = mergeChangelog(existing, SECTION, '1.1.0');
    expect(result.startsWith('# My Project Changelog 🚀\n\n![badge](https://img.shields.io/badge/x-y-blue)\n\nSome custom intro text.\n\n## [1.1.0]')).toBe(true);
    expect(result).toContain('## 1.0.0 (2026-01-01)');
    expect(result).not.toContain('All notable changes');
  });

  it('replaces an existing block for the same version (idempotent re-runs)', () => {
    const existing = [
      '# Changelog',
      '',
      '## [1.1.0](https://example.com/compare/v1.0.0...v1.1.0) (2026-06-10)',
      '',
      '* old stale entry (zzz9999)',
      '',
      '## [1.0.0](https://example.com/tags/v1.0.0) (2026-01-01)',
      '',
      '* first feature (aaa1111)',
    ].join('\n');

    const result = mergeChangelog(existing, SECTION, '1.1.0');
    expect(result).not.toContain('old stale entry');
    expect(result).toContain('* add things (abc1234)');
    expect(result.match(/## \[1\.1\.0\]/g)).toHaveLength(1);
    expect(result).toContain('## [1.0.0]');
  });

  it('round-trips CRLF files as CRLF', () => {
    const existing = '# Changelog\r\n\r\n## 1.0.0 (2026-01-01)\r\n\r\n* old (aaa)\r\n';
    const result = mergeChangelog(existing, SECTION, '1.1.0');
    expect(result).toContain('\r\n');
    // Every newline is CRLF — no orphan LFs.
    expect(result.replace(/\r\n/g, '')).not.toContain('\n');
    expect(result).toContain('## [1.1.0]');
    expect(result).toContain('## 1.0.0 (2026-01-01)');
  });

  it('ends with exactly one trailing newline', () => {
    const result = mergeChangelog(null, SECTION, '1.1.0');
    expect(result.endsWith('\n')).toBe(true);
    expect(result.endsWith('\n\n')).toBe(false);
  });

  it('handles version headings in various formats', () => {
    const existing = [
      '# Changelog',
      '',
      '## v1.1.0 (2026-06-10)',
      '',
      '* stale plain-style entry',
    ].join('\n');
    const result = mergeChangelog(existing, SECTION, '1.1.0');
    expect(result).not.toContain('stale plain-style entry');
  });

  it('ingests a keep-a-changelog style file (real Codetria project format)', () => {
    const existing = [
      '# Changelog',
      '',
      'All notable changes to this project will be documented in this file.',
      '',
      '## [2.9.2] - 2025-07-28',
      '',
      '### 🛠 Fixes',
      '',
      '- Implement field mapping for kiosk ranking pagination sorting',
      '',
      '## [2.9.1] - 2025-07-25',
      '',
      '### 💥 Hotfixes',
      '',
      '- Fix statistics refresh for views without last_update column',
      '',
    ].join('\n');

    const result = mergeChangelog(existing, SECTION, '1.1.0');
    expect(result).toContain('## [1.1.0]');
    expect(result).toContain('## [2.9.2] - 2025-07-28');
    expect(result).toContain('## [2.9.1] - 2025-07-25');
    expect(result).toContain('- Implement field mapping for kiosk ranking pagination sorting');
    expect(result.match(/All notable changes/g)).toHaveLength(1);

    // Replacing one of ITS versions works too (bracket-no-link headings).
    const replaced = mergeChangelog(existing, '## [2.9.2] - 2025-07-29\n\n* regenerated', '2.9.2');
    expect(replaced).not.toContain('Implement field mapping');
    expect(replaced.match(/## \[2\.9\.2\]/g)).toHaveLength(1);
  });

  it('ingests a changelog generated by conventional-changelog (old package style)', () => {
    const existing = [
      '# Changelog',
      '',
      'All notable changes to this project will be documented in this file.',
      '',
      '## [1.0.5](https://github.com/Codetria-Labs/x/compare/1.0.4...1.0.5) (2026-02-15)',
      '',
      '### Features',
      '',
      '* **release:** improved flow ([53789f8](https://github.com/Codetria-Labs/x/commit/53789f8))',
      '',
      '### Bug Fixes',
      '',
      '* **release:** fix regex ([9eb7910](https://github.com/Codetria-Labs/x/commit/9eb7910))',
      '',
    ].join('\n');

    const result = mergeChangelog(existing, SECTION, '1.1.0');
    expect(result).toContain('## [1.1.0]');
    expect(result).toContain('## [1.0.5]');
    expect(result).toContain('* **release:** fix regex');
    expect(result.match(/All notable changes/g)).toHaveLength(1);
  });
});
