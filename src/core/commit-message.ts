export interface CommitMessageParts {
  type: string;
  scope?: string;
  description: string;
  breaking?: boolean;
  breakingDescription?: string;
}

export function normalizeScope(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-{2,}/g, '-');
}

/** Header line of a conventional commit: type(scope)!: description */
export function buildCommitHeader(parts: CommitMessageParts): string {
  const scope = parts.scope ? `(${parts.scope})` : '';
  const bang = parts.breaking ? '!' : '';
  return `${parts.type}${scope}${bang}: ${parts.description.trim()}`;
}

export function buildCommitMessage(parts: CommitMessageParts): string {
  let message = buildCommitHeader(parts);
  if (parts.breaking && parts.breakingDescription?.trim()) {
    message += `\n\nBREAKING CHANGE: ${parts.breakingDescription.trim()}`;
  }
  return message;
}
