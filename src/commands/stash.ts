import pc from 'picocolors';
import { captureGit, ensureGitRepo, isWorkingTreeClean, runGit, tryRunGit } from '../core/git.js';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
import { assertInteractive, confirm, input, select } from '../ui/prompts.js';

interface StashEntry {
  ref: string; // stash@{0}
  subject: string;
}

function listStashes(): StashEntry[] {
  const out = captureGit(['stash', 'list', '--format=%gd\x1f%gs']);
  if (out === '') return [];
  return out.split('\n').map((line) => {
    const [ref = '', subject = ''] = line.split('\x1f');
    return { ref, subject };
  });
}

async function pickStash(entries: StashEntry[], message: string): Promise<StashEntry> {
  return select({
    message,
    choices: entries.map((e) => ({
      name: `${e.ref.padEnd(11)} ${pc.dim(e.subject)}`,
      value: e,
      short: e.ref,
    })),
  });
}

export async function stashCommand(): Promise<void> {
  ensureGitRepo();
  assertInteractive();

  const entries = listStashes();
  const dirty = !isWorkingTreeClean();

  if (!dirty && entries.length === 0) {
    log.success(t('Nothing to stash and no stashes saved. All clean.'));
    return;
  }

  type StashAction = 'save' | 'restore' | 'show' | 'drop' | 'cancel';
  const choices: { name: string; value: StashAction; short?: string }[] = [];

  if (dirty) {
    choices.push({
      name: `${t('Save my current changes for later')} ${pc.dim(t('(clears your working tree)'))}`,
      value: 'save',
    });
  }
  if (entries.length > 0) {
    choices.push(
      { name: t('Restore a saved stash'), value: 'restore' },
      { name: t('Show what a stash contains'), value: 'show' },
      { name: `${pc.red(t('Delete a stash'))} ${pc.dim(t('(cannot be recovered)'))}`, value: 'drop' },
    );
  }
  choices.push({ name: pc.dim(t('Cancel')), value: 'cancel' });

  const action = await select({ message: t('What do you want to do?'), choices });

  switch (action) {
    case 'cancel':
      log.dim(t('Nothing changed.'));
      return;

    case 'save': {
      const description = await input({
        message: t('Describe these changes (so future-you recognizes them):'),
        validate: (value) => (value.trim() === '' ? t('A short description helps — it cannot be empty.') : true),
      });
      runGit(['stash', 'push', '-u', '-m', description.trim()]);
      log.success(t('Changes stashed. Bring them back later with "gitwiz stash".'));
      return;
    }

    case 'restore': {
      const entry = await pickStash(entries, t('Which stash do you want to restore?'));
      const mode = await select({
        message: t('How do you want to restore it?'),
        choices: [
          { name: `${t('Restore and remove it from the list')} ${pc.dim('(git stash pop)')}`, value: 'pop' as const },
          { name: `${t('Restore but keep a copy in the list')} ${pc.dim('(git stash apply)')}`, value: 'apply' as const },
        ],
      });
      if (!tryRunGit(['stash', mode, entry.ref])) {
        throw new GitwizError(
          [
            t('The stash could not be applied cleanly (conflicts with your current files).'),
            `  ${t('Fix the conflicted files, then stage them with git add.')}`,
            `  ${t('The stash entry is still saved — nothing was lost.')}`,
          ].join('\n'),
        );
      }
      log.success(t('Stash restored.'));
      return;
    }

    case 'show': {
      const entry = await pickStash(entries, t('Which stash do you want to inspect?'));
      log.blank();
      log.info(captureGit(['stash', 'show', '--stat', entry.ref]));
      log.blank();
      return;
    }

    case 'drop': {
      const entry = await pickStash(entries, t('Which stash do you want to delete?'));
      log.warn(t('This permanently deletes: {stash}', { stash: `${entry.ref} ${entry.subject}` }));
      const sure = await confirm({ message: t('Are you absolutely sure?'), default: false });
      if (!sure) {
        log.dim(t('Nothing changed.'));
        return;
      }
      runGit(['stash', 'drop', entry.ref]);
      log.success(t('Stash deleted.'));
      return;
    }
  }
}
