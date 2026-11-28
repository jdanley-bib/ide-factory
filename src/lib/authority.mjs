import fs from 'node:fs';
import path from 'node:path';
import { readPolicyVersion } from './principal.mjs';

export const LEVELS = Object.freeze(['agent', 'independent', 'human']);
export const ENFORCEMENTS = Object.freeze(['none', 'identity', 'principal']);
export const HUMAN_EXPECTATION = 'the factory expects a person and cannot verify one';

/** Gates in the table that no blocked-state row uses yet. */
export const RESERVED_GATES = Object.freeze(['attempt-repoint', 'method-review', 'red-invalidate']);

function gate(level, enforcement, why, extra = {}) {
  return Object.freeze({ level, enforcement, why, ...extra });
}

export const AUTHORITY = Object.freeze({
  'record-approval': gate('human', 'identity', 'approve a publish, deploy, spend, or account action, or a human gate on a task', { principalUnderV2: true }),
  resume: gate('human', 'none', 'remove HALT'),
  'raise-new-run-cap': gate('human', 'none', 'raise a configured run cap or ceiling'),
  'new-run-spend': gate('human', 'none', 'open a new run session after max-tokens or max-cost'),
  'new-run-human': gate('human', 'none', 'open a new run session on a stop that a person must decide'),
  'record-setup': gate('human', 'none', 'record the test command and governance mode, which are project decisions'),
  'detect-setup': gate('agent', 'none', 'print stack proposals that a person can confirm; writes nothing', { actor: 'tooling' }),

  'resolve-lockout': gate('independent', 'identity', 'resolve a reviewer lockout with an identity other than the locked agent'),
  'waive-red': gate('independent', 'identity', 'waive a red with an identity other than the implementer', { principalUnderV2: true }),
  'reuse-red': gate('independent', 'identity', 'reuse a red with an identity other than the implementer', { principalUnderV2: true }),
  'apply-reconciliation': gate('independent', 'identity', 'apply a reconciliation decision with an identity other than the implementer', { principalUnderV2: true }),
  'reopen-attempt': gate('independent', 'identity', 'reopen an accepted attempt with an identity other than the implementer'),
  'review-attempt': gate('independent', 'identity', 'review an attempt with an identity other than the implementer'),
  'attempt-repoint': gate('independent', 'identity', 'repoint an attempt over recorded evidence with an identity other than the implementer'),
  'method-review': gate('independent', 'identity', 'review a red method with an identity other than the implementer'),

  'new-run': gate('agent', 'none', 'open a new run session within run.maxNewRuns after a budget stop or retry-cap', { actor: 'implementing-agent' }),
  'accept-baseline': gate('agent', 'none', 'accept a failing baseline for one HEAD with a recorded reason', { actor: 'implementing-agent' }),
  'red-invalidate': gate('agent', 'none', 'withdraw a failing red that is not genuine; grants nothing', { actor: 'implementing-agent' }),
  'continue-attempt': gate('agent', 'none', 'continue the live attempt', { actor: 'implementing-agent' }),
  'do-the-step': gate('agent', 'none', 'do the next packet step', { actor: 'implementing-agent' }),
  'start-new-attempt': gate('agent', 'none', 'start a new attempt on a rejected item', { actor: 'implementing-agent' }),
  'run-verify': gate('agent', 'none', 'run verification checks', { actor: 'implementing-agent' }),
  'propose-method': gate('agent', 'none', 'propose a no-red method', { actor: 'implementing-agent' }),
  'propose-already-satisfied': gate('agent', 'none', 'propose an already-satisfied method from a vacuous red', { actor: 'implementing-agent' }),
  complete: gate('agent', 'none', 'complete an accepted attempt without a human gate', { actor: 'implementing-agent' }),
  'resume-complete': gate('agent', 'none', 'resume a finalization journal', { actor: 'implementing-agent' }),

  'show-requirements': gate('agent', 'none', 'read the resolved requirement set', { actor: 'tooling' }),
  'verify-status': gate('agent', 'none', 'read verification status', { actor: 'tooling' }),
  'check-authorization': gate('agent', 'none', 'read whether an action is authorized', { actor: 'tooling' }),
  'sync-tasks': gate('agent', 'none', 'sync tasks.md into the work queue', { actor: 'tooling' }),
  'plan-reconciliation': gate('agent', 'none', 'plan a task reconciliation without applying it', { actor: 'tooling' }),
  'show-status': gate('agent', 'none', 'read factory status', { actor: 'tooling' }),
  'run-again': gate('agent', 'none', 'run the factory again', { actor: 'tooling' }),
  'list-reds': gate('agent', 'none', 'list recorded reds', { actor: 'tooling' }),
  'show-pending': gate('agent', 'none', 'show pending cloud operations', { actor: 'tooling' }),
});

/**
 * The gate a control event records a decision under. A string names one gate; an object maps the
 * event's exceptionType to a gate. An event type absent here records no authority decision.
 */
export const EVENT_GATES = Object.freeze({
  'approval.issued': 'record-approval',
  'approval.revoked': 'record-approval',
  'halt.resumed': 'resume',
  'lockout.resolved': 'resolve-lockout',
  'red-exception.recorded': Object.freeze({ waiver: 'waive-red', reuse: 'reuse-red' }),
  'attempt.reopened': 'reopen-attempt',
  'attempt.repointed': 'attempt-repoint',
  'decision.rejected': 'review-attempt',
  'tasks.reconciled': 'apply-reconciliation',
  'red.invalidated': 'red-invalidate',
  'run.new-run': 'new-run',
});

/** Every gate id an event type can record under. */
export function eventGateIds(type) {
  if (!Object.hasOwn(EVENT_GATES, type)) return [];
  const mapped = EVENT_GATES[type];
  return typeof mapped === 'string' ? [mapped] : Object.values(mapped);
}

/** The gate id for one control event, or null when the event records no authority decision. */
export function gateForEvent(event) {
  if (!Object.hasOwn(EVENT_GATES, event?.type)) return null;
  const mapped = EVENT_GATES[event.type];
  if (typeof mapped === 'string') return mapped;
  return Object.hasOwn(mapped, event.exceptionType) ? mapped[event.exceptionType] : null;
}

/** The reported actor for an entry: human, independent-agent, or the entry's agent actor. */
export function actorFor(entry) {
  if (entry.level === 'human') return 'human';
  if (entry.level === 'independent') return 'independent-agent';
  return entry.actor || 'implementing-agent';
}

export function enforcementFor(entry, policyVersion = 1) {
  return entry.principalUnderV2 && policyVersion >= 2 ? 'principal' : entry.enforcement;
}

function readConfigObject(project) {
  const file = path.join(project, '.factory', 'config.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Raise-only overrides from `.factory/config.json` `authority`. Only `"human"` for a known gate
 * whose table level is lower is applied. Everything else is ignored and named for doctor.
 */
export function configuredAuthority(project) {
  const raised = new Set();
  const ignored = [];
  const config = readConfigObject(project);
  const entries = config.authority && typeof config.authority === 'object' && !Array.isArray(config.authority)
    ? config.authority
    : {};
  for (const [key, value] of Object.entries(entries)) {
    if (!Object.hasOwn(AUTHORITY, key)) {
      ignored.push({ key, value, reason: 'unknown gate' });
    } else if (value !== 'human') {
      ignored.push({ key, value, reason: 'only "human" can be set, and a gate cannot be lowered' });
    } else if (AUTHORITY[key].level === 'human') {
      ignored.push({ key, value, reason: 'the gate is already human' });
    } else {
      raised.add(key);
    }
  }
  return { raised, ignored };
}

/** The effective authority of one gate for a project. Raised gates report level human and source config. */
export function describeGate(project, id) {
  if (!Object.hasOwn(AUTHORITY, id)) throw new Error(`unknown authority gate: ${id}`);
  const entry = AUTHORITY[id];
  const isRaised = configuredAuthority(project).raised.has(id);
  const enforcement = enforcementFor(entry, readPolicyVersion(project));
  const level = isRaised ? 'human' : entry.level;
  return {
    gate: id,
    level,
    enforcement,
    actor: isRaised ? 'human' : actorFor(entry),
    source: isRaised ? 'config' : 'table',
    ...(level === 'human' && enforcement !== 'principal' ? { note: HUMAN_EXPECTATION } : {}),
  };
}

/** The table's label for help text, read without any project config. */
export function gateLabel(id) {
  const entry = AUTHORITY[id];
  if (!entry) throw new Error(`unknown authority gate: ${id}`);
  const principal = entry.principalUnderV2 ? ' (principal under policy version 2)' : '';
  return `level ${entry.level}, enforcement ${entry.enforcement}${principal}`;
}
