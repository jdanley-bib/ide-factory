import fs from 'node:fs';
import path from 'node:path';
import {
  ROLES,
  ledger,
  readText,
  templatesRoot,
  writeIfMissing,
  writeText,
} from './layout.mjs';
import {
  CONSUMER_WORKFLOW_RELATIVE,
  writeConsumerWorkflowIfAbsent,
} from './ci-scaffold.mjs';
import { syncAdapters } from './adapter-sync.mjs';
import { runOpenspec } from './openspec-cli.mjs';

const STATE_FILES = [
  'team.md',
  'routing.md',
  'decisions.md',
  'config.json',
  'governance.md',
  'ceremonies.md',
  'profiles.json',
  'checks.json',
  'README.md',
  'identity/now.md',
  'identity/wisdom.md',
];

function syncOptions(options) {
  return { force: Boolean(options.force), replace: options.replace || [] };
}

export function initProject(project, options = {}) {
  if (options.dryRun) {
    const sync = syncAdapters(project, { command: 'init', ...syncOptions(options), dryRun: true });
    return { created: plannedState(project), sync };
  }
  fs.mkdirSync(project, { recursive: true });
  const created = writeState(project, options);
  const sync = syncAdapters(project, { command: 'init', ...syncOptions(options) });
  ensureWorkScaffold(project);
  if (options.withOpenspec) ensureOpenspec(project, options.env || process.env);
  if (options.withBacklog) {
    // Deprecated: Backlog.md is no longer required. Kept for one release as a no-op hint.
    created.push('(deprecated --with-backlog ignored; use .factory/work)');
  }
  if (writeConsumerWorkflowIfAbsent(project).created) {
    created.push(CONSUMER_WORKFLOW_RELATIVE);
  }
  ledger(project, 'init', { created, adapters: sync.report.summary });
  return { created, sync };
}

export function upgradeProject(project, options = {}) {
  if (!fs.existsSync(path.join(project, '.factory', 'team.md'))) {
    throw new Error('No .factory/ team state. Run idefactory init first.');
  }
  const sync = syncAdapters(project, { command: 'upgrade', ...syncOptions(options), dryRun: Boolean(options.dryRun) });
  if (options.dryRun) return { sync };
  ledger(project, 'upgrade', { adapters: sync.report.summary });
  return { sync };
}

function plannedState(project) {
  const factory = path.join(project, '.factory');
  const missing = [];
  const consider = (rel) => {
    if (!fs.existsSync(path.join(factory, rel))) missing.push(rel);
  };
  for (const rel of STATE_FILES) consider(rel);
  for (const role of ROLES) {
    for (const leaf of ['charter.md', 'history.md']) consider(path.join('agents', role, leaf));
  }
  return missing;
}

function writeState(project, options) {
  const created = [];
  const factory = path.join(project, '.factory');
  const force = Boolean(options.forceRoster);
  for (const rel of STATE_FILES) {
    const from = path.join(templatesRoot, 'factory', rel);
    const to = path.join(factory, rel);
    if (force && (rel === 'team.md' || rel === 'routing.md')) {
      writeText(to, readText(from));
      created.push(rel);
      continue;
    }
    if (writeIfMissing(to, readText(from))) created.push(rel);
  }
  for (const role of ROLES) {
    for (const leaf of ['charter.md', 'history.md']) {
      const rel = path.join('agents', role, leaf);
      const from = path.join(templatesRoot, 'factory', rel);
      const to = path.join(factory, rel);
      if (force && leaf === 'charter.md') {
        writeText(to, readText(from));
        created.push(rel);
        continue;
      }
      if (writeIfMissing(to, readText(from))) created.push(rel);
    }
  }
  writeIfMissing(path.join(factory, 'approvals', '.gitkeep'), '');
  writeIfMissing(path.join(factory, 'orchestration', '.gitkeep'), '');
  ensureWorkScaffold(project);
  return created;
}

function ensureWorkScaffold(project) {
  const work = path.join(project, '.factory', 'work');
  writeIfMissing(path.join(work, 'index.json'), JSON.stringify({ version: 1, items: [] }, null, 2));
  writeIfMissing(path.join(work, 'items', '.gitkeep'), '');
  writeIfMissing(path.join(project, '.factory', 'attempts', '.gitkeep'), '');
}

function ensureOpenspec(project, env) {
  if (fs.existsSync(path.join(project, 'openspec', 'config.yaml'))) return;
  try {
    runOpenspec(project, [
      'init',
      '--tools', 'cursor,github-copilot,claude',
      '--no-copilot-cloud',
      '--no-animation',
    ], env);
  } catch (error) {
    if (error.code === 'NO_OPENSPEC') throw error;
    throw new Error(error.message || 'openspec init failed');
  }
}
