import { describe, expect, it } from 'vitest';
import { buildCommitHeader, buildCommitMessage, normalizeScope } from '../../src/core/commit-message.js';

describe('buildCommitMessage', () => {
  it('builds type: description', () => {
    expect(buildCommitMessage({ type: 'feat', description: 'add login' })).toBe('feat: add login');
  });
  it('builds type(scope): description', () => {
    expect(buildCommitMessage({ type: 'fix', scope: 'api', description: 'repair' })).toBe('fix(api): repair');
  });
  it('adds ! and BREAKING CHANGE footer', () => {
    expect(
      buildCommitMessage({
        type: 'feat',
        scope: 'auth',
        description: 'rotate tokens',
        breaking: true,
        breakingDescription: 'all sessions are invalidated',
      }),
    ).toBe('feat(auth)!: rotate tokens\n\nBREAKING CHANGE: all sessions are invalidated');
  });
  it('breaking without footer text only adds the bang', () => {
    expect(buildCommitMessage({ type: 'feat', description: 'x', breaking: true })).toBe('feat!: x');
  });
  it('header trims the description', () => {
    expect(buildCommitHeader({ type: 'docs', description: '  spaced  ' })).toBe('docs: spaced');
  });
});

describe('normalizeScope', () => {
  it('lowercases and hyphenates', () => {
    expect(normalizeScope('User API')).toBe('user-api');
  });
  it('strips invalid characters', () => {
    expect(normalizeScope('weird!scope?')).toBe('weirdscope');
  });
});
