import { describe, expect, it } from 'vitest';
import { buildPrBody } from '../../src/commands/gh-pr.js';
import { parseRepoSlug } from '../../src/core/gh.js';
import { parseRepoWebUrl } from '../../src/core/changelog/render.js';

describe('parseRepoSlug', () => {
  it('extracts owner/repo from an https URL', () => {
    expect(parseRepoSlug('https://github.com/FSichi/gitwiz')).toBe('FSichi/gitwiz');
  });

  it('tolerates a trailing slash', () => {
    expect(parseRepoSlug('https://github.com/FSichi/gitwiz/')).toBe('FSichi/gitwiz');
  });

  it('handles owners and repos with dots and dashes', () => {
    expect(parseRepoSlug('https://github.com/Codetria-Labs/my.repo-name')).toBe(
      'Codetria-Labs/my.repo-name',
    );
  });

  it('returns null for a URL with no repo part', () => {
    expect(parseRepoSlug('https://github.com/FSichi')).toBeNull();
  });

  // The real input is always parseRepoWebUrl's output, so pin that seam: every
  // remote shape a user can have must survive both hops into a usable slug.
  it.each([
    ['git@github.com:FSichi/gitwiz.git', 'FSichi/gitwiz'],
    ['https://github.com/FSichi/gitwiz.git', 'FSichi/gitwiz'],
    ['ssh://git@github.com/Codetria-Labs/Fluentia.git', 'Codetria-Labs/Fluentia'],
    ['https://github.com/Codetria-Labs/Fluentia', 'Codetria-Labs/Fluentia'],
  ])('turns the remote %s into %s', (remote, expected) => {
    const web = parseRepoWebUrl(remote);
    expect(web?.host).toBe('github');
    expect(parseRepoSlug(web!.url)).toBe(expected);
  });
});

describe('buildPrBody', () => {
  it('returns an empty string when there are no commits', () => {
    expect(buildPrBody([])).toBe('');
  });

  it('renders one bullet per commit under a Changes heading', () => {
    const body = buildPrBody(['feat(core): add gh runner', 'fix(pr): handle empty body']);
    expect(body).toContain('## Changes');
    expect(body).toContain('- feat(core): add gh runner');
    expect(body).toContain('- fix(pr): handle empty body');
  });

  it('keeps commit subjects verbatim, including markdown-ish characters', () => {
    expect(buildPrBody(['fix: escape `backticks` and *stars*'])).toContain(
      '- fix: escape `backticks` and *stars*',
    );
  });
});
