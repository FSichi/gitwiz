import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectPackageManager } from '../../src/commands/update.js';
import { isCheckDue, pendingUpdate, updateCachePath } from '../../src/core/update-checker.js';

describe('detectPackageManager', () => {
  it.each([
    ['C:\\Users\\me\\AppData\\Local\\Author Software\\nvm\\installs\\v24.21.0\\node_modules\\@fsichi\\gitwiz\\dist\\main.js', 'npm'],
    ['/usr/local/lib/node_modules/@fsichi/gitwiz/dist/main.js', 'npm'],
    ['/home/me/.local/share/pnpm/global/5/node_modules/@fsichi/gitwiz/dist/main.js', 'pnpm'],
    ['C:\\Users\\me\\AppData\\Local\\pnpm\\global\\5\\node_modules\\@fsichi\\gitwiz\\dist\\main.js', 'pnpm'],
    ['/home/me/.config/yarn/global/node_modules/@fsichi/gitwiz/dist/main.js', 'yarn'],
    ['C:\\Users\\me\\AppData\\Local\\Yarn\\Data\\global\\node_modules\\@fsichi\\gitwiz\\dist\\main.js', 'yarn'],
    ['/home/me/.bun/install/global/node_modules/@fsichi/gitwiz/dist/main.js', 'bun'],
  ])('%s → %s', (path, expected) => {
    expect(detectPackageManager(path)).toBe(expected);
  });
});

describe('update check', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('announces only a strictly newer version', () => {
    expect(pendingUpdate({ lastCheck: 0, latest: '1.5.0' }, '1.4.0')).toBe('1.5.0');
    expect(pendingUpdate({ lastCheck: 0, latest: '1.4.0' }, '1.4.0')).toBeNull();
    expect(pendingUpdate({ lastCheck: 0, latest: '1.3.9' }, '1.4.0')).toBeNull();
    expect(pendingUpdate({ lastCheck: 0 }, '1.4.0')).toBeNull();
    expect(pendingUpdate({ lastCheck: 0, latest: 'garbage' }, '1.4.0')).toBeNull();
    expect(pendingUpdate(null, '1.4.0')).toBeNull();
  });

  it('asks the registry at most once a day', () => {
    const now = 10 * DAY;
    expect(isCheckDue(null, now)).toBe(true);
    expect(isCheckDue({ lastCheck: now - DAY + 1 }, now)).toBe(false);
    expect(isCheckDue({ lastCheck: now - DAY }, now)).toBe(true);
  });

  it('keeps its cache under XDG_CONFIG_HOME when set', () => {
    expect(updateCachePath({ XDG_CONFIG_HOME: join('x', 'cfg') })).toBe(
      join('x', 'cfg', 'gitwiz', 'update-check.json'),
    );
  });
});
