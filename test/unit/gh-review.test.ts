import { describe, expect, it } from 'vitest';
import { parsePrNumber, verdictFromFlags } from '../../src/commands/gh-review.js';

describe('verdictFromFlags', () => {
  it('returns null when no verdict flag is passed', () => {
    expect(verdictFromFlags({})).toBeNull();
    expect(verdictFromFlags({ pr: '3', json: true })).toBeNull();
  });

  it('approves with an optional comment', () => {
    expect(verdictFromFlags({ approve: true })).toEqual({ verdict: 'approve', body: '' });
    expect(verdictFromFlags({ approve: true, comment: 'LGTM' })).toEqual({ verdict: 'approve', body: 'LGTM' });
  });

  // GitHub rejects a change request without a body — fail before calling gh.
  it('requires a comment to request changes', () => {
    expect(() => verdictFromFlags({ requestChanges: true })).toThrow(/Say what needs to change/);
    expect(verdictFromFlags({ requestChanges: true, comment: 'rename it' })).toEqual({
      verdict: 'request-changes',
      body: 'rename it',
    });
  });

  it('treats a lone --comment as a comment review, but not an empty one', () => {
    expect(verdictFromFlags({ comment: 'nice' })).toEqual({ verdict: 'comment', body: 'nice' });
    expect(() => verdictFromFlags({ comment: '  ' })).toThrow(/cannot be empty/);
  });

  it('rejects two verdicts at once', () => {
    expect(() => verdictFromFlags({ approve: true, requestChanges: true, comment: 'x' })).toThrow(/only one/);
  });
});

describe('parsePrNumber', () => {
  it('accepts "12" and "#12"', () => {
    expect(parsePrNumber('12')).toBe(12);
    expect(parsePrNumber('#12')).toBe(12);
  });

  it.each(['abc', '0', '-3', '1.5', ''])('rejects %j', (value) => {
    expect(() => parsePrNumber(value)).toThrow(/not a pull request number/);
  });
});
