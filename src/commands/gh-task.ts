import pc from 'picocolors';
import { captureGh, captureGhJson, captureGhJsonAsync, getRepoSlug } from '../core/gh.js';
import {
  addItemToProject,
  getIterations,
  getProjectFields,
  getProjectId,
  isIteration,
  selectableFields,
  setIterationField,
  setSingleSelectField,
  type ProjectField,
} from '../core/gh-project.js';
import { pickProject, resolveOwner } from './gh-projects.js';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { box, emitJson, isJsonMode, log } from '../ui/output.js';
import { assertInteractive, checkbox, confirm, input, select } from '../ui/prompts.js';

export interface GhTaskOptions {
  owner?: string;
  project?: string;
  repo?: string;
  title?: string;
  body?: string;
  json?: boolean;
}

interface LabelRow {
  name: string;
  description: string;
}

/** A field the user chose a value for, kept for the final summary. */
interface FilledField {
  name: string;
  value: string;
}

/** "3" or "#3" → 3; anything else is a usage error. */
function parseProjectNumber(value: string): number {
  const number = Number(value.trim().replace(/^#/, ''));
  if (!Number.isInteger(number) || number <= 0) {
    throw new GitwizError(t('"{value}" is not a project number.', { value }));
  }
  return number;
}

export async function ghTaskCommand(opts: GhTaskOptions = {}): Promise<void> {
  // --title is the switch to headless mode: from there on nothing may prompt,
  // because a prompt with no terminal behind it would hang an agent forever.
  const nonInteractive = Boolean(opts.title);
  if (!nonInteractive) assertInteractive();
  if (opts.title !== undefined && opts.title.trim() === '') {
    throw new GitwizError(t('The title cannot be empty.'));
  }

  const owner = await resolveOwner(opts.owner, !nonInteractive && !opts.project);
  const project = opts.project
    ? { number: parseProjectNumber(opts.project), title: `#${opts.project.replace(/^#/, '')}` }
    : await pickProject(owner, !nonInteractive);

  // The board's fields are needed either way; read them while the user types.
  const fieldsRequest = getProjectFields(project.number, owner);
  fieldsRequest.catch(() => {});

  // The issue needs a repo. The one you are standing in is almost always right.
  let repo = opts.repo ?? getRepoSlug() ?? undefined;
  if (!repo && nonInteractive) {
    throw new GitwizError(t('This folder is not a GitHub repository, so the issue has no home.'), {
      hint: t('Pass --repo <owner/repo>.'),
    });
  }
  if (!repo) {
    const repos = captureGhJson<{ name: string }[]>([
      'repo', 'list', owner, '--limit', '100', '--json', 'name',
    ]);
    if (repos.length === 0) {
      throw new GitwizError(t('"{owner}" has no repositories to create the issue in.', { owner }));
    }
    repo = await select({
      message: t('Which repository should hold the issue?'),
      choices: repos.map((r) => ({ name: r.name, value: `${owner}/${r.name}` })),
    });
  }

  const title = opts.title ?? (await input({
    message: t('Task title'),
    validate: (value) => (value.trim() === '' ? t('The title cannot be empty.') : true),
  }));
  const body = opts.body ?? (opts.title ? '' : await input({
    message: t('Description (optional)'),
    default: '',
  }));

  // Labels come from the repo, never invented — an unknown label fails the create.
  let labels: string[] = [];
  if (!nonInteractive) {
    const available = await captureGhJsonAsync<LabelRow[]>([
      'label', 'list', '--repo', repo, '--limit', '100', '--json', 'name,description',
    ]);
    if (available.length > 0) {
      labels = await checkbox({
        message: t('Labels (space to select, enter to confirm)'),
        choices: available.map((l) => ({
          name: l.name,
          value: l.name,
          hint: l.description || undefined,
        })),
      });
    }
  }

  // Ask about every field the board actually offers *before* creating anything,
  // so a half-filled card is a deliberate choice rather than an accident.
  const fields = await fieldsRequest;
  const askable = selectableFields(fields);
  const iterationField = fields.find(isIteration);
  const chosen = new Map<string, { field: ProjectField; optionId: string; label: string }>();
  let iterationChoice: { id: string; title: string } | null = null;
  // Needed to read iterations and again to fill fields — look it up once.
  let cachedProjectId: string | undefined;
  const projectId = () => (cachedProjectId ??= getProjectId(project.number, owner));

  if (!nonInteractive) {
    for (const field of askable) {
      const picked = await select<{ id: string; name: string } | null>({
        message: t('{field}?', { field: field.name }),
        choices: [
          ...(field.options ?? []).map((o) => ({ name: o.name, value: o })),
          { name: pc.dim(t('— leave empty —')), value: null },
        ],
      });
      if (picked) chosen.set(field.id, { field, optionId: picked.id, label: picked.name });
    }

    if (iterationField) {
      const iterations = getIterations(projectId(), iterationField.name);
      if (iterations.length === 0) {
        log.dim(t('No active iteration on "{field}" — skipping it.', { field: iterationField.name }));
      } else {
        iterationChoice = await select<{ id: string; title: string } | null>({
          message: t('{field}?', { field: iterationField.name }),
          choices: [
            ...iterations.map((i) => ({ name: i.title, value: i, hint: i.startDate })),
            { name: pc.dim(t('— leave empty —')), value: null },
          ],
        });
      }
    }

    const empty = askable.filter((f) => !chosen.has(f.id)).map((f) => f.name);
    box(
      [
        pc.bold(title),
        pc.dim(`${repo} → ${project.title}`),
        ...(labels.length > 0 ? [`${t('Labels')}: ${labels.join(', ')}`] : []),
        ...[...chosen.values()].map((c) => `${c.field.name}: ${pc.cyan(c.label)}`),
        ...(iterationChoice ? [`${iterationField!.name}: ${pc.cyan(iterationChoice.title)}`] : []),
        ...(empty.length > 0 ? [pc.yellow(`${t('Left empty')}: ${empty.join(', ')}`)] : []),
      ],
      t('New task'),
    );
    const go = await confirm({ message: t('Create it?'), default: true });
    if (!go) {
      log.dim(t('Cancelled — nothing was created.'));
      return;
    }
  }

  // Create the issue, then attach it, then fill the fields. Each step prints the
  // command it runs, so a failure halfway is diagnosable and re-runnable by hand.
  const createArgs = ['issue', 'create', '--repo', repo, '--title', title, '--body', body];
  for (const label of labels) createArgs.push('--label', label);
  const issueUrl = captureGh(createArgs, { echo: true });

  const itemId = addItemToProject(project.number, owner, issueUrl);
  const filled: FilledField[] = [];

  if (chosen.size > 0 || iterationChoice) {
    for (const { field, optionId, label } of chosen.values()) {
      setSingleSelectField(projectId(), itemId, field.id, optionId);
      filled.push({ name: field.name, value: label });
    }
    if (iterationChoice && iterationField) {
      setIterationField(projectId(), itemId, iterationField.id, iterationChoice.id);
      filled.push({ name: iterationField.name, value: iterationChoice.title });
    }
  }

  const leftEmpty = askable.filter((f) => !chosen.has(f.id)).map((f) => f.name);

  if (isJsonMode()) {
    emitJson({
      issue: issueUrl,
      itemId,
      project: { owner, number: project.number },
      labels,
      fields: filled,
      fieldsLeftEmpty: leftEmpty,
    });
    return;
  }

  log.success(t('Task created and added to the board.'));
  log.info(pc.cyan(issueUrl));
  if (leftEmpty.length > 0) {
    log.warn(t('These fields were left empty: {fields}', { fields: leftEmpty.join(', ') }));
    log.dim(t('A card without them will not show up when the board is filtered.'));
  }
}
