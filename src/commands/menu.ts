import pc from 'picocolors';
import { log } from '../ui/output.js';
import { select } from '../ui/prompts.js';
import { branchCommand } from './branch.js';
import { commitCommand } from './commit.js';
import { initCommand } from './init.js';
import { releaseFinishCommand } from './release-finish.js';
import { releaseStartCommand } from './release-start.js';
import { statusCommand } from './status.js';
import { syncCommand } from './sync.js';
import { undoCommand } from './undo.js';

type MenuAction =
  | 'status'
  | 'commit'
  | 'branch'
  | 'sync'
  | 'undo'
  | 'release-start'
  | 'release-finish'
  | 'init'
  | 'exit';

/** Interactive launcher shown when `gitwiz` is run with no command (and a TTY). */
export async function menuCommand(): Promise<void> {
  log.blank();
  const action = await select<MenuAction>({
    message: 'What do you want to do?',
    choices: [
      { name: `status           ${pc.dim('— where am I and what to do next')}`, value: 'status' },
      { name: `commit           ${pc.dim('— create a guided commit')}`, value: 'commit' },
      { name: `branch           ${pc.dim('— start a new work branch')}`, value: 'branch' },
      { name: `sync             ${pc.dim('— update my branch safely')}`, value: 'sync' },
      { name: `undo             ${pc.dim('— undo something safely')}`, value: 'undo' },
      { name: `release start    ${pc.dim('— bump version + changelog')}`, value: 'release-start' },
      { name: `release finish   ${pc.dim('— merge, tag, publish')}`, value: 'release-finish' },
      { name: `init             ${pc.dim('— set up gitwiz here')}`, value: 'init' },
      { name: pc.dim('exit'), value: 'exit' },
    ],
    pageSize: 10,
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
    case 'release-start':
      await releaseStartCommand();
      return;
    case 'release-finish':
      await releaseFinishCommand();
      return;
    case 'init':
      await initCommand();
      return;
    case 'exit':
      log.dim('Bye!');
      return;
  }
}
