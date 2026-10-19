import { describe, expect, it } from 'vitest';
import { mergeInitSettings } from '../../src/commands/init.js';

const answers = { mainBranch: 'main', developBranch: 'develop', tagPrefix: '', language: 'es' as const };

describe('mergeInitSettings', () => {
  // Re-running `gitwiz init` used to overwrite the whole file.
  it('keeps keys the wizard does not ask about', () => {
    const existing = {
      mainBranch: 'master',
      commitTypes: [{ type: 'wip', hidden: true }],
      release: { alsoMergeToMain: true },
    };
    expect(mergeInitSettings(existing, answers)).toEqual({
      mainBranch: 'main',
      developBranch: 'develop',
      tagPrefix: '',
      language: 'es',
      commitTypes: [{ type: 'wip', hidden: true }],
      release: { alsoMergeToMain: true },
    });
  });

  it('stores "auto" as the absence of a language', () => {
    expect(mergeInitSettings({ language: 'en' }, { ...answers, language: 'auto' })).not.toHaveProperty('language');
  });

  it('starts fresh from anything that is not an object', () => {
    expect(mergeInitSettings(null, answers)).toEqual(answers);
    expect(mergeInitSettings(['x'], answers)).toEqual(answers);
  });
});
