import semver from 'semver';
import { captureGit, tryCaptureGit, type GitOptions } from '../git.js';

export interface ConventionalCommit {
  hash: string;
  shortHash: string;
  /** Conventional commit type (feat, fix, …) or null when the subject doesn't follow the convention. */
  type: string | null;
  scope: string | null;
  breaking: boolean;
  description: string;
  breakingNote: string | null;
}

const SUBJECT_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;
const FIELD_SEP = '\x1f'; // unit separator
const RECORD_SEP = '\x1e'; // record separator

/** Parse one "hash␟shortHash␟subject␟body" record. */
export function parseCommitRecord(record: string): ConventionalCommit | null {
  const [hash, shortHash, subject = '', body = ''] = record.split(FIELD_SEP);
  if (!hash || !shortHash) return null;

  const breakingMatch = body.match(/^BREAKING[ -]CHANGE:\s*(.+)$/ms);
  const breakingNote = breakingMatch?.[1]?.trim() ?? null;

  const match = subject.match(SUBJECT_RE);
  if (!match) {
    return {
      hash,
      shortHash,
      type: null,
      scope: null,
      breaking: breakingNote !== null,
      description: subject.trim(),
      breakingNote,
    };
  }
  return {
    hash,
    shortHash,
    type: match[1]!.toLowerCase(),
    scope: match[2]?.trim() || null,
    breaking: match[3] === '!' || breakingNote !== null,
    description: match[4]!.trim(),
    breakingNote,
  };
}

/** Most recent semver tag matching the prefix, or null when none exists. */
export function findLastTag(tagPrefix: string, opts: GitOptions = {}): string | null {
  const out = tryCaptureGit(['tag', '--list', `${tagPrefix}*`, '--sort=-v:refname'], opts);
  if (!out) return null;
  for (const tag of out.split('\n')) {
    if (semver.valid(tag.slice(tagPrefix.length))) return tag;
  }
  return null;
}

/** All non-merge commits since `ref` (or since the beginning when ref is null), newest first. */
export function collectCommitsSince(ref: string | null, opts: GitOptions = {}): ConventionalCommit[] {
  const args = ['log', '--no-merges', `--format=%H${FIELD_SEP}%h${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`];
  if (ref) args.splice(1, 0, `${ref}..HEAD`);
  const out = captureGit(args, opts);
  if (out === '') return [];
  return out
    .split(RECORD_SEP)
    .map((r) => r.replace(/^[\r\n]+/, ''))
    .filter((r) => r.trim() !== '')
    .map(parseCommitRecord)
    .filter((c): c is ConventionalCommit => c !== null);
}
