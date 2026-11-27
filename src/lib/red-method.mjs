import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { attemptPath, getAttempt } from './attempt.mjs';
import { openReopen } from './attempt-reopen.mjs';
import { appendControlEvent } from './event-log.mjs';
import { assertIdentity } from './identity.mjs';
import { ledger, readText, writeText } from './layout.mjs';
import { confirmPrincipal, readPolicyVersion } from './principal.mjs';
import { isFailingRed, redForKind } from './red-evidence.mjs';
import { redInvalidated } from './red-invalidation.mjs';
import { readCheckRegistry, redKindsFor } from './required-checks.mjs';
import { allowlistedTargetPaths } from './finalization-recovery.mjs';
import { commandDigest, isFactoryRunStatePath, resolveGitBinding } from './verification-evidence.mjs';
import { getWorkItem } from './work.mjs';

export const REASON_CLASSES = ['docs-or-text', 'configuration', 'behavior-preserving', 'mechanical', 'exploratory', 'already-satisfied'];
const ALREADY_SATISFIED = 'already-satisfied';
const MAX_CHANGED_PATHS_RECORDED = 50;
const MAX_OFFENDING_PATHS_NAMED = 10;
export const METHOD_VERDICTS = ['ACCEPT', 'REJECT'];

const SCHEMA_VERSION = 1;
const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const PROPOSAL_STATES = ['planned', 'assigned', 'implementing'];
const REVIEW_STATES = ['verifying', 'security-checking', 'awaiting-review'];

export function methodsDir(project) {
  return path.join(project, '.factory', 'methods');
}

export function methodFilePath(project, id) {
  return path.join(methodsDir(project), `${id}.json`);
}

function digestText(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function readBoundFile(project, pointer) {
  if (!pointer || typeof pointer !== 'object') return null;
  if (typeof pointer.id !== 'string' || !RECORD_ID.test(pointer.id)) return null;
  let text;
  try {
    text = fs.readFileSync(methodFilePath(project, pointer.id), 'utf8');
  } catch {
    return null;
  }
  if (digestText(text) !== pointer.digest) return null;
  try {
    const record = JSON.parse(text);
    return record?.id === pointer.id ? record : null;
  } catch {
    return null;
  }
}

function writeBound(project, attemptId, field, record) {
  const attempt = getAttempt(project, attemptId);
  const file = methodFilePath(project, record.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(record, null, 2)}\n`;
  fs.writeFileSync(file, text, { flag: 'wx' });
  const digest = digestText(text);
  attempt.evidence = attempt.evidence || {};
  attempt.evidence[field] = { id: record.id, digest };
  attempt.updatedAt = new Date().toISOString();
  writeText(attemptPath(project, attemptId), JSON.stringify(attempt, null, 2));
  return { file, digest };
}

/** The method record bound to an attempt, or null when absent, missing, or altered. */
export function readBoundMethod(project, attempt) {
  const record = readBoundFile(project, attempt?.evidence?.method);
  if (!record || record.attemptId !== attempt.id || record.choice !== 'no-red') return null;
  if (record.change !== attempt.change || record.task !== attempt.taskId) return null;
  return record;
}

/** The method review bound to an attempt for its current method, or null. */
export function readBoundMethodReview(project, attempt) {
  const method = attempt?.evidence?.method;
  const record = readBoundFile(project, attempt?.evidence?.methodReview);
  if (!record || !method) return null;
  if (record.attemptId !== attempt.id || record.methodDigest !== method.digest) return null;
  if (!METHOD_VERDICTS.includes(record.verdict)) return null;
  return record;
}

/** True when the attempt's no-red method covers this kind and its record is intact. */
export function methodCovers(project, attempt, kind) {
  const record = readBoundMethod(project, attempt);
  return Boolean(record && record.kinds.includes(kind));
}

/** Kinds a valid method on this attempt covers. */
export function methodCoveredKinds(project, attempt) {
  return readBoundMethod(project, attempt)?.kinds || [];
}

function changedFileCount(project) {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf8', shell: false });
  if (result.status !== 0) return 0;
  return result.stdout.split('\n').filter((line) => line.length > 3).filter((line) => {
    const rel = line.slice(3).split(' -> ').pop().trim().replace(/^"|"$/g, '');
    return !isFactoryRunStatePath(rel, project);
  }).length;
}

function isTracked(project, relPath) {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', relPath], {
    cwd: project,
    encoding: 'utf8',
    shell: false,
  });
  return result.status === 0;
}

function attemptsOfItem(project, change, taskId) {
  const root = path.join(project, '.factory', 'attempts');
  if (!fs.existsSync(root)) return [];
  const rows = [];
  for (const name of fs.readdirSync(root).sort()) {
    if (!name.endsWith('.json')) continue;
    try {
      const attempt = JSON.parse(readText(path.join(root, name)));
      if (attempt?.change === change && attempt?.taskId === taskId) rows.push(attempt);
    } catch {
      // ignore unreadable attempt files
    }
  }
  return rows;
}

function earlierRejection(project, attempt) {
  return attemptsOfItem(project, attempt.change, attempt.taskId).find((other) => (
    other.id !== attempt.id && readBoundMethodReview(project, other)?.verdict === 'REJECT'
  )) || null;
}

function normalizeTestPath(project, raw) {
  const rel = String(raw || '').replace(/\\/g, '/');
  const resolved = path.resolve(project, rel);
  const relative = path.relative(project, resolved).replace(/\\/g, '/');
  if (!rel || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`test path ${raw} is outside the project`);
  }
  return relative;
}

function gitLines(project, args) {
  const result = spawnSync('git', args, { cwd: project, encoding: 'utf8', shell: false });
  if (result.status !== 0) return null;
  return result.stdout.split('\n').filter((line) => line.length > 0);
}

function isAncestorOfHead(project, revision) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', revision, 'HEAD'], {
    cwd: project,
    encoding: 'utf8',
    shell: false,
  });
  return result.status === 0;
}

function isDirectory(project, rel) {
  try {
    return fs.statSync(path.join(project, rel)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Paths changed since the attempt's start revision that count against an already-satisfied
 * claim: tracked edits and deletions plus untracked files git does not ignore, minus factory
 * run state and the finalization targets the attempt itself writes.
 */
function changedSinceStart(project, attempt) {
  const tracked = gitLines(project, ['diff', '--name-only', attempt.startRevision]);
  const untracked = gitLines(project, ['ls-files', '--others', '--exclude-standard']);
  if (tracked === null || untracked === null) {
    throw new Error(`cannot read the changed paths since start revision ${attempt.startRevision}`);
  }
  const ownTargets = new Set(allowlistedTargetPaths({ change: attempt.change, attemptId: attempt.id }));
  return [...new Set([...tracked, ...untracked])]
    .map((rel) => rel.replace(/\\/g, '/'))
    .filter((rel) => !isFactoryRunStatePath(rel, project) && !ownTargets.has(rel))
    .sort();
}

function outsideCitedTests(project, testPaths, changed) {
  return changed.filter((rel) => !testPaths.some((cited) => {
    if (rel === cited) return true;
    return isDirectory(project, cited) && rel.startsWith(`${cited.replace(/\/+$/, '')}/`);
  }));
}

function namedOffenders(offending) {
  const shown = offending.slice(0, MAX_OFFENDING_PATHS_NAMED).join(', ');
  const more = offending.length > MAX_OFFENDING_PATHS_NAMED ? ` and ${offending.length - MAX_OFFENDING_PATHS_NAMED} more` : '';
  return `${shown}${more}`;
}

function latestObservedPass(project, attempt, kind, digest) {
  let latest = null;
  for (const entry of attempt.evidence?.redFailures || []) {
    if (entry.kind !== kind || entry.classification !== 'vacuous-red') continue;
    if (!digest || entry.commandDigest !== digest) continue;
    if (!entry.sourceRevision || !isAncestorOfHead(project, entry.sourceRevision)) continue;
    latest = entry;
  }
  if (!latest) return null;
  return {
    logDigest: latest.logDigest,
    commandDigest: latest.commandDigest,
    sourceRevision: latest.sourceRevision,
    recordedAt: latest.recordedAt,
  };
}

function assertAlreadySatisfiable(project, attempt, kinds, testPaths) {
  if (testPaths.length === 0) {
    throw new Error('an already-satisfied method must cite at least one existing test with --test-path');
  }
  for (const rel of testPaths) {
    if (!fs.existsSync(path.join(project, rel))) throw new Error(`test path ${rel} does not exist`);
  }
  if (!attempt.startRevision) {
    throw new Error(
      `attempt ${attempt.id} has no start revision (the project had no git commit when it started); `
      + 'an already-satisfied method cannot check its diff, so start a new attempt after a commit',
    );
  }
  const registry = readCheckRegistry(project);
  const observedPass = {};
  const unobserved = [];
  for (const kind of kinds) {
    const rawEntry = registry[kind];
    const digest = rawEntry?.argv ? commandDigest(rawEntry.argv) : null;
    const pass = latestObservedPass(project, attempt, kind, digest);
    if (pass) observedPass[kind] = pass;
    else unobserved.push(kind);
  }
  if (unobserved.length > 0) {
    throw new Error(
      `already-satisfied needs a vacuous red run for each covered kind with the current registered command; `
      + `no observed pass for: ${unobserved.join(', ')}`,
    );
  }
  const changed = changedSinceStart(project, attempt);
  const offending = outsideCitedTests(project, testPaths, changed);
  if (offending.length > 0) {
    throw new Error(`already-satisfied allows only the cited tests to change; outside them: ${namedOffenders(offending)}`);
  }
  return {
    observedPass,
    changedPaths: {
      count: changed.length,
      paths: changed.slice(0, MAX_CHANGED_PATHS_RECORDED),
    },
  };
}

/**
 * Record a no-red method on an attempt. Immutable once written.
 *
 * @param {string} project
 * @param {{
 *   attemptId: string,
 *   choice: string,
 *   reason: string,
 *   rationale: string,
 *   proposer: string,
 *   kinds: string[],
 *   testPaths?: string[],
 * }} options
 */
export function proposeMethod(project, options) {
  if (options.choice !== 'no-red') throw new Error('--choice must be no-red (red-first is the default)');
  const reason = options.reason;
  if (!REASON_CLASSES.includes(reason)) {
    throw new Error(`--reason must be one of: ${REASON_CLASSES.join(', ')}`);
  }
  const rationale = requireText(options.rationale, '--rationale');
  const proposer = assertIdentity(options.proposer, '--implementer');
  const kinds = [...new Set(options.kinds || [])];
  if (kinds.length === 0) throw new Error('method propose requires at least one --kind');

  const attempt = getAttempt(project, options.attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${options.attemptId}`);
  const reopened = openReopen(attempt);
  const reopenedKinds = reopened ? reopened.kinds : [];
  if (!PROPOSAL_STATES.includes(attempt.state)) {
    if (!reopened) {
      throw new Error(`a method can be proposed only before red-confirmed or verifying (attempt state=${attempt.state})`);
    }
    const outside = (options.kinds || []).filter((kind) => !reopenedKinds.includes(kind));
    if (outside.length > 0) {
      throw new Error(`attempt was reopened for ${reopenedKinds.join(', ')}; ${outside.join(', ')} is outside that reopen`);
    }
  }
  if (attempt.evidence?.method) throw new Error('attempt already has a method record');
  if (typeof attempt.implementerId === 'string' && attempt.implementerId !== proposer) {
    throw new Error('--implementer must be the attempt implementer');
  }

  const item = getWorkItem(project, attempt.change, attempt.taskId);
  if (!item) throw new Error(`Work item not found: ${attempt.change}/${attempt.taskId}`);
  if (item.factory?.taskType === 'lightweight') {
    throw new Error('a method does not apply to a lightweight work item');
  }
  if (reason !== ALREADY_SATISFIED && item.factory?.taskTypeSource !== 'inferred') {
    throw new Error(
      `${attempt.change}/${attempt.taskId} has an explicit factory.taskType (${item.factory?.taskType}); `
      + 'a human set the class and an agent cannot override it',
    );
  }
  const required = redKindsFor(project, item);
  for (const kind of kinds) {
    if (!required.includes(kind)) {
      throw new Error(`${kind} is not a required test kind of ${attempt.change}/${attempt.taskId}`);
    }
    if (isFailingRed(redForKind(attempt, kind)) && !redInvalidated(project, attempt, kind)) {
      throw new Error(`a failing red is already stored for ${kind}; withdraw it with idefactory red invalidate, or a method cannot replace it`);
    }
    if (attempt.evidence?.redExceptions?.[kind]) {
      throw new Error(`attempt already has a red exception for ${kind}`);
    }
  }
  const rejected = earlierRejection(project, attempt);
  if (rejected) {
    throw new Error(
      `a no-red method for ${attempt.change}/${attempt.taskId} was rejected on attempt ${rejected.id}; this item uses red-first`,
    );
  }

  const testPaths = [...new Set((options.testPaths || []).map((entry) => normalizeTestPath(project, entry)))];
  if (reason === 'behavior-preserving') {
    if (testPaths.length === 0) {
      throw new Error('a behavior-preserving method must cite at least one existing tracked test with --test-path');
    }
    for (const rel of testPaths) {
      if (!fs.existsSync(path.join(project, rel))) throw new Error(`test path ${rel} does not exist`);
      if (!isTracked(project, rel)) throw new Error(`test path ${rel} is not tracked by git`);
    }
  }

  const coverage = reason === ALREADY_SATISFIED
    ? assertAlreadySatisfiable(project, attempt, kinds, testPaths)
    : null;

  const { sourceRevision } = resolveGitBinding(project);
  if (!sourceRevision) throw new Error('method propose requires a resolvable git HEAD');
  const record = {
    schemaVersion: SCHEMA_VERSION,
    id: `method-${randomUUID()}`,
    change: attempt.change,
    task: attempt.taskId,
    attemptId: attempt.id,
    choice: 'no-red',
    reason,
    kinds,
    rationale,
    ...(testPaths.length ? { testPaths } : {}),
    ...(coverage ? {
      startRevision: attempt.startRevision,
      observedPass: coverage.observedPass,
      changedPaths: coverage.changedPaths,
    } : {}),
    proposer,
    sourceRevision,
    changedFiles: changedFileCount(project),
    policyVersion: readPolicyVersion(project),
    issuance: new Date().toISOString(),
  };
  const bound = writeBound(project, attempt.id, 'method', record);
  ledger(project, 'red-method', { methodId: record.id, attemptId: attempt.id, reason, kinds });
  appendControlEvent(project, {
    type: 'method.proposed',
    time: record.issuance,
    id: record.id,
    attemptId: attempt.id,
    change: attempt.change,
    task: attempt.taskId,
  });
  return { record, file: bound.file };
}

/**
 * Record the reviewer's decision on the attempt's method. Immutable once written.
 */
export function reviewMethod(project, options) {
  const verdict = String(options.verdict || '').trim().toUpperCase();
  if (!METHOD_VERDICTS.includes(verdict)) throw new Error('--verdict must be ACCEPT or REJECT');
  const note = requireText(options.note, '--note');
  const reviewer = assertIdentity(options.reviewer, '--reviewer');
  const attempt = getAttempt(project, options.attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${options.attemptId}`);
  const method = readBoundMethod(project, attempt);
  if (!method) throw new Error('attempt has no valid no-red method to review');
  if (!REVIEW_STATES.includes(attempt.state)) {
    throw new Error(`a method review applies once the attempt reaches verifying (attempt state=${attempt.state})`);
  }
  if (attempt.evidence?.methodReview) throw new Error('attempt already has a method review');
  for (const identity of [attempt.implementerId, method.proposer]) {
    if (typeof identity === 'string' && identity === reviewer) {
      throw new Error('the method reviewer must differ from the implementer');
    }
  }
  let principal;
  if (readPolicyVersion(project) >= 2) {
    principal = confirmPrincipal(project, {
      provider: options.principalProvider,
      subject: options.principalSubject,
    });
    if (reviewer !== principal.subject) {
      throw new Error('the method reviewer must equal the verified principal subject');
    }
  }
  const record = {
    schemaVersion: SCHEMA_VERSION,
    id: `method-review-${randomUUID()}`,
    change: attempt.change,
    task: attempt.taskId,
    attemptId: attempt.id,
    methodId: method.id,
    methodDigest: attempt.evidence.method.digest,
    verdict,
    reviewer,
    note,
    ...(principal ? { principal } : {}),
    policyVersion: readPolicyVersion(project),
    issuance: new Date().toISOString(),
  };
  const bound = writeBound(project, attempt.id, 'methodReview', record);
  ledger(project, 'red-method-review', { reviewId: record.id, attemptId: attempt.id, verdict });
  appendControlEvent(project, {
    type: 'method.reviewed',
    time: record.issuance,
    id: record.id,
    attemptId: attempt.id,
    change: attempt.change,
    task: attempt.taskId,
    verdict,
  });
  return { record, file: bound.file };
}

/**
 * Throw unless an attempt that has a no-red method also has an ACCEPT review from a
 * reviewer other than the implementer. A pointer whose file was altered also refuses.
 */
export function hasMethodRecord(attempt) {
  return Boolean(attempt?.evidence?.method);
}

export function assertMethodAccepted(project, attempt) {
  if (!attempt?.evidence?.method) return;
  const method = readBoundMethod(project, attempt);
  if (!method) {
    throw new Error('the no-red method record is missing or altered; the attempt cannot be accepted');
  }
  const review = readBoundMethodReview(project, attempt);
  if (!review) {
    throw new Error(
      `the no-red method needs a method review before accept; run idefactory method review ${attempt.id} --verdict ACCEPT|REJECT`,
    );
  }
  if (review.verdict !== 'ACCEPT') {
    throw new Error(`the no-red method was rejected in review: ${review.note}`);
  }
  for (const identity of [attempt.implementerId, method.proposer]) {
    if (typeof identity === 'string' && identity === review.reviewer) {
      throw new Error('the method review must come from a reviewer other than the implementer');
    }
  }
  if (method.reason === ALREADY_SATISFIED) assertStillSatisfied(project, attempt, method);
}

function assertStillSatisfied(project, attempt, method) {
  if (!attempt.startRevision) {
    throw new Error(`attempt ${attempt.id} has no start revision; its already-satisfied method cannot be checked`);
  }
  const offending = outsideCitedTests(project, method.testPaths || [], changedSinceStart(project, attempt));
  if (offending.length > 0) {
    throw new Error(
      `already-satisfied no longer holds: production paths changed after the proposal: ${namedOffenders(offending)}`,
    );
  }
}

/** Lines that show a reviewer what an already-satisfied method rests on; empty for other classes. */
export function describeCoverage(row) {
  if (!row || row.reason !== ALREADY_SATISFIED) return [];
  const passes = Object.entries(row.observedPass || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, pass]) => `${kind} (log ${pass.logDigest}, command ${pass.commandDigest}, revision ${pass.sourceRevision}, at ${pass.recordedAt})`);
  return [
    `Observed passes: ${passes.join('; ')}.`,
    `Cited test paths: ${(row.testPaths || []).join(', ')}.`,
    `Diff check at proposal: ${row.changedPaths?.count ?? 0} path(s) changed since start revision ${row.startRevision}, all cited tests or run state.`,
    "The reviewer must confirm the cited tests cover the task's acceptance criteria, and reject the method if they do not.",
  ];
}

/** One row per method bound to an attempt, with its review. Rows carry no check output. */
export function describeAttemptMethod(project, attempt) {
  const method = readBoundMethod(project, attempt);
  if (!method) return null;
  const review = readBoundMethodReview(project, attempt);
  return {
    attemptId: attempt.id,
    change: attempt.change,
    task: attempt.taskId,
    id: method.id,
    reason: method.reason,
    kinds: method.kinds,
    rationale: method.rationale,
    testPaths: method.testPaths || [],
    ...(method.reason === ALREADY_SATISFIED ? {
      startRevision: method.startRevision,
      observedPass: method.observedPass,
      changedPaths: method.changedPaths,
    } : {}),
    proposer: method.proposer,
    sourceRevision: method.sourceRevision,
    changedFiles: method.changedFiles,
    review: review ? { verdict: review.verdict, reviewer: review.reviewer, note: review.note } : null,
  };
}

/** Every valid method on every attempt, ordered by attempt id. */
export function listAllMethods(project) {
  const root = path.join(project, '.factory', 'attempts');
  if (!fs.existsSync(root)) return [];
  const rows = [];
  for (const name of fs.readdirSync(root).sort()) {
    if (!name.endsWith('.json')) continue;
    try {
      const row = describeAttemptMethod(project, JSON.parse(readText(path.join(root, name))));
      if (row) rows.push(row);
    } catch {
      // ignore unreadable attempt files
    }
  }
  return rows;
}

/**
 * Shared wording for status, packets, requests, and the verdict comment. It never says a red ran
 * and never calls the method an exception.
 */
export function describeMethod(row, { withText = true } = {}) {
  const why = withText ? `: ${row.rationale}` : ` (rationale on record ${row.id})`;
  const review = row.review
    ? `method review ${row.review.verdict} by ${row.review.reviewer}${withText ? `: ${row.review.note}` : ''}`
    : 'method review pending';
  return `Method no-red for ${row.kinds.join(', ')} on attempt ${row.attemptId}; reason class ${row.reason}${why}; `
    + `proposed by ${row.proposer} at revision ${row.sourceRevision} with ${row.changedFiles} changed file(s); ${review}`;
}
