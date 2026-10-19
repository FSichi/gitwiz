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

const BREAKING_RE = /^BREAKING[ -]CHANGE:\s*/;
// Another footer starts a new trailer: "Co-Authored-By: …", "Refs #12".
const FOOTER_TOKEN_RE = /^[A-Za-z][\w-]*(?::\s|\s#)/;

/**
 * The text of a BREAKING CHANGE footer. Per Conventional Commits it runs until
 * the next footer token — so the "Co-Authored-By:" trailer agents append never
 * leaks into the changelog — and it is folded onto one line so the changelog
 * bullet it becomes stays a single list item.
 */
function extractBreakingNote(body: string): string | null {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => BREAKING_RE.test(line));
  if (start === -1) return null;
  const parts = [lines[start]!.replace(BREAKING_RE, '')];
  for (const line of lines.slice(start + 1)) {
    if (FOOTER_TOKEN_RE.test(line) && !BREAKING_RE.test(line)) break;
    parts.push(line);
  }
  const note = parts.join(' ').replace(/\s+/g, ' ').trim();
  return note === '' ? null : note;
}

/** Parse one "hash␟shortHash␟subject␟body" record. */
export function parseCommitRecord(record: string): ConventionalCommit | null {
  const [hash, shortHash, subject = '', body = ''] = record.split(FIELD_SEP);
  if (!hash || !shortHash) return null;

  const breakingNote = extractBreakingNote(body);

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

/**
 * Most recent semver tag matching the prefix, or null when none exists.
 * Ordered by semver itself: git's `v:refname` sort places 1.2.3-rc.1 above
 * 1.2.3, which would make the next changelog repeat the whole 1.2.3 release.
 */
export function findLastTag(tagPrefix: string, opts: GitOptions = {}): string | null {
  const out = tryCaptureGit(['tag', '--list', `${tagPrefix}*`], opts);
  if (!out) return null;
  let latest: { tag: string; version: string } | null = null;
  for (const tag of out.split('\n')) {
    const version = semver.valid(tag.slice(tagPrefix.length));
    if (version && (latest === null || semver.gt(version, latest.version))) {
      latest = { tag, version };
    }
  }
  return latest?.tag ?? null;
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
