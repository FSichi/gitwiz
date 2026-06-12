import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
    'Use [Conventional Commits](https://www.conventionalcommits.org): `type(scope): description` — imperative mood, subject ≤ 72 chars.',
    `Types: ${commitTypeList}.`,
    `Only ${changelogTypes.join(', ')} appear in the changelog; a breaking change uses ${code('!')} or a ${code('BREAKING CHANGE:')} footer.`,
    '',
    '### Versioning',
    '`fix:` → patch · `feat:` → minor · breaking change → major.',
    '',
    '### Running gitwiz (non-interactively)',
    "Humans use the interactive `gitwiz` wizards. As an automated agent, **pass flags** so nothing prompts (a bare command will wait for input and hang):",
    '',
    `- New branch: \`gitwiz branch --type ${exampleBranchType} --name add-login\` (add \`--push\` to publish it)`,
    '- Commit: `gitwiz commit --type feat --scope auth -m "add login form"`',
    '  - stage everything first with `--all`',
    '  - breaking change: `--breaking "what changed and how to migrate"`',
    '- Start a release: `gitwiz release start --minor` (or `--patch`, `--major`, `--version 1.4.0`)',
    `- Finish a release: \`gitwiz release finish --yes\` (merges, tags ${code(tag)}, pushes)`,
    '- Read-only, safe anytime: `gitwiz status`',
    '',
    'If you fall back to raw git, produce branches and commits that match the rules above so human and agent history stay consistent.',
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
    const startIdx = original.indexOf(BLOCK_START);
    const endIdx = original.indexOf(BLOCK_END);

    if (startIdx !== -1 && endIdx > startIdx) {
      const before = original.slice(0, startIdx);
      const after = original.slice(endIdx + BLOCK_END.length);
      writeFileSync(filePath, `${before}${block}${after}`, 'utf8');
      return 'updated';
    }

    const base = original.replace(/\s*$/, '');
    writeFileSync(filePath, `${base}\n\n${block}\n`, 'utf8');
    return 'updated';
  }

  writeFileSync(filePath, `${newFileHeader}\n\n${block}\n`, 'utf8');
  return 'created';
}
