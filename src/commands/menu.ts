import { readFileSync } from 'node:fs';
import pc from 'picocolors';
import { t } from '../ui/i18n.js';
import { banner, divider, log } from '../ui/output.js';
import { select } from '../ui/prompts.js';
import { branchCommand } from './branch.js';
import { commitCommand } from './commit.js';
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
  | 'init'
  | 'update'
  | 'exit';

/** Interactive launcher shown when `gitwiz` is run with no command (and a TTY). */
export async function menuCommand(): Promise<void> {
  banner(version);
  divider();

  const action = await select<MenuAction>({
    message: t('What do you want to do?'),
    choices: [
      { name: `${pc.bold('status')}           ${pc.dim('— where am I and what to do next')}`, value: 'status' },
      { name: `${pc.bold('commit')}           ${pc.dim('— create a guided commit')}`, value: 'commit' },
      { name: `${pc.bold('branch')}           ${pc.dim('— start a new work branch')}`, value: 'branch' },
      { name: `${pc.bold('sync')}             ${pc.dim('— update my branch safely')}`, value: 'sync' },
      { name: `${pc.bold('undo')}             ${pc.dim('— undo something safely')}`, value: 'undo' },
      { name: `${pc.bold('stash')}            ${pc.dim('— set changes aside for later')}`, value: 'stash' },
      { name: `${pc.bold('release start')}    ${pc.dim('— bump version + changelog')}`, value: 'release-start' },
      { name: `${pc.bold('release finish')}   ${pc.dim('— merge, tag, publish')}`, value: 'release-finish' },
      { name: `${pc.bold('init')}             ${pc.dim('— set up gitwiz here')}`, value: 'init' },
      { name: `${pc.bold('update')}           ${pc.dim('— update to latest version')}`, value: 'update' },
      { name: pc.dim(t('exit')), value: 'exit' },
    ],
    pageSize: 12,
  });

  log.blank();

  switch (action) {
    case 'status':
      statusCommand();
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
      log.dim(t('Bye!'));
      return;
  }
}
