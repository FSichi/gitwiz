import { describe, expect, it } from 'vitest';
import { resolveMessageFlags } from '../../src/commands/commit.js';
import {
  buildCommitHeader,
  buildCommitMessage,
  normalizeScope,
  parseCommitHeader,
} from '../../src/core/commit-message.js';

const TYPES = ['feat', 'fix', 'docs', 'chore'];

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

  it('puts the body after a blank line', () => {
    expect(buildCommitMessage({ type: 'fix', description: 'x', body: 'Why it broke.\n\nHow it is fixed.' })).toBe(
      'fix: x\n\nWhy it broke.\n\nHow it is fixed.',
    );
  });

  // The BREAKING CHANGE footer joins trailers already ending the body, so they
  // stay one final block (GitHub reads trailers from the last paragraph).
  it('joins the breaking footer to trailing trailers instead of splitting them', () => {
    expect(
      buildCommitMessage({
        type: 'feat',
        description: 'x',
        breaking: true,
        breakingDescription: 'v1 removed',
        body: 'Details.\n\nRefs #12',
      }),
    ).toBe('feat!: x\n\nDetails.\n\nBREAKING CHANGE: v1 removed\nRefs #12');
  });
});

describe('parseCommitHeader', () => {
  it('splits a full conventional header', () => {
    expect(parseCommitHeader('feat(auth)!: add login', TYPES)).toEqual({
      type: 'feat',
      scope: 'auth',
      breaking: true,
      description: 'add login',
    });
  });

  it('ignores prefixes that are not configured types', () => {
    expect(parseCommitHeader('Note: keep this', TYPES)).toBeNull();
    expect(parseCommitHeader('plain description', TYPES)).toBeNull();
  });
});

describe('resolveMessageFlags', () => {
  // Agents write the whole header into -m; it used to come out "feat: feat(auth): …".
  it('takes type and scope from a full header in -m', () => {
    expect(resolveMessageFlags({ message: 'feat(auth): add login' }, TYPES)).toMatchObject({
      type: 'feat',
      scope: 'auth',
      message: 'add login',
    });
  });

  it('accepts a matching --type and keeps an explicit --scope', () => {
    expect(resolveMessageFlags({ type: 'fix', scope: 'api', message: 'fix(core): x' }, TYPES)).toMatchObject({
      type: 'fix',
      scope: 'api',
      message: 'x',
    });
  });

  it('rejects a header that contradicts --type', () => {
    expect(() => resolveMessageFlags({ type: 'feat', message: 'fix: x' }, TYPES)).toThrow(/--type is "feat"/);
  });

  it('turns the lines after the first into the body, before --body', () => {
    expect(resolveMessageFlags({ message: 'chore: tidy\n\nRemoved dead code.', body: 'More.' }, TYPES)).toMatchObject({
      type: 'chore',
      message: 'tidy',
      body: 'Removed dead code.\n\nMore.',
    });
  });

  it('leaves a plain description alone', () => {
    expect(resolveMessageFlags({ type: 'docs', message: 'Note: typo' }, TYPES)).toMatchObject({
      type: 'docs',
      message: 'Note: typo',
    });
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
