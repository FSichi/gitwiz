import { describe, expect, it } from 'vitest';
import { groupByStatus } from '../../src/commands/gh-projects.js';
import { daysSince, formatAge } from '../../src/commands/gh-repos.js';
import { summarizeChecks } from '../../src/commands/gh-review.js';
import { isIteration, isSingleSelect, selectableFields } from '../../src/core/gh-project.js';

const field = (name: string, type: string, options: string[] = []) => ({
  id: `F_${name}`,
  name,
  type,
  options: options.map((o) => ({ id: `O_${o}`, name: o })),
});

// A real board's schema: the built-in fields GitHub fills in itself, plus the
// custom single-selects a team actually configures.
const BOARD = [
  field('Title', 'ProjectV2Field'),
  field('Assignees', 'ProjectV2Field'),
  field('Status', 'ProjectV2SingleSelectField', ['Por Hacer', 'En Curso', 'Finalizado']),
  field('Repository', 'ProjectV2Field'),
  field('Pertenencia', 'ProjectV2SingleSelectField', ['Frontend', 'Backend']),
  field('Prioridad', 'ProjectV2SingleSelectField', ['Baja', 'Alta']),
  field('Estimate', 'ProjectV2Field'),
  field('Sprint', 'ProjectV2IterationField'),
];

describe('selectableFields', () => {
  it('keeps only the single-selects that have options', () => {
    expect(selectableFields(BOARD).map((f) => f.name)).toEqual([
      'Status',
      'Pertenencia',
      'Prioridad',
    ]);
  });

  it('excludes fields GitHub populates from the issue itself', () => {
    const names = selectableFields(BOARD).map((f) => f.name);
    expect(names).not.toContain('Title');
    expect(names).not.toContain('Assignees');
    expect(names).not.toContain('Repository');
  });

  // Iterations need their own GraphQL lookup, so they must not land in the
  // single-select path where they would be prompted with an empty option list.
  it('excludes the iteration field', () => {
    expect(selectableFields(BOARD).map((f) => f.name)).not.toContain('Sprint');
    expect(BOARD.filter(isIteration).map((f) => f.name)).toEqual(['Sprint']);
  });

  it('drops a single-select that has no options configured', () => {
    const empty = field('Broken', 'ProjectV2SingleSelectField');
    expect(isSingleSelect(empty)).toBe(true);
    expect(selectableFields([empty])).toEqual([]);
  });
});

describe('groupByStatus', () => {
  it('counts items per column in first-seen order', () => {
    expect(
      groupByStatus([
        { status: 'Por Hacer' },
        { status: 'En Curso' },
        { status: 'Por Hacer' },
      ]),
    ).toEqual([
      { status: 'Por Hacer', count: 2 },
      { status: 'En Curso', count: 1 },
    ]);
  });

  it('groups items with no status under an empty key', () => {
    expect(groupByStatus([{}, { status: 'En Curso' }])).toEqual([
      { status: '', count: 1 },
      { status: 'En Curso', count: 1 },
    ]);
  });
});

describe('summarizeChecks', () => {
  it('counts an empty or missing rollup as nothing', () => {
    expect(summarizeChecks(undefined)).toEqual({ passed: 0, failed: 0, pending: 0 });
    expect(summarizeChecks([])).toEqual({ passed: 0, failed: 0, pending: 0 });
  });

  it('treats neutral and skipped as passing, since neither blocks a merge', () => {
    expect(summarizeChecks([
      { conclusion: 'SUCCESS' },
      { conclusion: 'NEUTRAL' },
      { conclusion: 'SKIPPED' },
    ])).toEqual({ passed: 3, failed: 0, pending: 0 });
  });

  it('counts a check with no conclusion yet as pending', () => {
    expect(summarizeChecks([{ status: 'IN_PROGRESS' }])).toEqual({
      passed: 0, failed: 0, pending: 1,
    });
  });

  it('counts failures and cancellations as failed', () => {
    expect(summarizeChecks([
      { conclusion: 'FAILURE' },
      { conclusion: 'CANCELLED' },
      { conclusion: 'SUCCESS' },
    ])).toEqual({ passed: 1, failed: 2, pending: 0 });
  });
});

describe('repo age formatting', () => {
  const now = Date.parse('2026-08-11T12:00:00Z');

  it('measures whole days back from now', () => {
    expect(daysSince('2026-08-11T09:00:00Z', now)).toBe(0);
    expect(daysSince('2026-08-04T12:00:00Z', now)).toBe(7);
  });

  it('returns null for an unparseable date', () => {
    expect(daysSince('not-a-date', now)).toBeNull();
  });

  it.each([
    [0, 'today'],
    [1, 'yesterday'],
    [9, '9d ago'],
    [45, '1mo ago'],
    [400, '1y ago'],
  ])('renders %i days as "%s"', (days, expected) => {
    expect(formatAge(days)).toBe(expected);
  });

  it('renders an unknown age as an empty string rather than "null"', () => {
    expect(formatAge(null)).toBe('');
  });
});
