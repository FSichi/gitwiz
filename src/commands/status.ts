import pc from 'picocolors';
import { baseBranchFor, loadConfig, type GitwizConfig } from '../core/config.js';
import {
  captureGitRaw,
  ensureGitRepo,
  getInProgressOperation,
  runGit,
  tryCaptureGit,
  type GitOptions,
} from '../core/git.js';
import { t } from '../ui/i18n.js';
import { divider, emitJson, heading, isJsonMode, log, section } from '../ui/output.js';
import { select } from '../ui/prompts.js';

export interface StatusInfo {
  branch: string | null; // null when detached
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicted: string[];
}

/**
 * Parse `git status --porcelain=v2 --branch` output, with or without `-z`.
 * gitwiz runs it with `-z` so paths arrive verbatim (no C-quoting of spaces or
 * accents); then records end in NUL and a rename's original path is its own record.
 */
export function parsePorcelainV2(text: string): StatusInfo {
  const info: StatusInfo = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  };

  const nulSeparated = text.includes('\0');
  const records = text.split(nulSeparated ? '\0' : '\n');
  for (let i = 0; i < records.length; i++) {
    const line = records[i]!;
    if (line === '') continue;
    if (line.startsWith('# branch.head ')) {
      const name = line.slice('# branch.head '.length);
      info.branch = name === '(detached)' ? null : name;
    } else if (line.startsWith('# branch.upstream ')) {
      info.upstream = line.slice('# branch.upstream '.length);
    } else if (line.startsWith('# branch.ab ')) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        info.ahead = Number(match[1]);
        info.behind = Number(match[2]);
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const isRename = line.startsWith('2 ');
      const parts = line.split(' ');
      const xy = parts[1] ?? '..';
      let path = parts.slice(isRename ? 9 : 8).join(' ');
      // Renames ("2") carry the original path too — show the new one.
      if (isRename) {
        if (nulSeparated) i++;
        else path = path.split('\t')[0] ?? path;
      }
      if (xy[0] !== '.') info.staged.push(path);
      if (xy[1] !== '.') info.unstaged.push(path);
    } else if (line.startsWith('u ')) {
      const parts = line.split(' ');
      info.conflicted.push(parts.slice(10).join(' '));
    } else if (line.startsWith('? ')) {
      info.untracked.push(line.slice(2));
    }
  }
  return info;
}

function findBaseBranch(branch: string, config: GitwizConfig): string | null {
  for (const type of config.branchTypes) {
    if (branch.startsWith(type.prefix)) return baseBranchFor(type, config);
  }
  return null;
}

/** A gitwiz command (or git push) the user can launch straight from status. */
type ActionKey = 'commit' | 'branch' | 'sync' | 'push' | 'release-finish';

interface Suggestion {
  /** Verbose, teaching explanation shown in the printed list. */
  text: string;
  /** Short label for the interactive picker; absent → informational only. */
  label?: string;
  /** Command launched when the user picks this suggestion. */
  action?: ActionKey;
}

function buildSuggestions(
  info: StatusInfo,
  config: GitwizConfig,
  operation: 'merge' | 'rebase' | null,
  releaseBranch: string | null,
): Suggestion[] {
  const tips: Suggestion[] = [];

  if (operation) {
    // Conflict resolution is hands-on — informational, no one-click action.
    tips.push({
      text: t('A {operation} is in progress — resolve conflicts and continue (git {operation} --continue), or abort it with {cmd}.', {
        operation,
        cmd: pc.bold('gitwiz undo'),
      }),
    });
  }
  if (info.conflicted.length > 0) {
    tips.push({ text: t('Fix the conflicted files, then stage them with git add.') });
  }
  if (info.staged.length > 0) {
    tips.push({
      text: t('You have staged changes — run {cmd} to commit them.', { cmd: pc.bold('gitwiz commit') }),
      label: t('Commit staged changes'),
      action: 'commit',
    });
  } else if (info.unstaged.length > 0 || info.untracked.length > 0) {
    if (info.branch === config.mainBranch || info.branch === config.developBranch) {
      tips.push({
        text: t('You are editing directly on {branch} — run {cmd} to start a work branch first.', {
          branch: pc.bold(info.branch),
          cmd: pc.bold('gitwiz branch'),
        }),
        label: t('Start a work branch'),
        action: 'branch',
      });
    } else {
      tips.push({
        text: t('Run {cmd} — it will help you pick files and write the message.', { cmd: pc.bold('gitwiz commit') }),
        label: t('Commit your changes'),
        action: 'commit',
      });
    }
  }
  if (info.behind > 0) {
    tips.push({
      text: t('Your branch is behind its remote — run {cmd} to update.', { cmd: pc.bold('gitwiz sync') }),
      label: t('Sync with remote'),
      action: 'sync',
    });
  }
  if (info.ahead > 0 && info.behind === 0) {
    tips.push({
      text: t('You have {n} unpushed commit(s) — run {cmd} to share them.', { n: info.ahead, cmd: pc.bold('git push') }),
      label: t('Push your commits'),
      action: 'push',
    });
  }
  if (releaseBranch) {
    tips.push({
      text: t('Release branch {branch} is open — run {cmd} when it is ready.', { branch: pc.bold(releaseBranch), cmd: pc.bold('gitwiz release finish') }),
      label: t('Finish the release'),
      action: 'release-finish',
    });
  }

  if (tips.length === 0) {
    tips.push({
      text: t('All clean and in sync. Start something new with {cmd}.', { cmd: pc.bold('gitwiz branch') }),
      label: t('Start something new'),
      action: 'branch',
    });
  }
  return tips.slice(0, 3);
}

/** Launch the command behind a chosen suggestion. Lazy-imported to avoid cycles. */
async function dispatch(action: ActionKey): Promise<void> {
  switch (action) {
    case 'commit':
      return (await import('./commit.js')).commitCommand();
    case 'branch':
      return (await import('./branch.js')).branchCommand();
    case 'sync':
      return (await import('./sync.js')).syncCommand();
    case 'release-finish':
      return (await import('./release-finish.js')).releaseFinishCommand();
    case 'push':
      runGit(['push']);
      return;
  }
}

/**
 * Turn the suggested next steps into an actionable picker. Status stops being a
 * read-only report and becomes a hub: see where you are, then act on it.
 */
async function runStatusHub(suggestions: Suggestion[]): Promise<void> {
  const actionable = suggestions.filter((s) => s.action && s.label);
  if (actionable.length === 0) return;

  const choice = await select<ActionKey | 'none'>({
    message: t('What do you want to do?'),
    choices: [
      ...actionable.map((s) => ({ name: s.label!, value: s.action! })),
      { name: pc.dim(t('Nothing, just looking')), value: 'none' as const },
    ],
  });
  if (choice === 'none') return;

  log.blank();
  await dispatch(choice);
}

const SUGGESTED_COMMAND: Record<ActionKey, string> = {
  commit: 'gitwiz commit',
  branch: 'gitwiz branch',
  sync: 'gitwiz sync',
  push: 'git push',
  'release-finish': 'gitwiz release finish',
};

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * `gitwiz status --json`: everything the screen shows, as data an agent can act
 * on without scraping text. Exported for unit tests.
 */
export function buildStatusJson(
  info: StatusInfo,
  config: GitwizConfig,
  operation: 'merge' | 'rebase' | null,
  releaseBranch: string | null,
) {
  const { staged, unstaged, untracked, conflicted } = info;
  return {
    branch: info.branch,
    detached: info.branch === null,
    base: info.branch ? findBaseBranch(info.branch, config) : null,
    upstream: info.upstream,
    ahead: info.ahead,
    behind: info.behind,
    operation,
    releaseBranch,
    clean: staged.length + unstaged.length + untracked.length + conflicted.length === 0,
    files: { staged, unstaged, untracked, conflicted },
    next: buildSuggestions(info, config, operation, releaseBranch).map((tip) => ({
      action: tip.action ?? null,
      command: tip.action ? SUGGESTED_COMMAND[tip.action] : null,
      reason: tip.text.replace(ANSI_RE, ''),
    })),
  };
}

// A forgotten .gitignore can leave thousands of untracked files; the counts
// stay exact, but the screen should still fit the suggestions below them.
const MAX_FILES_PER_GROUP = 25;

function printFileGroup(title: string, marker: string, color: (s: string) => string, files: string[]): void {
  if (files.length === 0) return;
  log.info(`  ${color(pc.bold(`${marker} ${files.length} ${title}`))}`);
  for (const file of files.slice(0, MAX_FILES_PER_GROUP)) log.info(`     ${color('·')} ${file}`);
  if (files.length > MAX_FILES_PER_GROUP) {
    log.dim(`   ${t('  …and {n} more', { n: String(files.length - MAX_FILES_PER_GROUP) })}`);
  }
}

export async function statusCommand(opts: GitOptions = {}): Promise<void> {
  ensureGitRepo(opts);
  const { config } = loadConfig(opts);

  const raw = captureGitRaw(['status', '--porcelain=v2', '--branch', '-z'], opts);
  const info = parsePorcelainV2(raw);
  const operation = getInProgressOperation(opts);
  const releaseBranch =
    tryCaptureGit(['branch', '--list', 'release/*', '--format=%(refname:short)'], opts)
      ?.split('\n')
      .filter(Boolean)[0] ?? null;

  if (isJsonMode()) {
    emitJson(buildStatusJson(info, config, operation, releaseBranch));
    return;
  }

  log.blank();
  if (info.branch === null) {
    log.warn(t('You are not on any branch (detached HEAD).'));
    log.dim(`  ${t('Get back to safety with: git switch {branch}', { branch: config.developBranch })}`);
  } else {
    const base = findBaseBranch(info.branch, config);
    heading(
      `${t('On branch {branch}', { branch: pc.bold(info.branch) })}${base ? pc.dim(` ${t('(based on {base})', { base })}`) : ''}`,
    );
    if (info.upstream) {
      const parts: string[] = [];
      if (info.ahead > 0) parts.push(pc.green(t('↑ {n} ahead', { n: info.ahead })));
      if (info.behind > 0) parts.push(pc.yellow(t('↓ {n} behind', { n: info.behind })));
      if (parts.length === 0) parts.push(pc.green(t('✓ in sync')));
      log.info(`  ${parts.join(pc.dim(' · '))}  ${pc.dim(info.upstream)}`);
    } else {
      log.dim(`  ${t('Not pushed to any remote yet.')}`);
    }
  }

  if (operation) {
    log.blank();
    log.warn(t('A {operation} is in progress.', { operation }));
  }

  const totalFiles = info.staged.length + info.unstaged.length + info.untracked.length + info.conflicted.length;

  if (totalFiles > 0) {
    log.blank();
    divider();
    printFileGroup(t('Conflicted (fix these first):'), '✖', pc.red, info.conflicted);
    printFileGroup(t('Staged (ready to commit):'), '✔', pc.green, info.staged);
    printFileGroup(t('Modified (not staged):'), '~', pc.yellow, info.unstaged);
    printFileGroup(t('Untracked (new files):'), '?', pc.dim, info.untracked);
    divider();
  } else {
    log.blank();
    log.success(t('Working tree clean.'));
  }

  log.blank();
  section(t('Suggested next steps'));
  const tips = buildSuggestions(info, config, operation, releaseBranch);
  tips.forEach((tip, i) => log.info(`  ${pc.cyan(pc.bold(`${i + 1}.`))} ${tip.text}`));
  log.blank();

  // In a real terminal, let the user act on a suggestion right away.
  if (process.stdin.isTTY && process.stdout.isTTY) {
    await runStatusHub(tips);
  }
}
