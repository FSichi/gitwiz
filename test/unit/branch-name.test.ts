import { describe, expect, it } from 'vitest';
import { normalizeBranchName, validateBranchName } from '../../src/core/branch-name.js';

describe('normalizeBranchName', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(normalizeBranchName('My Cool Feature')).toBe('my-cool-feature');
  });
  it('strips characters git refs disallow', () => {
    expect(normalizeBranchName('fix: weird~chars^here?')).toBe('fix-weird-chars-here');
  });
  it('collapses repeats and trims edge punctuation', () => {
    expect(normalizeBranchName('--hello..world--')).toBe('hello.world');
  });
  it('drops a trailing .lock', () => {
    expect(normalizeBranchName('thing.lock')).toBe('thing');
  });
  it('handles unicode by replacing it', () => {
    expect(normalizeBranchName('añadir botón')).toBe('a-adir-bot-n');
  });
});

describe('validateBranchName', () => {
  it('rejects empty names', () => {
    expect(validateBranchName('')).toMatch(/empty/);
  });
  it('rejects overly long names', () => {
    expect(validateBranchName('a'.repeat(101))).toMatch(/long/);
  });
  it('accepts normalized names', () => {
    expect(validateBranchName('my-cool-feature')).toBeNull();
  });
});
