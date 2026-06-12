import pc from 'picocolors';
import { baseBranchFor, loadConfig, type GitwizConfig } from '../core/config.js';
import {
  captureGit,
  ensureGitRepo,
  getInProgressOperation,
  tryCaptureGit,
  type GitOptions,
} from '../core/git.js';
import { t } from '../ui/i18n.js';
import { heading, log } from '../ui/output.js';

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

/** Parse `git status --porcelain=v2 --branch` output. */
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

  for (const line of text.split('\n')) {
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
      const parts = line.split(' ');
      const xy = parts[1] ?? '..';
      // Renames ("2") carry "path<TAB>origPath" — show the new path.
      const rest = parts.slice(line.startsWith('1 ') ? 8 : 9).join(' ');
      const path = rest.split('\t')[0] ?? rest;
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

function buildSuggestions(
  info: StatusInfo,
  config: GitwizConfig,
  operation: 'merge' | 'rebase' | null,
  releaseBranch: string | null,
): string[] {
  const tips: string[] = [];

  if (operation) {
    tips.push(
      t('A {operation} is in progress — resolve conflicts and continue (git {operation} --continue), or abort it with {cmd}.', {
        operation,
        cmd: pc.bold('gitwiz undo'),
      }),
    );
  }
  if (info.conflicted.length > 0) {
    tips.push(t('Fix the conflicted files, then stage them with git add.'));
  }
  if (info.staged.length > 0) {
    tips.push(t('You have staged changes — run {cmd} to commit them.', { cmd: pc.bold('gitwiz commit') }));
  } else if (info.unstaged.length > 0 || info.untracked.length > 0) {
    if (info.branch === config.mainBranch || info.branch === config.developBranch) {
      tips.push(
        t('You are editing directly on {branch} — run {cmd} to start a work branch first.', {
          branch: pc.bold(info.branch),
          cmd: pc.bold('gitwiz branch'),
        }),
      );
    } else {
      tips.push(t('Run {cmd} — it will help you pick files and write the message.', { cmd: pc.bold('gitwiz commit') }));
    }
  }
  if (info.behind > 0) {
    tips.push(t('Your branch is behind its remote — run {cmd} to update.', { cmd: pc.bold('gitwiz sync') }));
  }
  if (info.ahead > 0 && info.behind === 0) {
    tips.push(t('You have {n} unpushed commit(s) — run {cmd} to share them.', { n: info.ahead, cmd: pc.bold('git push') }));
  }
  if (releaseBranch) {
    tips.push(t('Release branch {branch} is open — run {cmd} when it is ready.', { branch: pc.bold(releaseBranch), cmd: pc.bold('gitwiz release finish') }));
  }

  if (tips.length === 0) {
    tips.push(t('All clean and in sync. Start something new with {cmd}.', { cmd: pc.bold('gitwiz branch') }));
  }
  return tips.slice(0, 3);
}

function printFileGroup(title: string, marker: string, color: (s: string) => string, files: string[]): void {
  if (files.length === 0) return;
  log.info(pc.bold(title));
  for (const file of files) log.info(`  ${color(marker)} ${file}`);
  log.blank();
}

export function statusCommand(opts: GitOptions = {}): void {
  ensureGitRepo(opts);
  const { config } = loadConfig(opts);

  const raw = captureGit(['status', '--porcelain=v2', '--branch'], opts);
  const info = parsePorcelainV2(raw);
  const operation = getInProgressOperation(opts);
  const releaseBranch =
    tryCaptureGit(['branch', '--list', 'release/*', '--format=%(refname:short)'], opts)
      ?.split('\n')
      .filter(Boolean)[0] ?? null;

  log.blank();
  if (info.branch === null) {
    log.warn(t('You are not on any branch (detached HEAD).'));
    log.dim(`  ${t('Get back to safety with: git switch {branch}', { branch: config.developBranch })}`);
  } else {
    const base = findBaseBranch(info.branch, config);
    heading(
      `${t('On branch {branch}', { branch: info.branch })}${base ? pc.dim(` ${t('(based on {base})', { base })}`) : ''}`,
    );
    if (info.upstream) {
      const parts: string[] = [];
      if (info.ahead > 0) parts.push(pc.green(t('↑ {n} ahead', { n: info.ahead })));
      if (info.behind > 0) parts.push(pc.yellow(t('↓ {n} behind', { n: info.behind })));
      if (parts.length === 0) parts.push(pc.green(t('in sync')));
      log.info(`  ${parts.join(' · ')} ${pc.dim(t('of {upstream}', { upstream: info.upstream }))}`);
    } else {
      log.dim(`  ${t('Not pushed to any remote yet.')}`);
    }
  }
  if (operation) {
    log.warn(t('A {operation} is in progress.', { operation }));
  }
  log.blank();

  printFileGroup(t('Conflicted (fix these first):'), '✖', pc.red, info.conflicted);
  printFileGroup(t('Staged (ready to commit):'), '+', pc.green, info.staged);
  printFileGroup(t('Modified (not staged):'), '~', pc.yellow, info.unstaged);
  printFileGroup(t('Untracked (new files):'), '?', pc.dim, info.untracked);

  if (
    info.staged.length + info.unstaged.length + info.untracked.length + info.conflicted.length ===
    0
  ) {
    log.success(t('Working tree clean.'));
    log.blank();
  }

  log.info(pc.bold(t('Suggested next steps:')));
  const tips = buildSuggestions(info, config, operation, releaseBranch);
  tips.forEach((tip, i) => log.info(`  ${pc.cyan(`${i + 1}.`)} ${tip}`));
  log.blank();
}
