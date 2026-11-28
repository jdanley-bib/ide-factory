import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { attemptPath, getAttempt } from './attempt.mjs';
import { appendControlEvent } from './event-log.mjs';
import { writeText } from './layout.mjs';
import { isFailingRed, redForKind, redHistoryFor } from './red-evidence.mjs';

export const INVALIDATION_CLASSES = ['post-implementation', 'wrong-failure'];
export const MAX_INVALIDATIONS_PER_KIND = 2;
const INVALIDATION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

export function invalidationsDir(project) {
  return path.join(project, '.factory', 'exceptions', 'red-invalid');
}

export function invalidationFilePath(project, id) {
  return path.join(invalidationsDir(project), `${id}.json`);
}

function digestText(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

/** Same digest as a stored red, so an invalidation can name the exact red it withdraws. */
export function invalidatedRedDigest(red) {
  return digestText(JSON.stringify(sortKeys(red)));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

/**
 * Write one immutable invalidation file and bind its digest to the attempt under
 * `evidence.redInvalidations[kind]`. The file is written first, so a crash leaves
 * an unbound file that withdraws nothing.
 */
function bindInvalidation(project, attempt, record) {
  const file = invalidationFilePath(project, record.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(record, null, 2)}\n`;
  fs.writeFileSync(file, text, { flag: 'wx' });
  const pointers = attempt.evidence?.redInvalidations?.[record.kind] || [];
  attempt.evidence = {
    ...(attempt.evidence || {}),
    redInvalidations: {
      ...(attempt.evidence?.redInvalidations || {}),
      [record.kind]: [...pointers, { id: record.id, digest: digestText(text) }],
    },
  };
  attempt.updatedAt = new Date().toISOString();
  writeText(attemptPath(project, attempt.id), JSON.stringify(attempt, null, 2));
  return file;
}

/** Load the invalidations bound to an attempt and kind whose files still match their digests. */
export function readBoundInvalidations(project, attempt, kind) {
  const pointers = attempt?.evidence?.redInvalidations?.[kind];
  if (!Array.isArray(pointers)) return [];
  const records = [];
  for (const pointer of pointers) {
    if (typeof pointer?.id !== 'string' || !INVALIDATION_ID.test(pointer.id)) continue;
    let text;
    try {
      text = fs.readFileSync(invalidationFilePath(project, pointer.id), 'utf8');
    } catch {
      continue;
    }
    if (digestText(text) !== pointer.digest) continue;
    const record = JSON.parse(text);
    if (record.attemptId !== attempt.id || record.kind !== kind) continue;
    records.push(record);
  }
  return records;
}

/** The valid invalidation of the attempt's current failing red for a kind, or null. */
export function currentRedInvalidation(project, attempt, kind) {
  const red = redForKind(attempt, kind);
  if (!isFailingRed(red)) return null;
  const digest = invalidatedRedDigest(red);
  return readBoundInvalidations(project, attempt, kind)
    .find((record) => record.invalidatedRedDigest === digest) || null;
}

export function redInvalidated(project, attempt, kind) {
  return currentRedInvalidation(project, attempt, kind) !== null;
}

/** The most recently issued valid invalidation for a kind, or null. */
export function latestInvalidation(project, attempt, kind) {
  const records = readBoundInvalidations(project, attempt, kind);
  if (records.length === 0) return null;
  return records.reduce((latest, record) => (
    Date.parse(record.issuedAt) >= Date.parse(latest.issuedAt) ? record : latest
  ));
}

/**
 * A failing CLI red that replaced an invalidated one: it started after the
 * invalidation was issued, and the invalidated digest is still in the red history.
 */
export function laterRedAfterInvalidation(attempt, kind, invalidation) {
  const current = redForKind(attempt, kind);
  if (!isFailingRed(current)) return null;
  if (invalidatedRedDigest(current) === invalidation.invalidatedRedDigest) return null;
  const started = Date.parse(current.startedAt);
  const issued = Date.parse(invalidation.issuedAt);
  if (!Number.isFinite(started) || !Number.isFinite(issued) || started <= issued) return null;
  const inHistory = redHistoryFor(attempt, kind)
    .some((entry) => invalidatedRedDigest(entry) === invalidation.invalidatedRedDigest);
  return inHistory ? current : null;
}

/**
 * Record that the attempt's current failing CLI red for a kind is not genuine.
 * Grants nothing and never edits the stored red.
 *
 * @returns {{ record: object, file: string, attempt: object }}
 */
export function recordRedInvalidation(project, {
  attemptId,
  kind,
  class: invalidationClass,
  note,
  by,
  now = new Date(),
} = {}) {
  if (!kind) throw new Error('red invalidate requires --kind');
  if (!INVALIDATION_CLASSES.includes(invalidationClass)) {
    throw new Error(`red invalidate --class must be one of: ${INVALIDATION_CLASSES.join(', ')}`);
  }
  if (typeof note !== 'string' || note.trim() === '') throw new Error('red invalidate requires --note');
  if (typeof by !== 'string' || by.trim() === '') throw new Error('red invalidate requires --by');
  const attempt = getAttempt(project, attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);
  const red = redForKind(attempt, kind);
  if (!isFailingRed(red)) {
    throw new Error(`attempt ${attemptId} has no failing CLI red for ${kind}; there is nothing to invalidate`);
  }
  if (currentRedInvalidation(project, attempt, kind)) {
    throw new Error(`the failing red for ${kind} is already invalidated`);
  }
  const exception = attempt.evidence?.redExceptions?.[kind];
  if (exception) {
    throw new Error(`attempt already has a ${exception.type} for ${kind}; red invalidate does not apply`);
  }
  const used = (attempt.evidence?.redInvalidations?.[kind] || []).length;
  if (used >= MAX_INVALIDATIONS_PER_KIND) {
    throw new Error(
      `attempt ${attemptId} already has ${used} invalidations for ${kind}; the remaining exit is a human waiver: red waive --invalid-red`,
    );
  }
  const record = {
    schemaVersion: 1,
    id: `inv-${randomUUID()}`,
    attemptId,
    change: attempt.change,
    task: attempt.taskId,
    kind,
    invalidatedRedDigest: invalidatedRedDigest(red),
    class: invalidationClass,
    note: note.trim(),
    by: by.trim(),
    issuedAt: now.toISOString(),
  };
  if (!INVALIDATION_ID.test(record.id)) throw new Error('red invalidation id is invalid');
  const file = bindInvalidation(project, attempt, record);
  appendControlEvent(project, {
    type: 'red.invalidated',
    time: record.issuedAt,
    change: record.change,
    task: record.task,
    attemptId,
    kind,
    cause: invalidationClass,
    resolver: record.by,
  });
  return { record, file, attempt };
}
