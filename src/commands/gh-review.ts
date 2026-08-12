import pc from 'picocolors';
import { captureGh, captureGhJson, ensureGh, ensureRepoSlug, runGh } from '../core/gh.js';
import { currentUser } from '../core/gh-project.js';
import { ensureGitRepo } from '../core/git.js';
import { GitwizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { box, emitJson, isJsonMode, log, section } from '../ui/output.js';
import { assertInteractive, confirm, input, select } from '../ui/prompts.js';

export interface GhReviewOptions {
  pr?: string;
  approve?: boolean;
  requestChanges?: boolean;
  comment?: string;
  json?: boolean;
}

interface PrSummary {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  author: { login: string };
  headRefName: string;
  baseRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  files?: { path: string; additions: number; deletions: number }[];
  reviews?: { author: { login: string }; state: string }[];
  statusCheckRollup?: { name?: string; conclusion?: string; status?: string }[];
}

const PR_FIELDS =
  'number,title,url,isDraft,author,headRefName,baseRefName,additions,deletions,changedFiles,files,reviews,statusCheckRollup';

/**
 * Reduce the raw check rollup to counts. Kept pure: gh returns a mixed shape
 * (Actions runs carry `conclusion`, external statuses carry `state`), and the
 * reduction is the part worth pinning down in tests.
 */
export function summarizeChecks(
  rollup: { conclusion?: string; status?: string }[] | undefined,
): { passed: number; failed: number; pending: number } {
  const summary = { passed: 0, failed: 0, pending: 0 };
  for (const check of rollup ?? []) {
    const outcome = (check.conclusion ?? '').toUpperCase();
    if (outcome === 'SUCCESS' || outcome === 'NEUTRAL' || outcome === 'SKIPPED') summary.passed++;
    else if (outcome === '') summary.pending++;
    else summary.failed++;
  }
  return summary;
}

export async function ghReviewCommand(opts: GhReviewOptions = {}): Promise<void> {
  ensureGitRepo();
  ensureGh();
  const slug = ensureRepoSlug();
  const nonInteractive = Boolean(opts.approve || opts.requestChanges || opts.comment);

  // Resolve which PR to look at.
  let number: number;
  if (opts.pr) {
    number = Number(opts.pr);
    if (Number.isNaN(number)) {
      throw new GitwizError(t('"{value}" is not a pull request number.', { value: opts.pr }));
    }
  } else {
    const open = captureGhJson<PrSummary[]>([
      'pr', 'list', '--repo', slug, '--state', 'open', '--limit', '50',
      '--json', 'number,title,author,headRefName,isDraft',
    ]);
    // JSON first, and unconditionally: an empty list is still a valid answer, and
    // a caller parsing stdout must never receive nothing at all.
    if (isJsonMode()) {
      emitJson({ repo: slug, count: open.length, pullRequests: open });
      return;
    }
    if (open.length === 0) {
      log.info(t('There are no open pull requests in {repo}.', { repo: slug }));
      return;
    }
    assertInteractive();
    number = await select({
      message: t('Which pull request do you want to review?'),
      choices: open.map((pr) => ({
        name: `#${pr.number} ${pr.title}`,
        value: pr.number,
        hint: `${pr.author.login}${pr.isDraft ? t(' · draft') : ''}`,
      })),
    });
  }

  const pr = captureGhJson<PrSummary>(['pr', 'view', String(number), '--repo', slug, '--json', PR_FIELDS]);
  const checks = summarizeChecks(pr.statusCheckRollup);

  if (isJsonMode()) {
    emitJson({
      repo: slug,
      pullRequest: {
        number: pr.number, title: pr.title, url: pr.url, isDraft: pr.isDraft,
        author: pr.author.login, head: pr.headRefName, base: pr.baseRefName,
        additions: pr.additions, deletions: pr.deletions, changedFiles: pr.changedFiles,
      },
      checks,
      files: pr.files ?? [],
      reviews: (pr.reviews ?? []).map((r) => ({ author: r.author.login, state: r.state })),
    });
    return;
  }

  // Everything a reviewer needs to decide whether to read the diff at all.
  box(
    [
      `${pc.bold(pr.title)}${pr.isDraft ? pc.dim(` ${t('(draft)')}`) : ''}`,
      pc.dim(`${pr.author.login}  ·  ${pr.headRefName} → ${pr.baseRefName}`),
      `${pc.green(`+${pr.additions}`)} ${pc.red(`-${pr.deletions}`)} ${pc.dim(t('in {n} file(s)', { n: String(pr.changedFiles) }))}`,
      checks.failed > 0
        ? pc.red(t('{n} check(s) failing', { n: String(checks.failed) }))
        : checks.pending > 0
          ? pc.yellow(t('{n} check(s) still running', { n: String(checks.pending) }))
          : checks.passed > 0
            ? pc.green(t('All checks passed'))
            : pc.dim(t('No checks')),
      pc.dim(pr.url),
    ],
    `#${pr.number}`,
  );

  if (pr.files && pr.files.length > 0) {
    section(t('Files'));
    for (const file of pr.files.slice(0, 20)) {
      log.info(`  ${pc.dim(`+${file.additions} -${file.deletions}`)}  ${file.path}`);
    }
    if (pr.files.length > 20) {
      log.dim(t('  …and {n} more', { n: String(pr.files.length - 20) }));
    }
  }

  if (pr.reviews && pr.reviews.length > 0) {
    section(t('Reviews so far'));
    for (const review of pr.reviews) {
      log.info(`  ${review.author.login}: ${pc.dim(review.state)}`);
    }
  }

  // Flag-driven verdicts skip the menu entirely.
  if (nonInteractive) {
    await submit(slug, number, opts.approve ? 'approve' : opts.requestChanges ? 'request-changes' : 'comment', opts.comment ?? '');
    return;
  }

  assertInteractive();
  const me = currentUser();
  const isMine = pr.author.login === me;

  log.blank();
  const action = await select<'diff' | 'checkout' | 'approve' | 'changes' | 'comment' | 'web' | 'quit'>({
    message: t('What do you want to do?'),
    choices: [
      { name: t('See the diff'), value: 'diff' },
      { name: t('Check it out locally to run it'), value: 'checkout', hint: pr.headRefName },
      ...(isMine
        ? []
        : [
            { name: t('Approve'), value: 'approve' as const },
            { name: t('Request changes'), value: 'changes' as const },
          ]),
      { name: t('Leave a comment'), value: 'comment' },
      { name: t('Open in the browser'), value: 'web' },
      { name: t('Nothing, just looking'), value: 'quit' },
    ],
  });

  switch (action) {
    case 'diff':
      runGh(['pr', 'diff', String(number), '--repo', slug]);
      return;
    case 'checkout':
      runGh(['pr', 'checkout', String(number), '--repo', slug]);
      log.success(t('You are on "{branch}". Run the tests, then come back.', { branch: pr.headRefName }));
      return;
    case 'web':
      runGh(['pr', 'view', String(number), '--repo', slug, '--web']);
      return;
    case 'quit':
      return;
    default: {
      if (isMine) throw new GitwizError(t('GitHub does not let you review your own pull request.'));
      const verdict = action === 'approve' ? 'approve' : action === 'changes' ? 'request-changes' : 'comment';
      const message = await input({
        message: verdict === 'approve' ? t('Comment (optional)') : t('What needs to change?'),
        default: '',
        validate: (value) =>
          verdict !== 'approve' && value.trim() === '' ? t('Say what needs to change.') : true,
      });
      const go = await confirm({
        message:
          verdict === 'approve'
            ? t('Approve #{n}?', { n: String(number) })
            : verdict === 'request-changes'
              ? t('Request changes on #{n}?', { n: String(number) })
              : t('Comment on #{n}?', { n: String(number) }),
        default: true,
      });
      if (!go) {
        log.dim(t('Cancelled — nothing was sent.'));
        return;
      }
      await submit(slug, number, verdict, message);
    }
  }
}

async function submit(
  slug: string,
  number: number,
  verdict: 'approve' | 'request-changes' | 'comment',
  message: string,
): Promise<void> {
  const args = ['pr', 'review', String(number), '--repo', slug, `--${verdict}`];
  if (message.trim() !== '') args.push('--body', message);
  captureGh(args, { echo: true });
  log.success(
    verdict === 'approve'
      ? t('Approved.')
      : verdict === 'request-changes'
        ? t('Changes requested.')
        : t('Comment sent.'),
  );
}
