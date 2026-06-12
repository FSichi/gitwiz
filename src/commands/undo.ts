import pc from 'picocolors';
import {
  captureGit,
  ensureGitRepo,
  getInProgressOperation,
  isCommitPushed,
  runGit,
  tryCaptureGit,
} from '../core/git.js';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
import { assertInteractive, checkbox, confirm, input, select } from '../ui/prompts.js';

type UndoAction =
  | 'abort-operation'
  | 'undo-commit-keep'
  | 'undo-commit-discard'
  | 'unstage'
  | 'discard-changes'
  | 'reword'
  | 'cancel';

interface Choice {
  name: string;
  value: UndoAction;
  short?: string;
}

function entry(title: string, command: string, value: UndoAction): Choice {
  return { name: `${title}\n      ${pc.dim(`$ ${command}`)}`, value, short: title };
}

function getStagedFiles(): string[] {
  return captureGit(['diff', '--name-only', '--cached']).split('\n').filter(Boolean);
}

function getModifiedFiles(): string[] {
  return captureGit(['diff', '--name-only']).split('\n').filter(Boolean);
}

function getUntrackedFiles(): string[] {
  return captureGit(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
}

/** Guard for actions that rewrite the last commit: warn (and offer revert) when it's already pushed. */
async function guardPushedCommit(): Promise<'proceed' | 'reverted' | 'cancelled'> {
  if (!isCommitPushed('HEAD')) return 'proceed';

  log.warn(t('The last commit is already pushed — rewriting it will conflict with the remote.'));
  const choice = await select({
    message: t('How do you want to handle this?'),
    choices: [
      {
        name: `${t('Create a revert commit instead')} ${pc.dim(t('(safe — adds a new commit that undoes it)'))}`,
        value: 'revert' as const,
      },
      {
        name: `${t('Rewrite it anyway')} ${pc.dim(t('(you will need git push --force-with-lease)'))}`,
        value: 'proceed' as const,
      },
      { name: t('Cancel'), value: 'cancel' as const },
    ],
  });
  if (choice === 'cancel') return 'cancelled';
  if (choice === 'revert') {
    runGit(['revert', '--no-edit', 'HEAD']);
    log.success(t('Revert commit created.'));
    return 'reverted';
  }
  return 'proceed';
}

export async function undoCommand(): Promise<void> {
  ensureGitRepo();
  assertInteractive();

  const operation = getInProgressOperation();
  const lastCommit = tryCaptureGit(['log', '-1', '--format=%h %s']);
  const staged = getStagedFiles();
  const modified = getModifiedFiles();
  const untracked = getUntrackedFiles();

  const choices: Choice[] = [];

  if (operation) {
    choices.push(
      entry(
        `${t('Abort the {operation} in progress', { operation })} ${pc.dim(t('(back to how things were before it)'))}`,
        `git ${operation} --abort`,
        'abort-operation',
      ),
    );
  }
  if (lastCommit) {
    choices.push(
      entry(
        `${t('Undo the last commit, keep its changes')} ${pc.dim(`(${lastCommit})`)}`,
        'git reset --soft HEAD~1',
        'undo-commit-keep',
      ),
      entry(
        `${pc.red(t('Undo the last commit AND throw away its changes'))} ${pc.dim(`(${lastCommit})`)}`,
        'git reset --hard HEAD~1',
        'undo-commit-discard',
      ),
      entry(t('Change the last commit message'), 'git commit --amend -m "..."', 'reword'),
    );
  }
  if (staged.length > 0) {
    choices.push(
      entry(
        `${t('Unstage files')} ${pc.dim(t('({n} staged)', { n: staged.length }))}`,
        'git restore --staged <files>',
        'unstage',
      ),
    );
  }
  if (modified.length > 0 || untracked.length > 0) {
    choices.push(
      entry(
        `${pc.red(t('Throw away local changes in files'))} ${pc.dim(t('({n} files)', { n: modified.length + untracked.length }))}`,
        'git restore <files> / git clean -f <files>',
        'discard-changes',
      ),
    );
  }

  if (choices.length === 0) {
    log.success(t('Nothing to undo — no commits, no changes, all clean.'));
    return;
  }
  choices.push({ name: t('Cancel — nothing, I was just looking'), value: 'cancel', short: t('Cancel') });

  const action = await select({
    message: t('What do you want to undo?'),
    choices,
    pageSize: 12,
  });

  switch (action) {
    case 'cancel':
      log.dim(t('Nothing changed.'));
      return;

    case 'abort-operation': {
      runGit([operation!, '--abort']);
      log.success(t('The {operation} was aborted. Everything is back to how it was.', { operation: operation! }));
      return;
    }

    case 'undo-commit-keep': {
      const guard = await guardPushedCommit();
      if (guard !== 'proceed') return;
      runGit(['reset', '--soft', 'HEAD~1']);
      log.success(t('Last commit undone. Its changes are still staged — edit and recommit when ready.'));
      return;
    }

    case 'undo-commit-discard': {
      const guard = await guardPushedCommit();
      if (guard !== 'proceed') return;
      log.warn(t('This permanently discards the changes from: {commit}', { commit: lastCommit! }));
      const sure = await confirm({ message: t('Are you absolutely sure?'), default: false });
      if (!sure) {
        log.dim(t('Nothing changed.'));
        return;
      }
      runGit(['reset', '--hard', 'HEAD~1']);
      log.success(t('Last commit and its changes are gone.'));
      log.dim(`  ${t('(If you regret it: "git reflog" can still rescue it for a while.)')}`);
      return;
    }

    case 'reword': {
      const guard = await guardPushedCommit();
      if (guard !== 'proceed') return;
      const message = await input({
        message: t('New commit message:'),
        validate: (v) => (v.trim() === '' ? t('Message cannot be empty.') : true),
      });
      runGit(['commit', '--amend', '-m', message]);
      log.success(t('Commit message updated.'));
      return;
    }

    case 'unstage': {
      const files = await checkbox({
        message: t('Which files do you want to unstage?'),
        choices: staged.map((f) => ({ name: f, value: f, checked: true })),
      });
      if (files.length === 0) {
        log.dim(t('Nothing selected.'));
        return;
      }
      runGit(['restore', '--staged', '--', ...files]);
      log.success(t('Files unstaged. Their changes are still in your working tree.'));
      return;
    }

    case 'discard-changes': {
      const choicesList = [
        ...modified.map((f) => ({ name: `${f} ${pc.dim(t('(modified)'))}`, value: { file: f, untracked: false } })),
        ...untracked.map((f) => ({ name: `${f} ${pc.dim(t('(new file)'))}`, value: { file: f, untracked: true } })),
      ];
      const selected = await checkbox({
        message: t('Which files should lose their local changes?'),
        choices: choicesList,
      });
      if (selected.length === 0) {
        log.dim(t('Nothing selected.'));
        return;
      }
      log.warn(t('These changes cannot be recovered once discarded.'));
      const sure = await confirm({
        message: t('Discard changes in {n} file(s)?', { n: selected.length }),
        default: false,
      });
      if (!sure) {
        log.dim(t('Nothing changed.'));
        return;
      }
      const tracked = selected.filter((s) => !s.untracked).map((s) => s.file);
      const newFiles = selected.filter((s) => s.untracked).map((s) => s.file);
      if (tracked.length > 0) runGit(['restore', '--', ...tracked]);
      if (newFiles.length > 0) runGit(['clean', '-f', '--', ...newFiles]);
      log.success(t('Local changes discarded.'));
      return;
    }
  }
}
