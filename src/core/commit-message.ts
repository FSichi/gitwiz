export interface CommitMessageParts {
  type: string;
  scope?: string;
  description: string;
  breaking?: boolean;
  breakingDescription?: string;
  /** Free text after the header: details, and trailers such as Co-Authored-By. */
  body?: string;
}

export function normalizeScope(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-{2,}/g, '-');
}

const HEADER_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.*)$/;
// A git trailer line: "Co-Authored-By: …", "Refs #12".
const TRAILER_RE = /^[A-Za-z][\w-]*(?::\s|\s#)/;

/**
 * Split a header someone wrote in full ("feat(auth)!: add login") into parts.
 * Only a type the config knows counts, so "Note: …" stays a plain description.
 */
export function parseCommitHeader(
  header: string,
  knownTypes: readonly string[],
): { type: string; scope?: string; breaking: boolean; description: string } | null {
  const match = header.trim().match(HEADER_RE);
  if (!match) return null;
  const type = match[1]!.toLowerCase();
  if (!knownTypes.includes(type)) return null;
  return {
    type,
    scope: match[2]?.trim() || undefined,
    breaking: match[3] === '!',
    description: match[4]!.trim(),
  };
}

/** Header line of a conventional commit: type(scope)!: description */
export function buildCommitHeader(parts: CommitMessageParts): string {
  const scope = parts.scope ? `(${parts.scope})` : '';
  const bang = parts.breaking ? '!' : '';
  return `${parts.type}${scope}${bang}: ${parts.description.trim()}`;
}

export function buildCommitMessage(parts: CommitMessageParts): string {
  const body = parts.body?.replace(/\r\n/g, '\n').trim() ?? '';
  const paragraphs = body === '' ? [] : body.split(/\n[ \t]*\n+/);
  if (parts.breaking && parts.breakingDescription?.trim()) {
    const footer = `BREAKING CHANGE: ${parts.breakingDescription.trim()}`;
    // Footers belong in one final block: when the body already ends in trailers,
    // join them there, so a Co-Authored-By stays the last paragraph GitHub reads.
    const last = paragraphs.at(-1);
    if (last && last.split('\n').every((line) => TRAILER_RE.test(line))) {
      paragraphs[paragraphs.length - 1] = `${footer}\n${last}`;
    } else {
      paragraphs.push(footer);
    }
  }
  return [buildCommitHeader(parts), ...paragraphs].join('\n\n');
}
