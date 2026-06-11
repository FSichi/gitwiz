import { describe, expect, it } from 'vitest';
import { parseCommitRecord } from '../../../src/core/changelog/parse.js';

const US = '\x1f';

function record(subject: string, body = ''): string {
  return ['abc123full', 'abc123', subject, body].join(US);
}

describe('parseCommitRecord', () => {
  it('parses a plain conventional subject', () => {
    const c = parseCommitRecord(record('feat: add login'))!;
    expect(c).toMatchObject({ type: 'feat', scope: null, breaking: false, description: 'add login' });
  });

  it('parses scope and breaking bang', () => {
    const c = parseCommitRecord(record('fix(api)!: drop legacy param'))!;
    expect(c).toMatchObject({ type: 'fix', scope: 'api', breaking: true, description: 'drop legacy param' });
  });

  it('detects BREAKING CHANGE in the body', () => {
    const c = parseCommitRecord(record('feat: new auth', 'BREAKING CHANGE: tokens are invalidated\nmigrate by re-logging in'))!;
    expect(c.breaking).toBe(true);
    expect(c.breakingNote).toContain('tokens are invalidated');
  });

  it('returns type null for non-conventional subjects', () => {
    const c = parseCommitRecord(record('Fixed stuff quickly'))!;
    expect(c.type).toBeNull();
    expect(c.description).toBe('Fixed stuff quickly');
  });

  it('uppercases types are normalized to lowercase', () => {
    const c = parseCommitRecord(record('Feat: shiny'))!;
    expect(c.type).toBe('feat');
  });

  it('handles multiline bodies without breaking fields', () => {
    const c = parseCommitRecord(record('chore: tidy', 'line one\nline two\n\nline four'))!;
    expect(c.type).toBe('chore');
    expect(c.breaking).toBe(false);
  });

  it('returns null for malformed records', () => {
    expect(parseCommitRecord('')).toBeNull();
  });
});
