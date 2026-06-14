#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { branchCommand } from './commands/branch.js';
import { commitCommand } from './commands/commit.js';
import { initCommand } from './commands/init.js';
import { menuCommand } from './commands/menu.js';
import { releaseFinishCommand } from './commands/release-finish.js';
import { releaseStartCommand } from './commands/release-start.js';
import { stashCommand } from './commands/stash.js';
import { statusCommand } from './commands/status.js';
import { syncCommand } from './commands/sync.js';
import { undoCommand } from './commands/undo.js';
import { updateCommand } from './commands/update.js';
import { checkForUpdates } from './core/update-checker.js';
import { GitwizError } from './ui/errors.js';
import { t } from './ui/i18n.js';
import { log, setVerbose } from './ui/output.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { name: string; version: string };

checkForUpdates(pkg);

const program = new Command();

program
  .name('gitwiz')
  .description(t('Friendly git workflows — wizards for branching, commits, releases, sync, and undo'))
  .version(pkg.version)
  .option('--verbose', t('also echo the read-only git commands gitwiz runs'))
  .hook('preAction', (thisCommand) => {
    setVerbose(Boolean(thisCommand.opts().verbose));
    // Each command guards interactivity itself, so flag-driven runs work headless.
  });

program
  .command('init')
  .description(t('Set up gitwiz in this repository (branches, tag prefix)'))
  .action(initCommand);

program
  .command('branch')
  .description(t('Start a new work branch (feature, bugfix, hotfix, …) the right way'))
  .option('-t, --type <type>', t('branch type (feature, bugfix, …) — runs without prompts when used with --name'))
  .option('-n, --name <name>', t('branch name'))
  .option('--push', t('push the new branch to origin'))
  .action(branchCommand);

program
  .command('commit')
  .description(t('Create a well-formed commit with a guided wizard'))
  .option('-t, --type <type>', t('commit type (feat, fix, …) — runs without prompts when used with -m'))
  .option('-s, --scope <scope>', t('commit scope'))
  .option('-m, --message <description>', t('commit description'))
  .option('--breaking [description]', t('mark as a breaking change (optionally with a migration note)'))
  .option('-a, --all', t('stage all changes before committing'))
  .option('--allow-protected', t('allow committing directly to a protected branch'))
  .action(commitCommand);

program
  .command('status')
  .description(t('Where am I and what should I do next?'))
  .action(() => statusCommand());

program
  .command('sync')
  .description(t('Safely bring the latest changes into your branch'))
  .action(syncCommand);

program
  .command('undo')
  .description(t('Undo things safely: commits, staged files, local changes'))
  .action(undoCommand);

program
  .command('stash')
  .description(t('Set changes aside for later and bring them back safely'))
  .action(stashCommand);

program
  .command('update')
  .description(t('Update gitwiz to the latest version'))
  .option('--npm', t('use npm as package manager'))
  .option('--yarn', t('use yarn as package manager'))
  .option('--pnpm', t('use pnpm as package manager'))
  .option('--bun', t('use bun as package manager'))
  .action(async (opts) => {
    const pm = opts.npm ? 'npm' : opts.yarn ? 'yarn' : opts.pnpm ? 'pnpm' : opts.bun ? 'bun' : undefined;
    await updateCommand({ packageManager: pm });
  });

const release = program
  .command('release')
  .description(t('Cut and publish versions with changelog generation'));

release
  .command('start')
  .description(t('Start a release: bump the version and generate the changelog'))
  .option('--major', t('bump the major version (without prompting)'))
  .option('--minor', t('bump the minor version (without prompting)'))
  .option('--patch', t('bump the patch version (without prompting)'))
  .option('--version <version>', t('set an exact version (without prompting)'))
  .action(releaseStartCommand);

release
  .command('finish')
  .description(t('Finish the open release: merge, tag, push and clean up'))
  .option('-y, --yes', t('skip the confirmation prompt (for automation)'))
  .action(releaseFinishCommand);

// No subcommand: launch the interactive menu in a terminal, or show help otherwise.
program.action(async () => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    program.outputHelp();
    return;
  }
  await menuCommand();
});

try {
  await program.parseAsync();
} catch (err) {
  if (err instanceof Error && err.name === 'ExitPromptError') {
    log.dim(t('Cancelled.'));
    process.exit(130);
  }
  if (err instanceof GitwizError) {
    log.error(err.message);
    if (err.hint) log.dim(`  ${err.hint}`);
    process.exit(1);
  }
  throw err;
}
