import { captureGh, captureGhJson, type GhOptions } from './gh.js';

// ---------------------------------------------------------------------------
// Types mirroring `gh project ... --format json`
// ---------------------------------------------------------------------------

export interface ProjectSummary {
  id: string;
  number: number;
  title: string;
  closed: boolean;
}

export interface ProjectFieldOption {
  id: string;
  name: string;
}

export interface ProjectField {
  id: string;
  name: string;
  type: string;
  options?: ProjectFieldOption[];
}

export interface ProjectItem {
  id: string;
  title: string;
  status?: string;
  content?: { url?: string; number?: number };
}

/**
 * Field types a user can actually pick a value for. The rest (Title, Assignees,
 * Repository, Linked pull requests…) are populated by GitHub itself from the
 * underlying issue, so prompting for them would be misleading.
 */
const SINGLE_SELECT = 'ProjectV2SingleSelectField';
const ITERATION = 'ProjectV2IterationField';

export function isSingleSelect(field: ProjectField): boolean {
  return field.type === SINGLE_SELECT;
}

export function isIteration(field: ProjectField): boolean {
  return field.type === ITERATION;
}

/**
 * The fields worth asking a human about: the ones with a fixed set of options.
 * Exported for unit tests — deciding what to prompt for is the logic that keeps
 * a card from silently landing half-filled.
 */
export function selectableFields(fields: ProjectField[]): ProjectField[] {
  return fields.filter((f) => isSingleSelect(f) && (f.options?.length ?? 0) > 0);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Organizations the authenticated user belongs to. */
export function listOrgs(opts: GhOptions = {}): string[] {
  const out = captureGh(['org', 'list', '--limit', '100'], opts);
  return out.split('\n').map((l) => l.trim()).filter((l) => l !== '');
}

/** The authenticated user's login — the owner for personal projects. */
export function currentUser(opts: GhOptions = {}): string {
  return captureGh(['api', 'user', '--jq', '.login'], opts);
}

export function listProjects(owner: string, opts: GhOptions = {}): ProjectSummary[] {
  const data = captureGhJson<{ projects?: ProjectSummary[] }>(
    ['project', 'list', '--owner', owner, '--limit', '100', '--format', 'json'],
    opts,
  );
  return (data.projects ?? []).filter((p) => !p.closed);
}

export function getProjectFields(
  projectNumber: number,
  owner: string,
  opts: GhOptions = {},
): ProjectField[] {
  const data = captureGhJson<{ fields?: ProjectField[] }>(
    ['project', 'field-list', String(projectNumber), '--owner', owner, '--format', 'json'],
    opts,
  );
  return data.fields ?? [];
}

export function getProjectId(projectNumber: number, owner: string, opts: GhOptions = {}): string {
  const data = captureGhJson<{ id: string }>(
    ['project', 'view', String(projectNumber), '--owner', owner, '--format', 'json'],
    opts,
  );
  return data.id;
}

export function listProjectItems(
  projectNumber: number,
  owner: string,
  limit = 100,
  opts: GhOptions = {},
): ProjectItem[] {
  const data = captureGhJson<{ items?: ProjectItem[] }>(
    [
      'project', 'item-list', String(projectNumber),
      '--owner', owner, '--limit', String(limit), '--format', 'json',
    ],
    opts,
  );
  return data.items ?? [];
}

/**
 * Active iterations of an iteration field. `gh project field-list` omits the
 * iteration configuration, so this is one of the places the CLI cannot reach and
 * GraphQL has to answer.
 */
export function getIterations(
  projectId: string,
  fieldName: string,
  opts: GhOptions = {},
): { id: string; title: string; startDate: string }[] {
  const query = `
query($project: ID!) {
  node(id: $project) {
    ... on ProjectV2 {
      field(name: "${fieldName}") {
        ... on ProjectV2IterationField {
          configuration { iterations { id title startDate } }
        }
      }
    }
  }
}`.trim();
  const data = captureGhJson<{
    data?: { node?: { field?: { configuration?: { iterations?: { id: string; title: string; startDate: string }[] } } } };
  }>(['api', 'graphql', '-f', `project=${projectId}`, '-f', `query=${query}`], opts);
  return data.data?.node?.field?.configuration?.iterations ?? [];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Add an existing issue (by URL) to a board. Returns the new item's id. */
export function addItemToProject(
  projectNumber: number,
  owner: string,
  issueUrl: string,
  opts: GhOptions = {},
): string {
  const data = captureGhJson<{ id: string }>(
    [
      'project', 'item-add', String(projectNumber),
      '--owner', owner, '--url', issueUrl, '--format', 'json',
    ],
    { ...opts, echo: true },
  );
  return data.id;
}

export function setSingleSelectField(
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string,
  opts: GhOptions = {},
): void {
  captureGh(
    [
      'project', 'item-edit',
      '--project-id', projectId, '--id', itemId,
      '--field-id', fieldId, '--single-select-option-id', optionId,
    ],
    { ...opts, echo: true },
  );
}

export function setIterationField(
  projectId: string,
  itemId: string,
  fieldId: string,
  iterationId: string,
  opts: GhOptions = {},
): void {
  captureGh(
    [
      'project', 'item-edit',
      '--project-id', projectId, '--id', itemId,
      '--field-id', fieldId, '--iteration-id', iterationId,
    ],
    { ...opts, echo: true },
  );
}
