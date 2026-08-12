import { readFileSync } from 'node:fs';
import pc from 'picocolors';
import { t } from '../ui/i18n.js';
import { banner, log, outro } from '../ui/output.js';
import { select } from '../ui/prompts.js';
import { branchCommand } from './branch.js';
import { commitCommand } from './commit.js';
import { ghOrgsCommand } from './gh-orgs.js';
import { ghPrCommand } from './gh-pr.js';
import { ghProjectsCommand } from './gh-projects.js';
import { ghReposCommand } from './gh-repos.js';
import { ghReviewCommand } from './gh-review.js';
import { ghTaskCommand } from './gh-task.js';
import { initCommand } from './init.js';
import { releaseFinishCommand } from './release-finish.js';
import { releaseStartCommand } from './release-start.js';
import { stashCommand } from './stash.js';
import { statusCommand } from './status.js';
import { syncCommand } from './sync.js';
import { undoCommand } from './undo.js';
import { updateCommand } from './update.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

type MenuAction =
  | 'status'
  | 'commit'
  | 'branch'
  | 'sync'
  | 'undo'
  | 'stash'
  | 'release-start'
  | 'release-finish'
  | 'github'
  | 'init'
  | 'update'
  | 'exit';

type GhMenuAction =
  | 'gh-pr'
  | 'gh-review'
  | 'gh-task'
  | 'gh-projects'
  | 'gh-repos'
  | 'gh-orgs'
  | 'back';

/** Pad the command name so every description starts in the same column. */
function entry(name: string, description: string): string {
  return `${pc.bold(name.padEnd(16))}${pc.dim(`— ${description}`)}`;
}

/** Interactive launcher shown when `gitwiz` is run with no command (and a TTY). */
export async function menuCommand(): Promise<void> {
  banner(version);

  // Looping lets the GitHub submenu offer a way back without restarting gitwiz.
  for (;;) {
    const action = await select<MenuAction>({
      message: t('What do you want to do?'),
      choices: [
        { name: entry('status', t('where am I and what to do next')), value: 'status' },
        { name: entry('commit', t('create a guided commit')), value: 'commit' },
        { name: entry('branch', t('start a new work branch')), value: 'branch' },
        { name: entry('sync', t('update my branch safely')), value: 'sync' },
        { name: entry('undo', t('undo something safely')), value: 'undo' },
        { name: entry('stash', t('set changes aside for later')), value: 'stash' },
        { name: entry('release start', t('bump version + changelog')), value: 'release-start' },
        { name: entry('release finish', t('merge, tag, publish')), value: 'release-finish' },
        { name: entry('github', t('pull requests, reviews, boards…')), value: 'github' },
        { name: entry('init', t('set up gitwiz here')), value: 'init' },
        { name: entry('update', t('update to latest version')), value: 'update' },
        { name: pc.dim(t('exit')), value: 'exit' },
      ],
      pageSize: 13,
    });

    if (action === 'github') {
      const ranSomething = await ghMenu();
      // "Back" returns here so the main menu reappears instead of ending the session.
      if (ranSomething) return;
      continue;
    }

    log.blank();

    switch (action) {
      case 'status':
        await statusCommand();
        return;
      case 'commit':
        await commitCommand();
        return;
      case 'branch':
        await branchCommand();
        return;
      case 'sync':
        await syncCommand();
        return;
      case 'undo':
        await undoCommand();
        return;
      case 'stash':
        await stashCommand();
        return;
      case 'release-start':
        await releaseStartCommand();
        return;
      case 'release-finish':
        await releaseFinishCommand();
        return;
      case 'init':
        await initCommand();
        return;
      case 'update':
        await updateCommand();
        return;
      case 'exit':
        outro(t('Bye!'));
        return;
    }
  }
}

/**
 * GitHub actions, kept behind their own entry so they do not crowd the git ones —
 * and because they are the only commands that need the gh CLI.
 * Returns true when a command ran, false when the user asked to go back.
 */
async function ghMenu(): Promise<boolean> {
  const action = await select<GhMenuAction>({
    message: t('What do you want to do on GitHub?'),
    choices: [
      { name: entry('pr', t('open a pull request')), value: 'gh-pr' },
      { name: entry('review', t('review a pull request')), value: 'gh-review' },
      { name: entry('task', t('add a task to a board')), value: 'gh-task' },
      { name: entry('projects', t('see the boards')), value: 'gh-projects' },
      { name: entry('repos', t('list repositories')), value: 'gh-repos' },
      { name: entry('orgs', t('list my organizations')), value: 'gh-orgs' },
      { name: pc.dim(t('← back')), value: 'back' },
    ],
    pageSize: 8,
  });

  if (action === 'back') return false;

  log.blank();

  switch (action) {
    case 'gh-pr':
      await ghPrCommand();
      return true;
    case 'gh-review':
      await ghReviewCommand();
      return true;
    case 'gh-task':
      await ghTaskCommand();
      return true;
    case 'gh-projects':
      await ghProjectsCommand();
      return true;
    case 'gh-repos':
      await ghReposCommand();
      return true;
    case 'gh-orgs':
      await ghOrgsCommand();
      return true;
  }
}
