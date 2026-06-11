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
