import pc from 'picocolors';
import { loadConfig } from '../core/config.js';
import { buildCommitHeader, buildCommitMessage, normalizeScope } from '../core/commit-message.js';
import { captureGit, ensureGitRepo, runGit } from '../core/git.js';
import { GitwizError } from '../ui/errors.js';
import { box, log } from '../ui/output.js';
import { checkbox, confirm, input, select } from '../ui/prompts.js';

function getStagedFiles(): string[] {
  return captureGit(['diff', '--name-only', '--cached']).split('\n').filter(Boolean);
}

/** Changed (tracked) + untracked files that could be staged. */
function getStageableFiles(): string[] {
  const lines = captureGit(['status', '--porcelain']).split('\n').filter(Boolean);
  const files: string[] = [];
  for (const line of lines) {
    const xy = line.slice(0, 2);
    if (xy === '??' || xy[1] !== ' ') {
      let path = line.slice(3);
      const arrow = path.indexOf(' -> ');
      if (arrow !== -1) path = path.slice(arrow + 4);
      files.push(path);
    }
  }
  return files;
}

export async function commitCommand(): Promise<void> {
  ensureGitRepo();
  const { config } = loadConfig();

  let staged = getStagedFiles();

  if (staged.length === 0) {
    const stageable = getStageableFiles();
    if (stageable.length === 0) {
      log.success('Working tree clean — nothing to commit.');
      return;
    }
    log.info('No files are staged yet.');
    const toStage = await checkbox({
      message: 'Pick the files to include in this commit:',
      choices: stageable.map((f) => ({ name: f, value: f })),
    });
    if (toStage.length === 0) {
      log.dim('No files selected — nothing to commit.');
      return;
    }
    runGit(['add', '--', ...toStage]);
    staged = getStagedFiles();
  }

  log.blank();
  log.info(pc.bold('Files in this commit:'));
  for (const file of staged) log.info(`  ${pc.green('+')} ${file}`);
  log.blank();

  const type = await select({
    message: 'Type of change:',
    choices: config.commitTypes.map((t) => ({
      name: `${t.emoji} ${t.type.padEnd(9)} ${pc.dim(t.description)}`,
      value: t.type,
      short: t.type,
    })),
    pageSize: 12,
  });

  const scopeRaw = await input({
    message: `Scope ${pc.dim('(optional — the area affected, e.g. api, ui, auth)')}:`,
  });
  const scope = normalizeScope(scopeRaw) || undefined;

  const description = await input({
    message: 'Short description (imperative: "add", "fix", not "added"):',
    validate: (value) => (value.trim() === '' ? 'Description cannot be empty.' : true),
  });

  const breaking = await confirm({
    message: 'Does this break existing behavior (breaking change)?',
    default: false,
  });
  let breakingDescription: string | undefined;
  if (breaking) {
    breakingDescription = await input({
      message: 'Describe what breaks and how to migrate:',
    });
  }

  const parts = { type, scope, description, breaking, breakingDescription };
  const header = buildCommitHeader(parts);
  if (header.length > 72) {
    log.warn(`The first line is ${header.length} characters — try to keep it under 72.`);
  }

  const message = buildCommitMessage(parts);
  log.blank();
  box(message.split('\n'));
  log.blank();

  const proceed = await confirm({ message: 'Create this commit?', default: true });
  if (!proceed) {
    log.dim('Commit cancelled. Your files are still staged.');
    return;
  }

  try {
    runGit(['commit', '-m', message]);
  } catch (err) {
    if (err instanceof GitwizError) {
      throw new GitwizError('The commit was rejected (a git hook may have failed).', {
        hint: 'Fix the reported issue and run "gitwiz commit" again.',
      });
    }
    throw err;
  }
  log.success('Commit created.');
}
