import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyVersion, bumpPreviews, readPackageVersion } from '../../src/core/version.js';

describe('bumpPreviews', () => {
  it('computes major/minor/patch', () => {
    expect(bumpPreviews('1.2.3')).toEqual({ major: '2.0.0', minor: '1.3.0', patch: '1.2.4' });
  });
  it('throws on invalid current version', () => {
    expect(() => bumpPreviews('banana')).toThrow(/not valid semver/);
  });
});

describe('applyVersion', () => {
  const dirs: string[] = [];
  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'wizgit-ver-'));
    dirs.push(dir);
    return dir;
  }
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('updates package.json preserving 4-space indent, key order and trailing newline', () => {
    const dir = tempDir();
    const original = `{\n    "name": "x",\n    "version": "1.0.0",\n    "license": "MIT"\n}\n`;
    writeFileSync(join(dir, 'package.json'), original);

    const changed = applyVersion(dir, '1.1.0');
    expect(changed).toEqual(['package.json']);

    const result = readFileSync(join(dir, 'package.json'), 'utf8');
    expect(result).toBe(`{\n    "name": "x",\n    "version": "1.1.0",\n    "license": "MIT"\n}\n`);
  });

  it('preserves CRLF line endings', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'package.json'), `{\r\n  "name": "x",\r\n  "version": "1.0.0"\r\n}\r\n`);
    applyVersion(dir, '2.0.0');
    const result = readFileSync(join(dir, 'package.json'), 'utf8');
    expect(result).toContain('\r\n');
    expect(result.replace(/\r\n/g, '')).not.toContain('\n');
    expect(result).toContain('"version": "2.0.0"');
  });

  it('updates package-lock.json top-level and root package versions', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'package.json'), `{\n  "name": "x",\n  "version": "1.0.0"\n}\n`);
    writeFileSync(
      join(dir, 'package-lock.json'),
      JSON.stringify({ name: 'x', version: '1.0.0', packages: { '': { name: 'x', version: '1.0.0' } } }, null, 2) + '\n',
    );

    const changed = applyVersion(dir, '1.0.1');
    expect(changed).toEqual(['package.json', 'package-lock.json']);

    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
    expect(lock.version).toBe('1.0.1');
    expect(lock.packages[''].version).toBe('1.0.1');
  });

  it('rejects invalid versions', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'package.json'), '{"version":"1.0.0"}');
    expect(() => applyVersion(dir, 'not-a-version')).toThrow(/not a valid semver/);
  });
});

describe('readPackageVersion', () => {
  it('throws a helpful error when package.json is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wizgit-nopkg-'));
    try {
      expect(() => readPackageVersion(dir)).toThrow(/No package.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
