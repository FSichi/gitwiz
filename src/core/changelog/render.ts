import type { CommitType } from '../config.js';
import type { ConventionalCommit } from './parse.js';

export interface RepoWebInfo {
  url: string; // https://github.com/org/repo
  host: 'github' | 'gitlab' | 'other';
}

/** Normalize a git remote URL (SSH or HTTPS) into a browsable web URL. */
export function parseRepoWebUrl(remoteUrl: string | null): RepoWebInfo | null {
  if (!remoteUrl) return null;
  let url = remoteUrl.trim();

  const sshMatch = url.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?\/?$/);
  if (sshMatch) {
    url = `https://${sshMatch[1]}/${sshMatch[2]}`;
  } else if (/^https?:\/\//.test(url)) {
    url = url.replace(/\.git\/?$/, '');
  } else {
    return null;
  }

  const host = url.includes('github.') ? 'github' : url.includes('gitlab.') ? 'gitlab' : 'other';
  return { url, host };
}

export interface RenderOptions {
  version: string;
  /** Release date as YYYY-MM-DD. */
  date: string;
  tagPrefix: string;
  previousTag: string | null;
  web: RepoWebInfo | null;
  commitTypes: CommitType[];
}

function commitLink(commit: ConventionalCommit, web: RepoWebInfo | null): string {
  if (!web) return commit.shortHash;
  const path = web.host === 'gitlab' ? '/-/commit/' : '/commit/';
  return `[${commit.shortHash}](${web.url}${path}${commit.hash})`;
}

function headingLink(options: RenderOptions): string {
  const { version, tagPrefix, previousTag, web } = options;
  const tag = `${tagPrefix}${version}`;
  if (!web || web.host === 'other') return version;
  if (previousTag) {
    const path = web.host === 'gitlab' ? '/-/compare/' : '/compare/';
    return `[${version}](${web.url}${path}${previousTag}...${tag})`;
  }
  const path = web.host === 'gitlab' ? `/-/tags/${tag}` : `/releases/tag/${tag}`;
  return `[${version}](${web.url}${path})`;
}

function entryLine(commit: ConventionalCommit, web: RepoWebInfo | null, text?: string): string {
  const scope = commit.scope ? `**${commit.scope}:** ` : '';
  return `* ${scope}${text ?? commit.description} (${commitLink(commit, web)})`;
}

/** Render the markdown section for one release. LF line endings; no trailing newline. */
export function renderReleaseSection(commits: ConventionalCommit[], options: RenderOptions): string {
  const lines: string[] = [`## ${headingLink(options)} (${options.date})`];

  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length > 0) {
    lines.push('', '### ⚠ Breaking Changes', '');
    for (const commit of breaking) {
      lines.push(entryLine(commit, options.web, commit.breakingNote ?? commit.description));
    }
  }

  // One section per distinct changelog title, in config order.
  const sections = new Map<string, string[]>();
  for (const ct of options.commitTypes) {
    if (ct.changelogSection === false) continue;
    const types = sections.get(ct.changelogSection) ?? [];
    types.push(ct.type);
    sections.set(ct.changelogSection, types);
  }

  let hasEntries = breaking.length > 0;
  for (const [title, types] of sections) {
    const matching = commits.filter((c) => c.type !== null && types.includes(c.type) && !c.breaking);
    if (matching.length === 0) continue;
    hasEntries = true;
    lines.push('', `### ${title}`, '');
    for (const commit of matching) {
      lines.push(entryLine(commit, options.web));
    }
  }

  if (!hasEntries) {
    lines.push('', '_No notable changes._');
  }
  return lines.join('\n');
}
