import fs from 'node:fs';
import path from 'node:path';
import { ROLES, ledger, readText, writeText } from './layout.mjs';
import { writeScopedApproval } from './risk-gates.mjs';
import { resolveGitBinding } from './verification-evidence.mjs';
import { listWorkItems, workCounts } from './work.mjs';

const DEFAULT_POLICY_VERSION = 1;

const REQUIRED = [
  '.factory/team.md',
  '.factory/routing.md',
  '.factory/decisions.md',
  '.factory/config.json',
  '.factory/governance.md',
  '.factory/profiles.json',
  '.factory/work/index.json',
  '.cursor/rules/factory.mdc',
  '.cursor/skills/factory-coordinator/SKILL.md',
  '.cursor/skills/factory-run/SKILL.md',
  '.github/agents/factory.agent.md',
  '.github/skills/factory-coordinator/SKILL.md',
  '.claude/skills/factory-coordinator/SKILL.md',
  ...ROLES.flatMap((role) => [
    `.factory/agents/${role}/charter.md`,
    `.factory/agents/${role}/history.md`,
  ]),
];

export function doctor(project) {
  const errors = [];
  const warnings = [];
  for (const rel of REQUIRED) {
    if (!fs.existsSync(path.join(project, rel))) errors.push(`missing ${rel}`);
  }
  const configPath = path.join(project, '.factory', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(readText(configPath));
      if (config.runtime !== 'ide') errors.push('config.json runtime must be "ide"');
      if (config.ideation !== false) errors.push('config.json ideation must be false');
    } catch {
      errors.push('config.json is not valid JSON');
    }
  }
  if (!fs.existsSync(path.join(project, 'openspec'))) warnings.push('openspec/ is not initialized');
  if (fs.existsSync(path.join(project, 'HALT'))) warnings.push('HALT file is present');
  return { errors, warnings };
}

export function status(project, _env) {
  const halt = fs.existsSync(path.join(project, 'HALT'));
  const active = readJson(path.join(project, '.factory', 'active-change.json'));
  const team = fs.existsSync(path.join(project, '.factory', 'team.md'))
    ? readText(path.join(project, '.factory', 'team.md')).trim()
    : '(not installed)';
  const now = fs.existsSync(path.join(project, '.factory', 'identity', 'now.md'))
    ? readText(path.join(project, '.factory', 'identity', 'now.md')).trim()
    : '(none)';
  const changes = listChanges(project);
  const change = active?.change || '';
  const counts = workCounts(project, change || undefined);
  const workLine = change
    ? `${counts.todo} todo, ${counts.in_progress} in progress, ${counts.done} done, ${counts.blocked} blocked`
    : summarizeAllWork(project);
  return [
    'Factory status',
    `HALT: ${halt ? 'yes' : 'no'}`,
    `Active change: ${active?.change || '(none)'}`,
    `OpenSpec changes: ${changes.join(', ') || '(none)'}`,
    `Work queue: ${workLine}`,
    '',
    team,
    '',
    now,
    '',
  ].join('\n');
}

function summarizeAllWork(project) {
  const items = listWorkItems(project);
  if (!items.length) return 'empty';
  const counts = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
  for (const item of items) {
    if (counts[item.status] !== undefined) counts[item.status] += 1;
  }
  return `${counts.todo} todo, ${counts.in_progress} in progress, ${counts.done} done, ${counts.blocked} blocked`;
}

/**
 * Issue a scoped approval JSON token and append its id to decisions.md.
 * Missing caller scope, validation failure, or a dirty non-run-state tree
 * writes nothing (no approval file, no decisions line).
 *
 * @param {string} project
 * @param {string} id
 * @param {string} note
 * @param {{ change?: string, task?: string, action?: string, approver?: string, expiry?: string }} [scope]
 * @returns {string} path written
 */
export function approve(project, id, note, scope = {}) {
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(id)) {
    throw new Error('Usage: idefactory approve <id> --note "..." --change ... --task ... --action ... --approver ... --expiry ...');
  }
  if (!note) throw new Error('--note is required');
  const decisions = path.join(project, '.factory', 'decisions.md');
  if (!fs.existsSync(decisions)) throw new Error('No .factory/decisions.md. Run idefactory init first.');

  const { sourceRevision, worktreeClean } = resolveGitBinding(project);
  if (!worktreeClean || !sourceRevision) {
    throw new Error('approval requires a clean worktree and resolvable HEAD (factory run-state dirt ignored)');
  }

  const issuance = new Date().toISOString();
  const record = {
    schemaVersion: 1,
    change: scope.change,
    task: scope.task,
    sourceRevision,
    action: scope.action,
    approver: scope.approver,
    issuance,
    expiry: scope.expiry,
    policyVersion: readPolicyVersion(project),
    note,
  };

  let file;
  try {
    file = writeScopedApproval(project, id, record);
  } catch (error) {
    // Validator / write failure must leave decisions.md untouched.
    throw error;
  }

  const stamp = stampNow();
  const entry = `\n## ${stamp.slice(0, 10)} accepted ${id}\n\nStatus: accepted\nId: ${id}\nNote: ${note}\n`;
  fs.appendFileSync(decisions, entry.endsWith('\n') ? entry : `${entry}\n`);
  ledger(project, 'accepted', { id });
  return file;
}

export function reject(project, id, note) {
  return recordDecision(project, id, note, 'rejected');
}

function readPolicyVersion(project) {
  const configPath = path.join(project, '.factory', 'config.json');
  if (!fs.existsSync(configPath)) return DEFAULT_POLICY_VERSION;
  try {
    const config = JSON.parse(readText(configPath));
    const version = config?.governance?.policyVersion;
    if (Number.isInteger(version) && version > 0) return version;
  } catch {
    // fall through to default
  }
  return DEFAULT_POLICY_VERSION;
}

export function lockout(project, { agent, reviewer, reason }) {
  if (!agent || !/^[a-z0-9-]+$/.test(agent)) throw new Error('Usage: idefactory lockout --agent <id> --reason "..."');
  if (!reason) throw new Error('lockout requires --reason');
  const who = reviewer || 'reviewer';
  const stamp = stampNow();
  const file = path.join(project, '.factory', 'orchestration', `${stamp}-lockout.md`);
  const body = `# Lockout\n\nAgent: ${agent}\nReviewer: ${who}\nReason: ${reason}\n`;
  writeText(file, body);
  ledger(project, 'lockout', { agent, reviewer: who });
  return file;
}

function recordDecision(project, id, note, status) {
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(id)) {
    throw new Error(`Usage: idefactory ${status === 'accepted' ? 'approve' : 'reject'} <id> --note "..."`);
  }
  if (!note) throw new Error('--note is required');
  const decisions = path.join(project, '.factory', 'decisions.md');
  if (!fs.existsSync(decisions)) throw new Error('No .factory/decisions.md. Run idefactory init first.');
  const stamp = stampNow();
  const entry = `\n## ${stamp.slice(0, 10)} ${status} ${id}\n\nStatus: ${status}\nId: ${id}\nNote: ${note}\n`;
  fs.appendFileSync(decisions, entry.endsWith('\n') ? entry : `${entry}\n`);
  const file = path.join(project, '.factory', 'approvals', `${stamp}-${id}.md`);
  writeText(file, `# ${status} ${id}\n\n${note}\n`);
  ledger(project, status, { id });
  return file;
}

function listChanges(project) {
  const dir = path.join(project, 'openspec', 'changes');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .map((entry) => entry.name)
    .sort();
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}

function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
