const CANONICAL_PREAMBLE =
  '# Changelog\n\nAll notable changes to this project will be documented in this file.';

/** Extract the semver version from a release heading like "## [1.2.3](…)" or "## v1.2.3 (date)". */
function versionOfBlock(block: string): string | null {
  const heading = block.split('\n', 1)[0] ?? '';
  const match = heading.match(/^##\s+\[?v?(\d+\.\d+\.\d+[^\]\s)]*)/);
  return match?.[1] ?? null;
}

/**
 * Structurally merge a freshly rendered release section into an existing CHANGELOG.
 *
 * Everything before the first "## " heading is treated as the preamble and kept
 * verbatim (badges, custom intros — no boilerplate-stripping regexes). Existing
 * release blocks are kept in order; a block for the same version is replaced,
 * making re-runs idempotent. CRLF files stay CRLF.
 */
export function mergeChangelog(
  existing: string | null,
  newSection: string,
  newVersion: string,
): string {
  const hadCrlf = existing?.includes('\r\n') ?? false;
  const section = newSection.replace(/\r\n/g, '\n').trimEnd();

  let preamble = CANONICAL_PREAMBLE;
  let blocks: string[] = [];

  const normalized = existing?.replace(/\r\n/g, '\n') ?? null;
  if (normalized !== null && normalized.trim() !== '') {
    const lines = normalized.split('\n');
    const firstHeading = lines.findIndex((line) => /^## /.test(line));
    if (firstHeading === -1) {
      preamble = normalized.trimEnd();
    } else {
      preamble = lines.slice(0, firstHeading).join('\n').trimEnd();
      let blockStart = firstHeading;
      for (let i = firstHeading + 1; i <= lines.length; i++) {
        if (i === lines.length || /^## /.test(lines[i]!)) {
          blocks.push(lines.slice(blockStart, i).join('\n').trimEnd());
          blockStart = i;
        }
      }
    }
  }

  blocks = blocks.filter((block) => versionOfBlock(block) !== newVersion);

  const parts = [preamble, section, ...blocks].filter((part) => part !== '');
  let result = `${parts.join('\n\n')}\n`;
  if (hadCrlf) result = result.replace(/\n/g, '\r\n');
  return result;
}
