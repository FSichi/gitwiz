import pc from 'picocolors';
import { captureGhJson, ensureGh } from '../core/gh.js';
import { currentUser, listOrgs } from '../core/gh-project.js';
import { t } from '../ui/i18n.js';
import { emitJson, isJsonMode, log, section } from '../ui/output.js';
import { assertInteractive, select } from '../ui/prompts.js';

export interface GhReposOptions {
  owner?: string;
  limit?: string;
  json?: boolean;
}

interface RepoRow {
  name: string;
  description: string | null;
  visibility: string;
  updatedAt: string;
  url: string;
}

/** Relative age in whole days, for a compact "when did this last move" column. */
export function daysSince(iso: string, now: number): number | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.floor((now - then) / 86_400_000);
}

export function formatAge(days: number | null): string {
  if (days === null) return '';
  if (days <= 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days < 30) return t('{n}d ago', { n: String(days) });
  if (days < 365) return t('{n}mo ago', { n: String(Math.floor(days / 30)) });
  return t('{n}y ago', { n: String(Math.floor(days / 365)) });
}

export async function ghReposCommand(opts: GhReposOptions = {}): Promise<void> {
  ensureGh();
  const limit = opts.limit ?? '30';

  let owner = opts.owner;
  if (!owner && !isJsonMode()) {
    const orgs = listOrgs();
    if (orgs.length > 0) {
      assertInteractive();
      owner = await select({
        message: t('Whose repositories do you want to see?'),
        choices: [
          { name: t('Mine'), value: '@me', hint: currentUser() },
          ...orgs.map((o) => ({ name: o, value: o })),
        ],
      });
    }
  }

  const args = ['repo', 'list'];
  if (owner && owner !== '@me') args.push(owner);
  args.push('--limit', limit, '--json', 'name,description,visibility,updatedAt,url');
  const repos = captureGhJson<RepoRow[]>(args);

  if (isJsonMode()) {
    emitJson({ owner: owner ?? '@me', count: repos.length, repositories: repos });
    return;
  }

  if (repos.length === 0) {
    log.info(t('No repositories found.'));
    return;
  }

  section(t('Repositories ({count})', { count: String(repos.length) }));
  const now = Date.now();
  const width = Math.max(...repos.map((r) => r.name.length));
  for (const repo of repos) {
    const age = formatAge(daysSince(repo.updatedAt, now));
    const priv = repo.visibility === 'PRIVATE' ? pc.dim(' 🔒') : '';
    log.info(
      `  ${pc.cyan(repo.name.padEnd(width))}${priv}  ${pc.dim(age)}` +
        (repo.description ? `\n    ${pc.dim(repo.description)}` : ''),
    );
  }
}
