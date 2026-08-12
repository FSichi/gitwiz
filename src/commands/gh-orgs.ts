import pc from 'picocolors';
import { ensureGh } from '../core/gh.js';
import { currentUser, listOrgs } from '../core/gh-project.js';
import { t } from '../ui/i18n.js';
import { emitJson, isJsonMode, log, section } from '../ui/output.js';

export interface GhOrgsOptions {
  json?: boolean;
}

export async function ghOrgsCommand(opts: GhOrgsOptions = {}): Promise<void> {
  ensureGh();
  const orgs = listOrgs();
  const user = currentUser();

  if (isJsonMode()) {
    emitJson({ user, organizations: orgs });
    return;
  }

  section(t('Your GitHub account'));
  log.info(`  ${pc.bold(user)} ${pc.dim(t('(personal)'))}`);

  if (orgs.length === 0) {
    log.dim(`  ${t('You do not belong to any organization.')}`);
    return;
  }

  section(t('Organizations ({count})', { count: String(orgs.length) }));
  for (const org of orgs) {
    log.info(`  ${pc.cyan(org)}`);
  }
  log.blank();
  log.dim(t('See a board with: gitwiz gh projects'));
}
