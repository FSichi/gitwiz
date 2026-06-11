#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { branchCommand } from './commands/branch.js';
import { commitCommand } from './commands/commit.js';
import { initCommand } from './commands/init.js';
import { menuCommand } from './commands/menu.js';
import { releaseFinishCommand } from './commands/release-finish.js';
import { releaseStartCommand } from './commands/release-start.js';
import { statusCommand } from './commands/status.js';
import { syncCommand } from './commands/sync.js';
import { undoCommand } from './commands/undo.js';
import { GitwizError } from './ui/errors.js';
import { log, setVerbose } from './ui/output.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const program = new Command();

program
  .name('gitwiz')
  .description('Friendly git workflows — wizards for branching, commits, releases, sync, and undo')
  .version(pkg.version)
  .option('--verbose', 'also echo the read-only git commands gitwiz runs')
  .hook('preAction', (thisCommand) => {
    setVerbose(Boolean(thisCommand.opts().verbose));
    // Each command guards interactivity itself, so flag-driven runs work headless.
  });

program
  .command('init')
  .description('Set up gitwiz in this repository (branches, tag prefix)')
  .action(initCommand);

program
  .command('branch')
  .description('Start a new work branch (feature, bugfix, hotfix, …) the right way')
  .option('-t, --type <type>', 'branch type (feature, bugfix, …) — runs without prompts when used with --name')
  .option('-n, --name <name>', 'branch name')
  .option('--push', 'push the new branch to origin')
  .action(branchCommand);

program
  .command('commit')
  .description('Create a well-formed commit with a guided wizard')
  .option('-t, --type <type>', 'commit type (feat, fix, …) — runs without prompts when used with -m')
  .option('-s, --scope <scope>', 'commit scope')
  .option('-m, --message <description>', 'commit description')
  .option('--breaking [description]', 'mark as a breaking change (optionally with a migration note)')
  .option('-a, --all', 'stage all changes before committing')
  .action(commitCommand);

program
  .command('status')
  .description('Where am I and what should I do next?')
  .action(() => statusCommand());

program
  .command('sync')
  .description('Safely bring the latest changes into your branch')
  .action(syncCommand);

program
  .command('undo')
  .description('Undo things safely: commits, staged files, local changes')
  .action(undoCommand);

const release = program
  .command('release')
  .description('Cut and publish versions with changelog generation');

release
  .command('start')
  .description('Start a release: bump the version and generate the changelog')
  .option('--major', 'bump the major version (without prompting)')
  .option('--minor', 'bump the minor version (without prompting)')
  .option('--patch', 'bump the patch version (without prompting)')
  .option('--version <version>', 'set an exact version (without prompting)')
  .action(releaseStartCommand);

release
  .command('finish')
  .description('Finish the open release: merge, tag, push and clean up')
  .option('-y, --yes', 'skip the confirmation prompt (for automation)')
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
    log.dim('Cancelled.');
    process.exit(130);
  }
  if (err instanceof GitwizError) {
    log.error(err.message);
    if (err.hint) log.dim(`  ${err.hint}`);
    process.exit(1);
  }
  throw err;
}
