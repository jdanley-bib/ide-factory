import fs from 'node:fs';
import path from 'node:path';
import { getAttempt } from './attempt.mjs';
import { openReopen } from './attempt-reopen.mjs';
import { ACTORS, BlockedError, HALT_MESSAGE, RETRY_CLASSES } from './blocked-error.mjs';
import { findEntry } from './command-help.mjs';
import { appendControlEvent, readControlEvents } from './event-log.mjs';
import { hasActiveLockout } from './govern.mjs';
import { readText, writeText } from './layout.mjs';
import { AUTHORITY, HUMAN_EXPECTATION, describeGate } from './authority.mjs';
import { authorizes } from './risk-gates.mjs';
import { getWorkItem, listWorkItems } from './work.mjs';

export const BLOCKED_SCHEMA_VERSION = 1;
export { ACTORS, RETRY_CLASSES };
export const HANDOFF_CODES = new Set(['needs-agent', 'needs-review', 'needs-complete']);
const AGENT_ACTORS = new Set(['independent-agent', 'implementing-agent', 'tooling']);

function option(id, key, command, requires, resolves, when = () => true) {
  return { id, key, command, requires, resolves, when };
}

const attemptIs = (...states) => (ctx) => Boolean(ctx.attempt) && states.includes(ctx.attempt.state);
const hasItem = (ctx) => Boolean(ctx.change && ctx.task);
const hasAttempt = (ctx) => Boolean(ctx.attempt);
const PROPOSAL_STATES = ['planned', 'assigned', 'implementing'];
const proposable = attemptIs(...PROPOSAL_STATES);
const reopenedForMethod = (ctx) => attemptIs('awaiting-review')(ctx) && Boolean(openReopen(ctx.attempt));
const methodProposable = (ctx) => proposable(ctx) || reopenedForMethod(ctx);
const hasVacuousEntry = (ctx) => (ctx.attempt?.evidence?.redFailures || [])
  .some((entry) => entry.classification === 'vacuous-red');
const PROPOSAL_AVAILABILITY = 'an attempt in planned, assigned, or implementing, or an attempt reopened for a method';
const PROPOSE_METHOD_COMMAND = 'idefactory method propose {attemptId} --choice no-red --reason <class> --rationale "<text>" --implementer <id> --kind <kind>';
const PROPOSE_ALREADY_SATISFIED = option(
  'propose-already-satisfied', ['method', 'propose'],
  'idefactory method propose {attemptId} --choice no-red --reason already-satisfied --rationale "<text>" --implementer <id> --kind <kind> --test-path <path>',
  `${PROPOSAL_AVAILABILITY} with a vacuous red`, true,
  (ctx) => methodProposable(ctx) && hasVacuousEntry(ctx),
);

const SHOW_REQUIREMENTS = option('show-requirements', ['requirements'], 'idefactory requirements {change} {task}', 'a work item', false, hasItem,
);
const VERIFY_STATUS = option('verify-status', ['verify', 'status'], 'idefactory verify status {attemptId}', 'an attempt', false, hasAttempt,
);
const SPEND_STOP_REASONS = new Set(['max-tokens', 'max-cost']);
const isSpendStop = (ctx) => SPEND_STOP_REASONS.has(ctx.stopReason);
const NEW_RUN = option(
  'new-run', ['run'], 'idefactory run --change {change} --new-run', 'a new run session within run.maxNewRuns', true,
  (ctx) => Boolean(ctx.change) && !isSpendStop(ctx),
);
const NEW_RUN_HUMAN = option(
  'new-run-human', ['run'], 'idefactory run --change {change} --new-run', 'a person opening a new run session', true,
  (ctx) => Boolean(ctx.change),
);
const NEW_RUN_SPEND = option(
  'new-run-spend', ['run'], 'idefactory run --change {change} --new-run', 'a person opening a new run session after a spend ceiling', true,
  (ctx) => Boolean(ctx.change) && isSpendStop(ctx),
);
const RUN_AGAIN = option('run-again', ['run'], 'idefactory run --change {change}', 'nothing recorded to change', true, (ctx) => Boolean(ctx.change),
);

/**
 * One row per unmet invariant. `options` name commands; the builder decides whether each is
 * supported now from the command registry and the option's precondition.
 */
export const BLOCKED_TABLE = {
  'attempt-active': {
    retry: 'only-after-change',
    message: 'The work item\'s current attempt is live and has recorded evidence. Starting another attempt would orphan that evidence.',
    options: [
      option('continue-attempt', ['next'], 'idefactory next --change {change}', 'the named attempt is still the current attempt for its work item', true, hasAttempt),
    ],
  },
  'approval-missing': {
    retry: 'only-after-change',
    message: 'A human approval is required and none matches.',
    options: [
      option('record-approval', ['approve'], 'idefactory approve <id> --note "<why>" --change {change} --task {task} --action {action} --approver <id> --expiry <iso>', 'a person approving with an identity other than the implementer', true, hasItem),
      option('check-authorization', ['authorize'], 'idefactory authorize --change {change} --task {task} --action {action}', 'a task', false, hasItem),
      SHOW_REQUIREMENTS,
    ],
  },
  'no-ready-work': {
    retry: 'only-after-change',
    message: 'No work item is ready to start.',
    options: [
      option('sync-tasks', ['sync-tasks'], 'idefactory sync-tasks {change}', 'tasks.md changed since the last sync', true, (ctx) => Boolean(ctx.change)),
      option('plan-reconciliation', ['sync-tasks'], 'idefactory sync-tasks {change} --plan', 'a change', false, (ctx) => Boolean(ctx.change)),
      option('show-status', ['status'], 'idefactory status', 'nothing', false),
    ],
  },
  'attempt-rejected': {
    retry: 'only-after-change',
    message: 'The attempt was rejected.',
    options: [
      option('resolve-lockout', ['lockout', 'resolve'], 'idefactory lockout resolve <id> --resolver <id> --reason "<what changed>"', 'an identity other than the locked agent\'s', true, (ctx) => ctx.lockoutActive === true),
      option('start-new-attempt', ['attempt', 'start'], 'idefactory attempt start {change} {task}', 'a rejected attempt and no active lockout', true, (ctx) => hasItem(ctx) && attemptIs('rejected')(ctx) && ctx.lockoutActive !== true),
      SHOW_REQUIREMENTS,
    ],
  },
  'reviewer-lockout': {
    retry: 'only-after-change',
    message: 'An active reviewer lockout stops the factory.',
    options: [
      option('resolve-lockout', ['lockout', 'resolve'], 'idefactory lockout resolve <id> --resolver <id> --reason "<what changed>"', 'an identity other than the locked agent\'s', true, (ctx) => ctx.lockoutActive !== false),
    ],
  },
  'needs-review': {
    retry: 'only-after-change',
    message: 'The attempt awaits an independent review.',
    options: [
      option('review-attempt', ['attempt', 'transition'], 'idefactory attempt transition {attemptId} accepted|rejected --evidence-file <file>', 'an identity other than the implementer', true, attemptIs('awaiting-review', 'security-checking')),
      VERIFY_STATUS,
    ],
  },
  'needs-agent': {
    retry: 'only-after-change',
    message: 'The next step needs an agent.',
    options: [
      option('do-the-step', ['next'], 'idefactory next --change {change}', 'the packet for the work item', true, (ctx) => Boolean(ctx.change)),
    ],
  },
  'needs-complete': {
    retry: 'only-after-change',
    message: 'The attempt is accepted and needs completion.',
    options: [
      option('complete', ['complete'], 'idefactory complete {change} {task} --attempt {attemptId}', 'a passing verification and a human gate when the profile requires it', true, (ctx) => hasItem(ctx) && attemptIs('accepted', 'finalize-failed', 'finalized')(ctx)),
    ],
  },
  'finalize-failed': {
    retry: 'safe',
    message: 'Finalization failed and can resume from its journal.',
    options: [
      option('resume-complete', ['complete'], 'idefactory complete {change} {task} --attempt {attemptId}', 'the finalization journal still bound to this revision', true, (ctx) => hasItem(ctx) && attemptIs('accepted', 'finalize-failed', 'finalized')(ctx)),
    ],
  },
  'completion-unmet': {
    retry: 'only-after-change',
    message: 'Completion requirements are not met.',
    options: [
      SHOW_REQUIREMENTS,
      VERIFY_STATUS,
      option('run-verify', ['verify', 'run'], 'idefactory verify run {attemptId} --check <kind>', 'a clean worktree', true, attemptIs('implementing', 'red-confirmed', 'verifying', 'awaiting-review', 'accepted')),
    ],
  },
  'red-missing': {
    retry: 'only-after-change',
    message: 'A required failing test, method, or red exception is missing.',
    options: [
      option('propose-method', ['method', 'propose'], PROPOSE_METHOD_COMMAND, PROPOSAL_AVAILABILITY, true, methodProposable),
      option('reopen-attempt', ['attempt', 'reopen'], 'idefactory attempt reopen {attemptId} --kind <kind> --for method|exception --by <id> --reason "<text>"', 'an accepted attempt that is not finalizing, and an identity other than the implementer', true, attemptIs('accepted')),
      option('waive-red', ['red', 'waive'], 'idefactory red waive {attemptId} --kind <kind> --note "<reason>" --approver <id>', 'an identity other than the implementer\'s', true, attemptIs('planned', 'assigned', 'implementing', 'red-confirmed', 'verifying')),
      option('list-reds', ['red', 'list'], 'idefactory red list {attemptId}', 'an attempt', false, hasAttempt),
    ],
  },
  'vacuous-red': {
    retry: 'only-after-change',
    message: 'The test already passes, so no failing test can be recorded.',
    options: [
      PROPOSE_ALREADY_SATISFIED,
      option('propose-method', ['method', 'propose'], PROPOSE_METHOD_COMMAND, PROPOSAL_AVAILABILITY, true, methodProposable),
      option('reuse-red', ['red', 'reuse'], 'idefactory red reuse {attemptId} --from <sourceAttemptId> --kind <kind> --note "<reason>" --approver <id>', 'a genuine red from a rejected attempt', true, hasAttempt),
      option('waive-red', ['red', 'waive'], 'idefactory red waive {attemptId} --kind <kind> --note "<reason>" --approver <id>', 'an identity other than the implementer\'s', true, hasAttempt),
      NEW_RUN_HUMAN,
    ],
  },
  'operation-retry-cap': {
    retry: 'never',
    message: 'A cloud operation used its recorded retries. A human must decide what happens to the plan.',
    options: [
      option('show-pending', ['mcp', 'pending'], 'idefactory mcp pending --json', 'a pending plan', false, () => true),
    ],
  },
  'retry-cap': {
    retry: 'never',
    message: 'The attempt hit its retry cap.',
    options: [NEW_RUN],
  },
  'infrastructure-failure': {
    retry: 'safe',
    message: 'A tool or environment failure stopped the run.',
    options: [RUN_AGAIN],
  },
  baseline: {
    retry: 'safe',
    message: 'The baseline check did not hold.',
    options: [
      RUN_AGAIN,
      option('accept-baseline', ['run'], 'idefactory run --change {change} --accept-baseline --reason "<why>"', 'a reason recorded with the accepted baseline', true, (ctx) => Boolean(ctx.change)),
    ],
  },
  'budget-exhausted': {
    retry: 'only-after-change',
    message: 'A run budget is exhausted.',
    options: [NEW_RUN, NEW_RUN_SPEND],
  },
  'new-run-cap': {
    retry: 'never',
    message: 'The change reached its new-run cap. A human must raise run.maxNewRuns or decide what happens next.',
    options: [
      option('raise-new-run-cap', ['config'], 'set run.maxNewRuns in .factory/config.json', 'a person raising run.maxNewRuns', true, (ctx) => Boolean(ctx.change)),
    ],
  },
  'unchanged-state': {
    retry: 'only-after-change',
    message: 'The run made no progress since the last request.',
    options: [
      option('show-status', ['status'], 'idefactory status', 'nothing', false),
      NEW_RUN_HUMAN,
    ],
  },
  'invalid-session': {
    retry: 'never',
    message: 'The run session or its budget is invalid.',
    options: [NEW_RUN_HUMAN],
  },
  halted: {
    retry: 'never',
    message: HALT_MESSAGE,
    options: [
      option('resume', ['resume'], 'idefactory resume', 'a person removing HALT', true),
    ],
  },
  'reconciliation-required': {
    retry: 'only-after-change',
    message: 'The task list changed in a way that needs a decision.',
    options: [
      option('plan-reconciliation', ['sync-tasks'], 'idefactory sync-tasks {change} --plan', 'a change', false, (ctx) => Boolean(ctx.change)),
      option('apply-reconciliation', ['sync-tasks'], 'idefactory sync-tasks {change} --apply --decisions-file <file> --plan-digest <digest> --decided-by <id>', 'a decision by an identity other than the implementer\'s, recorded against the plan digest', true, (ctx) => Boolean(ctx.change)),
    ],
  },
  unclassified: {
    retry: 'only-after-change',
    message: 'The failure has no mapping.',
    options: [],
  },
};

export const BLOCKED_CODES = Object.keys(BLOCKED_TABLE);

/** Every stop reason a run can persist or print, and the invariant it stands for. null means not blocked. */
export const STOP_REASON_CODES = {
  'all-done': null,
  blocked: 'no-ready-work',
  rejected: 'attempt-rejected',
  lockout: 'reviewer-lockout',
  'needs-complete': 'needs-complete',
  'needs-agent': 'needs-agent',
  'human-gate': 'approval-missing',
  'max-tasks': 'budget-exhausted',
  'max-agent-steps': 'budget-exhausted',
  'wall-clock': 'budget-exhausted',
  'max-failures': 'budget-exhausted',
  'unchanged-state': 'unchanged-state',
  'invalid-budget': 'invalid-session',
  'invalid-session': 'invalid-session',
  'host-usage-unavailable': 'budget-exhausted',
  'max-tokens': 'budget-exhausted',
  'max-cost': 'budget-exhausted',
  'new-run-cap': 'new-run-cap',
  'vacuous-red': 'vacuous-red',
  'infrastructure-failure': 'infrastructure-failure',
  baseline: 'baseline',
  'retry-cap': 'retry-cap',
};

export function codeForStopReason(stopReason) {
  if (!Object.hasOwn(STOP_REASON_CODES, stopReason)) return 'unclassified';
  return STOP_REASON_CODES[stopReason];
}

/** An option with no table entry fails closed to a person; a test requires every option to have one. */
function authorityOf(project, id) {
  if (Object.hasOwn(AUTHORITY, id)) return describeGate(project, id);
  return { gate: id, level: 'human', enforcement: 'none', actor: 'human', source: 'table', note: HUMAN_EXPECTATION };
}

function authorityLabel(authority) {
  return {
    level: authority.level,
    enforcement: authority.enforcement,
    source: authority.source,
    ...(authority.note ? { note: authority.note } : {}),
  };
}

function fill(template, ctx) {
  return template
    .replaceAll('{change}', ctx.change || '<change>')
    .replaceAll('{task}', ctx.task || '<task>')
    .replaceAll('{attemptId}', ctx.attempt?.id || ctx.attemptId || '<attemptId>')
    .replaceAll('{action}', ctx.action || 'accept');
}

function isSupported(row, ctx) {
  if (!findEntry(row.key)) return false;
  try {
    return row.when(ctx) === true;
  } catch {
    return false;
  }
}

/**
 * Build one blocked-state report.
 *
 * @param {string} project
 * @param {{ code: string, message?: string, stopReason?: string|null, change?: string, task?: string,
 *   attempt?: object|null, attemptId?: string, action?: string }} input
 */
export function buildBlockedReport(project, input) {
  const code = Object.hasOwn(BLOCKED_TABLE, input.code) ? input.code : 'unclassified';
  const row = BLOCKED_TABLE[code];
  const attempt = input.attempt
    || (input.attemptId ? getAttempt(project, input.attemptId) : null);
  const ctx = {
    project,
    change: input.change || attempt?.change,
    task: input.task || attempt?.taskId,
    attempt,
    attemptId: attempt?.id || input.attemptId,
    action: input.action,
    stopReason: input.stopReason,
    lockoutActive: hasActiveLockout(project),
  };
  const evaluated = row.options.map((entry) => ({
    entry,
    supported: isSupported(entry, ctx),
    authority: authorityOf(project, entry.id),
  }));
  const usable = evaluated.find((item) => item.supported && item.entry.resolves);
  const recoverySupported = Boolean(usable);
  const options = evaluated.map(({ entry, supported, authority }) => {
    const shown = recoverySupported && supported;
    return {
      id: entry.id,
      supported: shown,
      ...(shown ? { command: fill(entry.command, ctx) } : {}),
      actor: authority.actor,
      authority: authorityLabel(authority),
      requires: entry.requires,
      resolves: entry.resolves,
    };
  });
  const recovery = recoverySupported
    ? { supported: true, options }
    : {
      supported: false,
      message: code === 'unclassified'
        ? 'No recovery is known for this failure.'
        : 'There is no supported recovery for this stop. A human must decide what to do.',
      options,
    };
  const actor = usable ? usable.authority.actor : 'human';
  const message = code === 'unclassified' && input.message ? input.message : (input.message || row.message);
  const report = {
    schemaVersion: BLOCKED_SCHEMA_VERSION,
    change: ctx.change || null,
    task: ctx.task || null,
    attemptId: ctx.attemptId || null,
    attemptState: attempt?.state || null,
    stopReason: input.stopReason || null,
    ...(input.action ? { action: input.action } : {}),
    invariant: { code, message },
    actor,
    level: usable ? usable.authority.level : 'human',
    recovery,
    retry: row.retry,
  };
  return report;
}

export function agentActionable(report) {
  return report.recovery.options.some((entry) => entry.supported && entry.resolves && AGENT_ACTORS.has(entry.actor));
}

/** Classify a thrown error into an invariant code. */
export function codeForError(error) {
  if (error instanceof BlockedError) return error.invariant;
  if (error?.code === 'HALT' || error?.message === HALT_MESSAGE) return 'halted';
  return 'unclassified';
}

export function blockedReportForError(project, error, scope = {}) {
  const code = codeForError(error);
  const context = error instanceof BlockedError ? error.context : {};
  return buildBlockedReport(project, {
    code,
    message: String(error?.message || error),
    ...scope,
    ...context,
  });
}

export function blockedReportForStop(project, result, scope = {}) {
  let code = codeForStopReason(result.stopReason);
  if (code === null) return null;
  if (code === 'needs-agent' && scope.attemptId) {
    const attempt = getAttempt(project, scope.attemptId);
    if (attempt?.state === 'awaiting-review' || attempt?.state === 'security-checking') code = 'needs-review';
  }
  return buildBlockedReport(project, {
    code,
    stopReason: result.stopReason,
    ...(result.blocked || {}),
    ...scope,
  });
}

export function blockedDir(project) {
  return path.join(project, '.factory', 'blocked');
}

export function blockedRecordPath(project, change, task) {
  return path.join(blockedDir(project), `${change}--${task}.json`);
}

function readRecord(file) {
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}

function lastStopEvent(project, change, task) {
  let last = null;
  for (const event of readControlEvents(project)) {
    if (event.type !== 'blocked.recorded' && event.type !== 'blocked.resolved') continue;
    if (event.change !== change || (event.task || null) !== (task || null)) continue;
    last = event;
  }
  return last;
}

function emitResolved(project, { change, task, invariant, resolution, id }) {
  const last = lastStopEvent(project, change, task);
  if (!last || last.type !== 'blocked.recorded') return;
  appendControlEvent(project, {
    type: 'blocked.resolved',
    time: new Date().toISOString(),
    change,
    ...(task ? { task } : {}),
    invariant: invariant || last.invariant,
    resolution,
    ...(id ? { id } : {}),
  });
}

/**
 * Note one reported stop. The control event is the append-only trail and is written for every
 * stop; the per-item record is derived data for stops that block a person or a run. Neither is
 * ever read by a gate.
 */
export function recordStop(project, report) {
  if (!report) return null;
  const last = lastStopEvent(project, report.change, report.task);
  if (
    last?.type === 'blocked.recorded'
    && last.invariant === report.invariant.code
    && (last.attemptId || null) === (report.attemptId || null)
    && (last.attemptState || null) === (report.attemptState || null)
  ) {
    return null;
  }
  if (last?.type === 'blocked.recorded') {
    emitResolved(project, {
      change: report.change,
      task: report.task,
      resolution: last.invariant === report.invariant.code ? 'state-change' : 'superseded',
    });
  }
  const time = new Date().toISOString();
  appendControlEvent(project, {
    type: 'blocked.recorded',
    time,
    ...(report.change ? { change: report.change } : {}),
    ...(report.task ? { task: report.task } : {}),
    ...(report.attemptId ? { attemptId: report.attemptId } : {}),
    ...(report.attemptState ? { attemptState: report.attemptState } : {}),
    invariant: report.invariant.code,
    actor: report.actor,
    level: report.level,
    retry: report.retry,
    agentActionable: agentActionable(report),
  });
  if (!report.change || !report.task || HANDOFF_CODES.has(report.invariant.code)) return null;
  const file = blockedRecordPath(project, report.change, report.task);
  writeText(file, `${JSON.stringify({ ...report, status: 'open', recordedAt: time }, null, 2)}\n`);
  return file;
}

/**
 * Record a stop reached by any path: a run session close, a thrown BlockedError, or a reported
 * stop. The same stop reached through two paths records one blocked.recorded event.
 */
export function noteStop(project, { stopReason, code, change, attemptId, message, action } = {}) {
  const invariant = code || codeForStopReason(stopReason);
  if (!invariant) return null;
  const report = buildBlockedReport(project, { code: invariant, stopReason, change, attemptId, message, action });
  if (report.invariant.code === 'unclassified') return null;
  return recordStop(project, report);
}

function latestLockoutResolution(project) {
  const dir = path.join(project, '.factory', 'orchestration', 'lockouts');
  if (!fs.existsSync(dir)) return null;
  let best = null;
  for (const name of fs.readdirSync(dir)) {
    const resolved = readRecord(path.join(dir, name, 'resolved.json'));
    if (!resolved) continue;
    const at = Date.parse(resolved.resolvedAt || resolved.createdAt || '') || 0;
    if (!best || at >= best.at) best = { at, id: name };
  }
  return best?.id || null;
}

function resolutionFor(project, record, item, attempt) {
  const code = record.invariant?.code;
  if (code === 'reviewer-lockout') {
    return hasActiveLockout(project) ? null : { kind: 'lockout-resolution', id: latestLockoutResolution(project) };
  }
  if (code === 'approval-missing') {
    const action = record.action || (attempt?.state === 'accepted' ? 'complete' : 'accept');
    const result = authorizes(project, {
      action,
      change: record.change,
      task: record.task,
      verificationProfile: item?.factory?.verificationProfile,
      implementerId: attempt?.implementerId,
    });
    if (!result.authorized) return null;
    return result.approvalId
      ? { kind: 'approval', id: result.approvalId }
      : { kind: 'profile-waiver', id: null };
  }
  if (!item || item.status === 'done') return { kind: 'work-completed', id: null };
  if (attempt && record.attemptId && attempt.id !== record.attemptId) {
    return { kind: 'new-attempt', id: attempt.id };
  }
  if (attempt && record.attemptState && attempt.state !== record.attemptState) {
    return { kind: 'state-change', id: attempt.id };
  }
  return null;
}

/**
 * Mark open records resolved when live state shows the condition is gone. A record that is
 * still true stays open. The record is never read as a gate.
 */
export function resolveClearedRecords(project, change) {
  const dir = blockedDir(project);
  if (!fs.existsSync(dir)) return [];
  const resolved = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.startsWith(`${change}--`) || !name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    const record = readRecord(file);
    if (!record || record.status !== 'open') continue;
    const item = getWorkItem(project, record.change, record.task);
    const attempt = item?.attemptId ? getAttempt(project, item.attemptId) : null;
    const resolution = resolutionFor(project, record, item, attempt);
    if (!resolution) continue;
    const time = new Date().toISOString();
    writeText(file, `${JSON.stringify({
      ...record,
      status: 'resolved',
      resolvedAt: time,
      resolvedBy: resolution,
    }, null, 2)}\n`);
    emitResolved(project, {
      change: record.change,
      task: record.task,
      invariant: record.invariant?.code,
      resolution: resolution.kind,
      id: resolution.id,
    });
    resolved.push({ change: record.change, task: record.task, resolution });
  }
  return resolved;
}

/** Resolve every stop still open for a change, such as when all its work is done. */
export function resolveOpenForChange(project, change, resolution) {
  const open = new Map();
  for (const event of readControlEvents(project)) {
    if (event.change !== change) continue;
    if (event.type !== 'blocked.recorded' && event.type !== 'blocked.resolved') continue;
    const key = event.task || '';
    if (event.type === 'blocked.recorded') open.set(key, event);
    else open.delete(key);
  }
  for (const [task, event] of open) {
    emitResolved(project, { change, task: task || undefined, invariant: event.invariant, resolution });
  }
}

/** The item a change-level stop is about: the one in progress, else the first not done. */
export function focusItem(project, change) {
  const items = listWorkItems(project, change);
  return items.find((item) => item.status === 'in_progress')
    || items.find((item) => item.status === 'todo')
    || null;
}
