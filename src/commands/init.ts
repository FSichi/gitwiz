import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { detectDevelopBranch, detectMainBranch, RC_FILENAME } from '../core/config.js';
import {
  getRepoRoot,
  hasRemote,
  isGitRepo,
  localBranchExists,
  remoteBranchExists,
  runGit,
  tryCaptureGit,
} from '../core/git.js';
import { rewriteJson } from '../core/json-file.js';
import { log } from '../ui/output.js';
import { confirm, input, select } from '../ui/prompts.js';

export async function initCommand(): Promise<void> {
  if (!isGitRepo()) {
    const create = await confirm({
      message: 'This folder is not a git repository yet. Initialize one here?',
      default: true,
    });
    if (!create) {
      log.dim('Cancelled.');
      return;
    }
    runGit(['init', '-b', 'main']);
  }

  const repoRoot = getRepoRoot();
  const detectedMain = detectMainBranch();
  const detectedDevelop = detectDevelopBranch(detectedMain);

  const mainBranch = await input({
    message: `Production branch ${pc.dim('(your stable, deployed code)')}: `,
    default: detectedMain,
  });
  const developBranch = await input({
    message: `Work base branch ${pc.dim('(where new branches start; same as production = trunk-based)')}: `,
    default: detectedDevelop,
  });
  const tagPrefix = await input({
    message: `Release tag prefix ${pc.dim('("v" tags releases as v1.2.3; leave empty for 1.2.3)')}: `,
    default: 'v',
  });

  // Offer to create the work base branch if it doesn't exist yet.
  const hasCommits = tryCaptureGit(['rev-parse', 'HEAD']) !== null;
  if (developBranch !== mainBranch && !localBranchExists(developBranch)) {
    if (remoteBranchExists(developBranch)) {
      log.dim(`Branch ${developBranch} exists on origin — it will be used when needed.`);
    } else if (!hasCommits) {
      log.warn(`No commits yet — make your first commit, then create ${developBranch}.`);
    } else if (localBranchExists(mainBranch)) {
      const create = await confirm({
        message: `Branch "${developBranch}" does not exist. Create it from ${mainBranch}?`,
        default: true,
      });
      if (create) {
        runGit(['branch', developBranch, mainBranch]);
        if (hasRemote()) {
          const push = await confirm({
            message: `Push ${developBranch} to origin?`,
            default: true,
          });
          if (push) runGit(['push', '-u', 'origin', developBranch]);
        }
      }
    }
  }

  const settings = { mainBranch, developBranch, tagPrefix };

  // Choose where the config lives.
  const pkgPath = join(repoRoot, 'package.json');
  let destination: 'rc' | 'package.json' = 'rc';
  if (existsSync(pkgPath)) {
    destination = await select({
      message: 'Where should the wizgit config be saved?',
      choices: [
        { name: `${RC_FILENAME} ${pc.dim('(recommended — its own file)')}`, value: 'rc' as const },
        { name: 'package.json ("wizgit" key)', value: 'package.json' as const },
      ],
    });
  }

  if (destination === 'rc') {
    writeFileSync(join(repoRoot, RC_FILENAME), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    log.success(`Saved ${RC_FILENAME}`);
  } else {
    rewriteJson(pkgPath, (pkg) => {
      pkg.wizgit = settings;
    });
    log.success('Saved "wizgit" key in package.json');
  }

  log.blank();
  log.info(pc.bold('Setup complete:'));
  log.info(`  Production branch:  ${pc.cyan(mainBranch)}`);
  log.info(`  Work base branch:   ${pc.cyan(developBranch)}`);
  log.info(`  Release tags:       ${pc.cyan(`${tagPrefix}1.2.3`)}`);
  log.blank();
  log.dim('  Next: run "wizgit branch" to start working, or "wizgit status" anytime you feel lost.');
}
