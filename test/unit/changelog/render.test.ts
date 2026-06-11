import { describe, expect, it } from 'vitest';
import type { ConventionalCommit } from '../../../src/core/changelog/parse.js';
import { parseRepoWebUrl, renderReleaseSection } from '../../../src/core/changelog/render.js';
import { DEFAULT_COMMIT_TYPES } from '../../../src/core/config.js';

function commit(over: Partial<ConventionalCommit>): ConventionalCommit {
  return {
    hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    shortHash: 'aaaaaaa',
    type: 'feat',
    scope: null,
    breaking: false,
    description: 'do something',
    breakingNote: null,
    ...over,
  };
}

const GH = parseRepoWebUrl('git@github.com:acme/rocket.git');

describe('parseRepoWebUrl', () => {
  it('parses SSH github remotes', () => {
    expect(GH).toEqual({ url: 'https://github.com/acme/rocket', host: 'github' });
  });
  it('parses HTTPS remotes and strips .git', () => {
    expect(parseRepoWebUrl('https://gitlab.com/acme/rocket.git')).toEqual({
      url: 'https://gitlab.com/acme/rocket',
      host: 'gitlab',
    });
  });
  it('returns null for unknown formats and missing remotes', () => {
    expect(parseRepoWebUrl(null)).toBeNull();
    expect(parseRepoWebUrl('/some/local/path')).toBeNull();
  });
});

describe('renderReleaseSection', () => {
  const base = {
    version: '1.1.0',
    date: '2026-06-11',
    tagPrefix: 'v',
    previousTag: 'v1.0.0' as string | null,
    web: GH,
    commitTypes: DEFAULT_COMMIT_TYPES,
  };

  it('renders compare link, sections in config order, commit links', () => {
    const out = renderReleaseSection(
      [
        commit({ type: 'fix', description: 'repair the thing', scope: 'core' }),
        commit({ type: 'feat', description: 'add the thing' }),
        commit({ type: 'chore', description: 'hidden from changelog' }),
      ],
      base,
    );
    expect(out).toContain('## [1.1.0](https://github.com/acme/rocket/compare/v1.0.0...v1.1.0) (2026-06-11)');
    expect(out.indexOf('### Features')).toBeLessThan(out.indexOf('### Bug Fixes'));
    expect(out).toContain('* add the thing ([aaaaaaa](https://github.com/acme/rocket/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa))');
    expect(out).toContain('* **core:** repair the thing');
    expect(out).not.toContain('hidden from changelog');
  });

  it('puts breaking changes first', () => {
    const out = renderReleaseSection(
      [
        commit({ type: 'feat', description: 'normal feature' }),
        commit({ type: 'feat', description: 'dangerous', breaking: true, breakingNote: 'API v1 removed' }),
      ],
      base,
    );
    expect(out.indexOf('### ⚠ Breaking Changes')).toBeLessThan(out.indexOf('### Features'));
    expect(out).toContain('* API v1 removed');
  });

  it('uses a tag link for the first release', () => {
    const out = renderReleaseSection([commit({})], { ...base, previousTag: null });
    expect(out).toContain('## [1.1.0](https://github.com/acme/rocket/releases/tag/v1.1.0)');
  });

  it('degrades to plain text without a remote', () => {
    const out = renderReleaseSection([commit({})], { ...base, web: null });
    expect(out).toContain('## 1.1.0 (2026-06-11)');
    expect(out).toContain('(aaaaaaa)');
    expect(out).not.toContain('https://');
  });

  it('says so when there are no notable changes', () => {
    const out = renderReleaseSection([commit({ type: 'chore' })], base);
    expect(out).toContain('_No notable changes._');
  });
});
