import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { attemptPath, getAttempt } from './attempt.mjs';
import { attestationFailureReason } from './required-checks.mjs';
import { confirmPrincipal, readPolicyVersion } from './principal.mjs';
import { appendControlEvent } from './event-log.mjs';
import { ledger, readText, writeText } from './layout.mjs';
import { isFailingRed, redForKind, requiredTestKinds, retryKey } from './red-evidence.mjs';
import {
  canonicalJson,
  commandDigest,
  resolveGitBinding,
  validateCheckRecord,
} from './verification-evidence.mjs';
import { getWorkItem } from './work.mjs';

export const EXCEPTION_TYPES = ['reuse', 'waiver'];

const REQUIRED_RECORD_FIELDS = [
  'schemaVersion',
  'id',
  'type',
  'change',
  'task',
  'attemptId',
  'kind',
  'approver',
  'reason',
  'issuance',
  'policyVersion',
  'sourceRevision',
];

const EXCEPTION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

export function exceptionsDir(project) {
  return path.join(project, '.factory', 'exceptions', 'red');
}

export function exceptionFilePath(project, id) {
  return path.join(exceptionsDir(project), `${id}.json`);
}

function digestText(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('red exception must be an object');
  }
  for (const field of REQUIRED_RECORD_FIELDS) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      throw new Error(`red exception missing required field: ${field}`);
    }
  }
  if (!EXCEPTION_TYPES.includes(record.type)) {
    throw new Error(`red exception type must be one of: ${EXCEPTION_TYPES.join(', ')}`);
  }
  if (typeof record.id !== 'string' || !EXCEPTION_ID.test(record.id)) {
    throw new Error('red exception id is invalid');
  }
}

/**
 * Write one immutable exception file, then bind it to the attempt by digest.
 * The file is written first so a crash leaves an unbound file that satisfies nothing.
 *
 * @param {string} project
 * @param {string} attemptId
 * @param {object} record
 * @returns {{ file: string, digest: string, attempt: object }}
 */
export function bindRedException(project, attemptId, record) {
  validateRecord(record);
  if (record.attemptId !== attemptId) {
    throw new Error('red exception attemptId does not match the target attempt');
  }
  const attempt = getAttempt(project, attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);
  if (attempt.evidence?.redExceptions?.[record.kind]) {
    throw new Error(`attempt already has an exception for ${record.kind}`);
  }

  const file = exceptionFilePath(project, record.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(record, null, 2)}\n`;
  fs.writeFileSync(file, text, { flag: 'wx' });
  const digest = digestText(text);

  attempt.evidence = attempt.evidence || {};
  attempt.evidence.redExceptions = {
    ...(attempt.evidence.redExceptions || {}),
    [record.kind]: { id: record.id, type: record.type, digest },
  };
  attempt.updatedAt = new Date().toISOString();
  writeText(attemptPath(project, attemptId), JSON.stringify(attempt, null, 2));
  ledger(project, 'red-exception', {
    exceptionId: record.id,
    exceptionType: record.type,
    attemptId,
    kind: record.kind,
  });
  appendControlEvent(project, {
    type: 'red-exception.recorded',
    time: record.issuance,
    id: record.id,
    exceptionType: record.type,
    attemptId,
    change: record.change,
    task: record.task,
  });
  return { file, digest, attempt };
}

/**
 * Load the exception bound to an attempt and kind, or null when the pointer is
 * absent or the file is missing, altered, or bound to something else.
 */
export function readBoundException(project, attempt, kind) {
  const pointer = attempt?.evidence?.redExceptions?.[kind];
  if (!pointer || typeof pointer !== 'object') return null;
  if (!EXCEPTION_TYPES.includes(pointer.type)) return null;
  if (typeof pointer.id !== 'string' || !EXCEPTION_ID.test(pointer.id)) return null;
  let text;
  try {
    text = fs.readFileSync(exceptionFilePath(project, pointer.id), 'utf8');
  } catch {
    return null;
  }
  if (digestText(text) !== pointer.digest) return null;
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    record.id !== pointer.id
    || record.type !== pointer.type
    || record.attemptId !== attempt.id
    || record.kind !== kind
    || record.change !== attempt.change
    || record.task !== attempt.taskId
  ) {
    return null;
  }
  return record;
}

/**
 * Whether red is satisfied for one kind, and by what.
 * @returns {'cli'|'reuse'|'waiver'|'missing'}
 */
export function redSatisfaction(project, attempt, kind) {
  if (isFailingRed(redForKind(attempt, kind))) return 'cli';
  const record = readBoundException(project, attempt, kind);
  return record ? record.type : 'missing';
}

const PRE_VERIFYING_STATES = ['planned', 'assigned', 'implementing', 'red-confirmed'];

function loadAttempts(project, targetAttemptId, sourceAttemptId) {
  const target = getAttempt(project, targetAttemptId);
  if (!target) throw new Error(`Attempt not found: ${targetAttemptId}`);
  const source = getAttempt(project, sourceAttemptId);
  if (!source) throw new Error(`Attempt not found: ${sourceAttemptId}`);
  if (source.id === target.id) {
    throw new Error('reuse requires a source attempt different from the target attempt');
  }
  return { target, source };
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

/**
 * The approver must differ from the target's implementer. Under policy version 2
 * the approver must equal a principal the configured verifier confirms.
 * @returns {{ approver: string, principal?: object }}
 */
function authorizeApprover(project, target, options) {
  const approver = requireText(options.approver, 'approver');
  if (typeof target.implementerId === 'string' && target.implementerId === approver) {
    throw new Error('red exception approver must differ from the implementer');
  }
  if (readPolicyVersion(project) < 2) return { approver };
  const principal = confirmPrincipal(project, {
    provider: options.principalProvider,
    subject: options.principalSubject,
  });
  if (approver !== principal.subject) {
    throw new Error('red exception approver must equal the verified principal subject');
  }
  return { approver, principal };
}

function requireBeforeVerifying(target) {
  if (!PRE_VERIFYING_STATES.includes(target.state)) {
    throw new Error(
      `red exceptions apply only before verifying (target state=${target.state})`,
    );
  }
}

function requireCodeItem(project, attempt, kinds) {
  const item = getWorkItem(project, attempt.change, attempt.taskId);
  if (!item) throw new Error(`Work item not found: ${attempt.change}/${attempt.taskId}`);
  if (item.factory?.taskType === 'lightweight') {
    throw new Error('red exceptions do not apply to a lightweight work item');
  }
  const required = requiredTestKinds(item.factory?.checks);
  for (const kind of kinds) {
    if (!required.includes(kind)) {
      throw new Error(`${kind} is not a required test kind of ${attempt.change}/${attempt.taskId}`);
    }
  }
  return item;
}

function registryDigestFor(project, kind) {
  const file = path.join(project, '.factory', 'checks.json');
  if (!fs.existsSync(file)) throw new Error('missing check registry: .factory/checks.json');
  let registry;
  try {
    registry = JSON.parse(readText(file));
  } catch {
    throw new Error('invalid check registry JSON');
  }
  const argv = registry?.checks?.[kind]?.argv;
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error(`Check kind has no argv mapping: ${kind}`);
  }
  return commandDigest(argv);
}

function passingTargetRecord(attempt, kind, { registryDigest, headSha }) {
  for (const record of attempt.evidence?.verification || []) {
    if (record.kind !== kind || record.issuer !== 'cli') continue;
    try {
      validateCheckRecord(record);
    } catch {
      continue;
    }
    if (!attestationFailureReason(record, { attemptId: attempt.id, registryDigest, headSha })) {
      return record;
    }
  }
  return null;
}

function newExceptionId() {
  return `red-${randomUUID()}`;
}

/**
 * Record a reuse exception on a replacement attempt for each named kind.
 * Validates every kind before writing anything.
 *
 * @param {string} project
 * @param {{
 *   targetAttemptId: string,
 *   sourceAttemptId: string,
 *   kinds: string[],
 *   approver: string,
 *   reason: string,
 *   principalProvider?: string,
 *   principalSubject?: string,
 * }} options
 * @returns {{ records: object[], files: string[] }}
 */
export function reuseRed(project, options) {
  const kinds = [...new Set(options.kinds || [])];
  if (kinds.length === 0) throw new Error('reuse requires at least one --kind');
  const reason = requireText(options.reason, 'reason');
  const { target, source } = loadAttempts(project, options.targetAttemptId, options.sourceAttemptId);

  if (source.change !== target.change || source.taskId !== target.taskId) {
    throw new Error('reuse requires source and target attempts for the same change and task');
  }
  if (source.state !== 'rejected') {
    throw new Error(`reuse requires a rejected source attempt (state=${source.state})`);
  }
  if (String(source.createdAt || '') >= String(target.createdAt || '')) {
    throw new Error('reuse requires a source attempt created before the target attempt');
  }
  requireBeforeVerifying(target);
  requireCodeItem(project, target, kinds);

  const sourceReds = {};
  for (const kind of kinds) {
    if (target.evidence?.redExceptions?.[kind]) {
      throw new Error(`attempt already has an exception for ${kind}`);
    }
    const red = redForKind(source, kind);
    if (!isFailingRed(red) || red.attemptId !== source.id) {
      throw new Error(`source attempt has no failing CLI red for ${kind}`);
    }
    try {
      validateCheckRecord(red);
    } catch {
      throw new Error(`source attempt has no failing CLI red for ${kind}`);
    }
    const registryDigest = registryDigestFor(project, kind);
    if (red.commandDigest !== registryDigest) {
      throw new Error(
        `source red command digest for ${kind} does not match the current registry argv`,
      );
    }
    sourceReds[kind] = { red, registryDigest };
  }

  const { sourceRevision: headSha, worktreeClean } = resolveGitBinding(project);
  if (!headSha || !worktreeClean) {
    throw new Error('reuse requires a clean worktree at a resolvable HEAD');
  }
  for (const kind of kinds) {
    const green = passingTargetRecord(target, kind, {
      registryDigest: sourceReds[kind].registryDigest,
      headSha,
    });
    if (!green) {
      throw new Error(
        `reuse requires a passing CLI verification for ${kind} on the target attempt at the current clean HEAD`,
      );
    }
  }

  const { approver, principal } = authorizeApprover(project, target, options);
  const issuance = new Date().toISOString();
  const policyVersion = readPolicyVersion(project);
  const records = [];
  const files = [];
  for (const kind of kinds) {
    const { red } = sourceReds[kind];
    const record = {
      schemaVersion: 1,
      id: newExceptionId(),
      type: 'reuse',
      change: target.change,
      task: target.taskId,
      attemptId: target.id,
      kind,
      approver,
      reason,
      issuance,
      policyVersion,
      sourceRevision: headSha,
      ...(principal ? { principal } : {}),
      source: {
        attemptId: source.id,
        commandDigest: red.commandDigest,
        logDigest: red.logDigest ?? null,
        sourceRevision: red.sourceRevision ?? null,
        startedAt: red.startedAt ?? null,
        finishedAt: red.finishedAt ?? null,
        recordDigest: digestText(canonicalJson(red)),
      },
    };
    const bound = bindRedException(project, target.id, record);
    records.push(record);
    files.push(bound.file);
  }
  return { records, files };
}

export const WAIVER_WARNING_SENTENCE = 'Waiving a red before the system is stuck is discouraged.';

export function waiverWarning(kinds) {
  return [
    WAIVER_WARNING_SENTENCE,
    `This attempt has no recorded vacuous-red for: ${kinds.join(', ')}.`,
    'Prefer `idefactory red reuse` when a rejected attempt holds a genuine red, and let the system get stuck first.',
    'To override anyway, repeat the command with --acknowledge-not-stuck.',
  ].join(' ');
}

function isStuck(attempt, kind) {
  return (attempt.evidence?.retryCounts?.[retryKey('vacuous-red', kind)] || 0) >= 1;
}

/**
 * Record a waiver exception on an attempt for each named kind.
 * Refuses before a stuck signal unless the human acknowledged the warning.
 *
 * @param {string} project
 * @param {{
 *   targetAttemptId: string,
 *   kinds: string[],
 *   approver: string,
 *   reason: string,
 *   acknowledgeNotStuck?: boolean,
 *   principalProvider?: string,
 *   principalSubject?: string,
 * }} options
 * @returns {{ records: object[], files: string[] }}
 */
export function waiveRed(project, options) {
  const kinds = [...new Set(options.kinds || [])];
  if (kinds.length === 0) throw new Error('waive requires at least one --kind');
  const reason = requireText(options.reason, 'reason');
  const target = getAttempt(project, options.targetAttemptId);
  if (!target) throw new Error(`Attempt not found: ${options.targetAttemptId}`);

  requireBeforeVerifying(target);
  requireCodeItem(project, target, kinds);
  for (const kind of kinds) {
    if (target.evidence?.redExceptions?.[kind]) {
      throw new Error(`attempt already has an exception for ${kind}`);
    }
  }

  const notStuck = kinds.filter((kind) => !isStuck(target, kind));
  if (notStuck.length > 0 && !options.acknowledgeNotStuck) {
    throw new Error(waiverWarning(notStuck));
  }

  const { sourceRevision: headSha } = resolveGitBinding(project);
  if (!headSha) throw new Error('waive requires a resolvable git HEAD');

  const { approver, principal } = authorizeApprover(project, target, options);
  const issuance = new Date().toISOString();
  const policyVersion = readPolicyVersion(project);
  const records = [];
  const files = [];
  for (const kind of kinds) {
    const record = {
      schemaVersion: 1,
      id: newExceptionId(),
      type: 'waiver',
      change: target.change,
      task: target.taskId,
      attemptId: target.id,
      kind,
      approver,
      reason,
      issuance,
      policyVersion,
      sourceRevision: headSha,
      ...(principal ? { principal } : {}),
      noRedExists: true,
      acknowledgedNotStuck: !isStuck(target, kind),
    };
    const bound = bindRedException(project, target.id, record);
    records.push(record);
    files.push(bound.file);
  }
  return { records, files };
}

/**
 * One row per valid exception bound to an attempt, across every kind.
 * Rows carry no raw check output.
 */
export function listAttemptExceptions(project, attempt) {
  const rows = [];
  for (const kind of Object.keys(attempt?.evidence?.redExceptions || {}).sort()) {
    const record = readBoundException(project, attempt, kind);
    if (!record) continue;
    rows.push({
      attemptId: attempt.id,
      change: attempt.change,
      task: attempt.taskId,
      id: record.id,
      type: record.type,
      kind: record.kind,
      approver: record.approver,
      reason: record.reason,
      noRedRan: true,
      ...(record.type === 'reuse' ? { sourceAttemptId: record.source?.attemptId ?? null } : {}),
      ...(record.type === 'waiver' ? { acknowledgedNotStuck: record.acknowledgedNotStuck === true } : {}),
    });
  }
  return rows;
}

/** Every valid exception on every attempt in the project, ordered by attempt id. */
export function listAllExceptions(project) {
  const root = path.join(project, '.factory', 'attempts');
  if (!fs.existsSync(root)) return [];
  const rows = [];
  for (const name of fs.readdirSync(root).sort()) {
    if (!name.endsWith('.json')) continue;
    let attempt;
    try {
      attempt = JSON.parse(readText(path.join(root, name)));
    } catch {
      continue;
    }
    if (!attempt?.evidence?.redExceptions) continue;
    rows.push(...listAttemptExceptions(project, attempt));
  }
  return rows;
}

/**
 * One line per exception, shared by status, the reviewer packet, and the
 * verdict comment so the wording matches.
 */
export function describeException(row, { withReason = true } = {}) {
  const why = withReason ? `: ${row.reason}` : ` (reason on record ${row.id})`;
  const how = row.type === 'reuse'
    ? `reuse of attempt ${row.sourceAttemptId} red by ${row.approver}${why}`
    : `waiver by ${row.approver}${why}${
      row.acknowledgedNotStuck ? ' (acknowledged before the system was stuck)' : ''
    }`;
  return `No red ran for ${row.kind} on attempt ${row.attemptId}; ${how}`;
}
