import pc from 'picocolors';
import { ensureGh } from '../core/gh.js';
import {
  currentUser,
  listOrgs,
  listProjectItems,
  listProjects,
  type ProjectSummary,
} from '../core/gh-project.js';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { emitJson, isJsonMode, log, section } from '../ui/output.js';
import { assertInteractive, select } from '../ui/prompts.js';

export interface GhProjectsOptions {
  owner?: string;
  json?: boolean;
}

/**
 * Group board items by their Status column, preserving first-seen order so the
 * summary reads in the board's own order instead of alphabetically.
 */
export function groupByStatus(items: { status?: string }[]): { status: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.status ?? '';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

/**
 * Resolve which account owns the projects we should look at. Personal projects
 * and each organization's are separate namespaces, so this has to be explicit.
 */
export async function resolveOwner(explicit: string | undefined, interactive: boolean): Promise<string> {
  if (explicit) return explicit;
  const orgs = listOrgs();
  if (orgs.length === 0) return currentUser();
  if (!interactive) return orgs[0]!;
  assertInteractive();
  return select({
    message: t('Which account do you want to see boards for?'),
    choices: [
      ...orgs.map((o) => ({ name: o, value: o })),
      { name: t('Mine'), value: currentUser(), hint: t('personal projects') },
    ],
  });
}

export async function ghProjectsCommand(opts: GhProjectsOptions = {}): Promise<void> {
  ensureGh();
  const owner = await resolveOwner(opts.owner, !isJsonMode());
  const projects = listProjects(owner);

  if (isJsonMode()) {
    emitJson({ owner, count: projects.length, projects });
    return;
  }

  if (projects.length === 0) {
    log.info(t('"{owner}" has no open projects.', { owner }));
    log.dim(t('Reading boards needs the read:project scope: gh auth refresh -s read:project'));
    return;
  }

  section(t('Boards of {owner} ({count})', { owner, count: String(projects.length) }));
  for (const p of projects) {
    log.info(`  ${pc.dim(`#${p.number}`)} ${pc.cyan(p.title)}`);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) return;

  log.blank();
  const chosen = await select<ProjectSummary | null>({
    message: t('Open one to see its columns?'),
    choices: [
      ...projects.map((p) => ({ name: `#${p.number} ${p.title}`, value: p as ProjectSummary })),
      { name: t('No, that is all'), value: null },
    ],
  });
  if (!chosen) return;

  const items = listProjectItems(chosen.number, owner);
  if (items.length === 0) {
    log.info(t('"{title}" has no items yet.', { title: chosen.title }));
    return;
  }

  section(t('{title} — {count} items', { title: chosen.title, count: String(items.length) }));
  for (const { status, count } of groupByStatus(items)) {
    const label = status === '' ? pc.dim(t('(no status)')) : pc.cyan(status);
    log.info(`  ${label} ${pc.dim(`· ${count}`)}`);
  }
  log.blank();
  log.dim(t('Add a task with: gitwiz gh task'));
}

/** Shared by `gh task`: pick a board interactively, failing clearly when there is none. */
export async function pickProject(owner: string): Promise<ProjectSummary> {
  const projects = listProjects(owner);
  if (projects.length === 0) {
    throw new GitwizError(t('"{owner}" has no open projects.', { owner }), {
      hint: t('Reading boards needs the read:project scope: gh auth refresh -s read:project'),
    });
  }
  if (projects.length === 1) return projects[0]!;
  return select({
    message: t('Which board?'),
    choices: projects.map((p) => ({ name: p.title, value: p, hint: `#${p.number}` })),
  });
}
