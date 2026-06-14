import pc from 'picocolors';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
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
  log.blank();
  const action = await select<MenuAction>({
    message: t('What do you want to do?'),
    choices: [
      { name: `status           ${pc.dim(t('— where am I and what to do next'))}`, value: 'status' },
      { name: `commit           ${pc.dim(t('— create a guided commit'))}`, value: 'commit' },
      { name: `branch           ${pc.dim(t('— start a new work branch'))}`, value: 'branch' },
      { name: `sync             ${pc.dim(t('— update my branch safely'))}`, value: 'sync' },
      { name: `undo             ${pc.dim(t('— undo something safely'))}`, value: 'undo' },
      { name: `stash            ${pc.dim(t('— set changes aside for later'))}`, value: 'stash' },
      { name: `release start    ${pc.dim(t('— bump version + changelog'))}`, value: 'release-start' },
      { name: `release finish   ${pc.dim(t('— merge, tag, publish'))}`, value: 'release-finish' },
      { name: `init             ${pc.dim(t('— set up gitwiz here'))}`, value: 'init' },
      { name: `update           ${pc.dim(t('— update to latest version'))}`, value: 'update' },
      { name: pc.dim(t('exit')), value: 'exit' },
    ],
    pageSize: 11,
  });

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
