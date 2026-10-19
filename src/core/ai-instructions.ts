import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GitwizConfig } from './config.js';

export const BLOCK_START = '<!-- gitwiz:start -->';
export const BLOCK_END = '<!-- gitwiz:end -->';

function code(value: string): string {
  return `\`${value}\``;
}

/**
 * Build the managed instruction block (between markers) that teaches an AI agent
 * this repo's git conventions and the non-interactive gitwiz commands. Generated
 * from the resolved config so it always reflects the project's real setup.
 */
export function buildAgentInstructions(config: GitwizConfig): string {
  const developPrefixes = config.branchTypes
    .filter((t) => t.base === 'develop')
    .map((t) => code(t.prefix));
  const mainPrefixes = config.branchTypes
    .filter((t) => t.base === 'main')
    .map((t) => code(t.prefix));

  const commitTypeList = config.commitTypes.map((t) => t.type).join(', ');
  const changelogTypes = config.commitTypes
    .filter((t) => t.changelogSection !== false)
    .map((t) => code(t.type));

  const exampleBranchType = config.branchTypes[0]?.type ?? 'feature';
  const tag = `${config.tagPrefix}1.4.0`;
  const cli = '"$(npm root -g)/@fsichi/gitwiz/dist/cli.js"';
  // Say exactly where a release lands: an agent once told a user it merges to
  // main when the config merged it into the work branch only.
  const releaseTargets = [config.developBranch];
  if (config.release.alsoMergeToMain && config.mainBranch !== config.developBranch) {
    releaseTargets.push(config.mainBranch);
  }

  const lines: string[] = [
    BLOCK_START,
    '## Git workflow (gitwiz)',
    '',
    'This repository uses [gitwiz](https://github.com/FSichi/gitwiz) and its conventions. Apply them to **every** git action.',
    '',
    '### Branches',
    'Create a branch *before* you start editing. Name it `<type>/<kebab-case>`. Base branch by type:',
    `- ${developPrefixes.join(', ')} → branch from ${code(config.developBranch)}`,
  ];
  if (mainPrefixes.length > 0) {
    lines.push(`- ${mainPrefixes.join(', ')} → branch from ${code(config.mainBranch)} (urgent production fix)`);
  }
  if (config.protectedBranches.length > 0) {
    lines.push(
      `Never commit directly to ${config.protectedBranches.map(code).join(', ')} — changes arrive via work branches and PRs.`,
    );
  }
  lines.push(
    '',
    '### Commits',
    'Use [Conventional Commits](https://www.conventionalcommits.org): `type(scope): description` — imperative mood, lowercase start, subject ≤ 72 chars. If the repo has commit hooks (commitlint) with other limits, theirs win.',
    `Types: ${commitTypeList}.`,
    `Only ${changelogTypes.join(', ')} appear in the changelog; a breaking change uses ${code('!')} or a ${code('BREAKING CHANGE:')} footer.`,
    '',
    '### Versioning',
    '`fix:` → patch · `feat:` → minor · breaking change → major.',
    '',
    '### Using gitwiz as an agent',
    'Create branches, commits, pull requests and releases **with gitwiz**. You have no terminal, so pass flags: a command missing one stops at once with an error naming it — it never waits for input. Exit code 0 means it happened; otherwise read the error and the hint under it. Do not pipe gitwiz into `tail`/`head` before `&&`: the pipe hides a failure and the next command runs anyway.',
    '',
    '- Where things stand, as data: `gitwiz status --json` (branch, base, ahead/behind, files, suggested next step)',
    `- New branch: \`gitwiz branch --type ${exampleBranchType} --name add-login\` — uncommitted changes come along; \`--push\` publishes it`,
    '- Commit your files only: `gitwiz commit -m "feat(auth): add login form" -- src/auth/login.ts src/auth/form.ts`',
    '  - the same message can be split: `--type feat --scope auth -m "add login form"`',
    '  - `--all` commits every change in the tree — only when all of it is yours; with neither, what you staged with `git add` is committed',
    '  - the why or other details: `--body "<text>"`, or `--body-file <file>` for long text (no quoting trouble)',
    '  - breaking change: `--breaking "what changed and how to migrate"`',
    '  - a commit hook (e.g. commitlint) rejected it? Nothing was committed: fix what it reported and run the same command again',
    '- Pull request: `gitwiz gh pr --title "feat(auth): add login form" --body-file <file> --json` — pushes the branch first; the base follows the branch type (`--base` overrides); running it again on a branch with an open PR pushes the new commits',
    `  - from another branch, e.g. to promote: \`gitwiz gh pr --head ${config.developBranch === config.mainBranch ? 'release/1.4.0' : config.developBranch} --base ${config.mainBranch} --title "…"\``,
    '- Review: `gitwiz gh review --pr 42 --json` to read it; then `--approve`, `--request-changes --comment "<what to change>"` or `--comment "<text>"`',
    '- Task on a board: `gitwiz gh task --owner <org> --project <number> --title "<title>" --json`',
    `- Releases **publish**: \`gitwiz release start --patch\` (or \`--minor\`, \`--major\`, \`--version 1.4.0\`), then \`gitwiz release finish --yes\` merges the release into ${releaseTargets.map(code).join(' and ')}, tags ${code(tag)} and pushes. Run them only when the user asks for a release; \`gitwiz release finish --dry-run\` lists the steps without running them.`,
    '',
    'Plain git is the right tool for what gitwiz does not do — `git push`, `git merge`, `git fetch`, `git stash`, undoing things (its `sync`, `undo`, `stash` and `init` are wizards for humans). Keep the names and messages above when you use it.',
    'With `--json`, stdout carries only JSON — failures too: `{"error": "…", "hint": "…"}`. Refresh this block after updating gitwiz: `gitwiz init --agents`.',
    // cmd.exe prints this in the system language, so name the Spanish text too.
    `Windows: if a call fails before gitwiz even runs, with \`"C:\\…\\Author" is not recognized…\` or \`"C:\\…\\Author" no se reconoce…\` (an NVM for Windows shim and an argument with spaces), call it as \`node ${cli} <args>\`.`,
    BLOCK_END,
  );

  return lines.join('\n');
}

/**
 * Write the managed block into a file. If the file has an existing gitwiz block
 * (between the markers), replace just that block; otherwise append it; otherwise
 * create the file with a short header. Never touches content outside the markers.
 */
export function writeManagedBlock(
  filePath: string,
  block: string,
  newFileHeader: string,
): 'created' | 'updated' {
  if (existsSync(filePath)) {
    const original = readFileSync(filePath, 'utf8');
    // A CRLF file stays CRLF — no mixed line endings in a file someone owns.
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const ownBlock = block.replace(/\r?\n/g, eol);
    const startIdx = original.indexOf(BLOCK_START);
    const endIdx = original.indexOf(BLOCK_END);

    if (startIdx !== -1 && endIdx > startIdx) {
      const before = original.slice(0, startIdx);
      const after = original.slice(endIdx + BLOCK_END.length);
      writeFileSync(filePath, `${before}${ownBlock}${after}`, 'utf8');
      return 'updated';
    }

    const base = original.replace(/\s*$/, '');
    writeFileSync(filePath, `${base}${eol}${eol}${ownBlock}${eol}`, 'utf8');
    return 'updated';
  }

  writeFileSync(filePath, `${newFileHeader}\n\n${block}\n`, 'utf8');
  return 'created';
}

// Where Claude Code looks for project instructions, and the import line that
// points each of them at the repo-root AGENTS.md.
const CLAUDE_FILES: ReadonlyArray<readonly [string, string]> = [
  ['CLAUDE.md', '@AGENTS.md'],
  [join('.claude', 'CLAUDE.md'), '@../AGENTS.md'],
];

const AGENTS_IMPORT_RE = /^@(?:\.{1,2}\/)*AGENTS\.md\s*$/m;

/**
 * Claude Code reads AGENTS.md only while the repo has no CLAUDE.md; with one it
 * reads CLAUDE.md alone, so the gitwiz block would go unseen. Returns the
 * CLAUDE.md that needs the documented fix — an `@AGENTS.md` import at its top —
 * or null when there is none or it already imports AGENTS.md.
 */
export function claudeFileMissingImport(repoRoot: string): { relPath: string; importLine: string } | null {
  for (const [relPath, importLine] of CLAUDE_FILES) {
    const path = join(repoRoot, relPath);
    if (!existsSync(path)) continue;
    return AGENTS_IMPORT_RE.test(readFileSync(path, 'utf8')) ? null : { relPath, importLine };
  }
  return null;
}

/** Put the import line at the top of that CLAUDE.md, keeping its line endings. */
export function addAgentsImport(repoRoot: string, target: { relPath: string; importLine: string }): void {
  const path = join(repoRoot, target.relPath);
  const text = readFileSync(path, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(path, `${target.importLine}${eol}${eol}${text}`, 'utf8');
}
