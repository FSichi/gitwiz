import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { createTempRepo, type TempRepo } from './helpers/temp-repo.js';

describe('loadConfig', () => {
  const repos: TempRepo[] = [];
  const origins: string[] = [];
  function repo(): TempRepo {
    const r = createTempRepo();
    repos.push(r);
    return r;
  }
  afterAll(() => {
    for (const r of repos) r.cleanup();
    for (const o of origins) rmSync(o, { recursive: true, force: true, maxRetries: 5 });
  });

  it('falls back to detection: main exists, no develop → trunk mode', () => {
    const r = repo();
    const { config, source } = loadConfig({ cwd: r.dir });
    expect(source).toBe('detected');
    expect(config.mainBranch).toBe('main');
    expect(config.developBranch).toBe('main');
    expect(config.tagPrefix).toBe('v');
  });

  it('detects an existing development branch', () => {
    const r = repo();
    r.git('branch', 'development');
    const { config } = loadConfig({ cwd: r.dir });
    expect(config.developBranch).toBe('development');
  });

  it('.gitwizrc.json wins over detection', () => {
    const r = repo();
    r.git('branch', 'develop');
    r.writeFile('.gitwizrc.json', JSON.stringify({ mainBranch: 'main', developBranch: 'integration', tagPrefix: '' }));
    const { config, source } = loadConfig({ cwd: r.dir });
    expect(source).toBe('rc');
    expect(config.developBranch).toBe('integration');
    expect(config.tagPrefix).toBe('');
  });

  it('package.json "gitwiz" key is used when no rc file exists', () => {
    const r = repo();
    r.writeFile('package.json', JSON.stringify({ name: 'x', version: '1.0.0', gitwiz: { developBranch: 'work' } }));
    const { config, source } = loadConfig({ cwd: r.dir });
    expect(source).toBe('package.json');
    expect(config.developBranch).toBe('work');
    // Unset keys still come from detection/defaults.
    expect(config.mainBranch).toBe('main');
    expect(config.branchTypes.length).toBeGreaterThan(0);
  });

  it('partial config keeps defaults for the rest', () => {
    const r = repo();
    r.writeFile('.gitwizrc.json', JSON.stringify({ tagPrefix: '' }));
    const { config } = loadConfig({ cwd: r.dir });
    expect(config.tagPrefix).toBe('');
    expect(config.commitTypes.some((t) => t.type === 'feat')).toBe(true);
    expect(config.release.changelogFile).toBe('CHANGELOG.md');
  });

  it('merges commitTypes over the defaults instead of replacing them', () => {
    const r = repo();
    r.writeFile(
      '.gitwizrc.json',
      JSON.stringify({
        commitTypes: [
          { type: 'ci', changelogSection: 'CI' }, // override one field of a default
          { type: 'wip', description: 'Work in progress' }, // brand new type
          { type: 'style', hidden: true }, // remove a default
        ],
      }),
    );
    const { config } = loadConfig({ cwd: r.dir });

    const ci = config.commitTypes.find((t) => t.type === 'ci')!;
    expect(ci.changelogSection).toBe('CI');
    expect(ci.emoji).toBe('🤖'); // untouched fields keep the default

    const wip = config.commitTypes.find((t) => t.type === 'wip')!;
    expect(wip.description).toBe('Work in progress');
    expect(wip.changelogSection).toBe(false);

    expect(config.commitTypes.some((t) => t.type === 'style')).toBe(false);
    expect(config.commitTypes.some((t) => t.type === 'feat')).toBe(true); // defaults intact
  });

  it('merges branchTypes over the defaults', () => {
    const r = repo();
    r.writeFile(
      '.gitwizrc.json',
      JSON.stringify({
        branchTypes: [
          { type: 'feature', prefix: 'feat/' }, // override the prefix only
          { type: 'spike' }, // new type gets sensible fallbacks
          { type: 'docs', hidden: true },
        ],
      }),
    );
    const { config } = loadConfig({ cwd: r.dir });

    expect(config.branchTypes.find((t) => t.type === 'feature')!.prefix).toBe('feat/');
    expect(config.branchTypes.find((t) => t.type === 'feature')!.base).toBe('develop');
    expect(config.branchTypes.find((t) => t.type === 'spike')!.prefix).toBe('spike/');
    expect(config.branchTypes.some((t) => t.type === 'docs')).toBe(false);
    expect(config.branchTypes.some((t) => t.type === 'hotfix')).toBe(true);
  });

  it('derives protected branches and accepts an explicit list', () => {
    const trunk = repo();
    expect(loadConfig({ cwd: trunk.dir }).config.protectedBranches).toEqual([]);

    const flow = repo();
    flow.git('branch', 'develop');
    expect(loadConfig({ cwd: flow.dir }).config.protectedBranches).toEqual(['main', 'develop']);

    const custom = repo();
    custom.writeFile('.gitwizrc.json', JSON.stringify({ protectedBranches: ['release-line'] }));
    expect(loadConfig({ cwd: custom.dir }).config.protectedBranches).toEqual(['release-line']);
  });

  it('rejects invalid config with the offending path', () => {
    const r = repo();
    r.writeFile('.gitwizrc.json', JSON.stringify({ mainBranch: 42 }));
    expect(() => loadConfig({ cwd: r.dir })).toThrow(/"mainBranch" must be a string/);
  });

  it('rejects unparseable rc files', () => {
    const r = repo();
    r.writeFile('.gitwizrc.json', '{ not json');
    expect(() => loadConfig({ cwd: r.dir })).toThrow(/Could not parse/);
  });
});
