import { redKindsFor } from './required-checks.mjs';
import { readBoundException, redDigestOf, redSatisfaction } from './red-exceptions.mjs';
import { redForKind, redHistoryFor } from './red-evidence.mjs';
import { getWorkItem } from './work.mjs';

export const RED_LIST_SCHEMA_VERSION = 1;

function recordedKinds(project, attempt) {
  const kinds = new Set([
    ...Object.keys(attempt.evidence?.redHistory || {}),
    ...Object.keys(attempt.evidence?.reds || {}),
    ...Object.keys(attempt.evidence?.redExceptions || {}),
  ]);
  if (attempt.evidence?.red?.kind) kinds.add(attempt.evidence.red.kind);
  try {
    const item = getWorkItem(project, attempt.change, attempt.taskId);
    if (item) for (const kind of redKindsFor(project, item)) kinds.add(kind);
  } catch {
    // an item with requirement problems still lists the reds it holds
  }
  return [...kinds].sort();
}

/**
 * Every red in each kind's history with its digest, which one is current, which exception
 * references it, and what satisfies red for the kind. Writes nothing.
 */
export function listReds(project, attempt) {
  const kinds = recordedKinds(project, attempt).map((kind) => {
    const history = redHistoryFor(attempt, kind);
    const current = redForKind(attempt, kind);
    const exception = readBoundException(project, attempt, kind);
    const currentDigest = current ? redDigestOf(current) : null;
    const entries = history.map((record, index) => {
      const digest = redDigestOf(record);
      return {
        order: index + 1,
        digest,
        startedAt: record.startedAt ?? null,
        finishedAt: record.finishedAt ?? null,
        exitCode: record.exitCode ?? null,
        current: digest === currentDigest && index === history.length - 1,
        invalidated: Boolean(exception?.invalidRed && exception.invalidRed.redDigest === digest),
        referencedBy: exception?.invalidRed && exception.invalidRed.redDigest === digest ? exception.id : null,
      };
    });
    return {
      kind,
      satisfiedBy: redSatisfaction(project, attempt, kind),
      exception: exception ? { id: exception.id, type: exception.type, invalidRed: Boolean(exception.invalidRed) } : null,
      entries,
    };
  });
  return { schemaVersion: RED_LIST_SCHEMA_VERSION, attemptId: attempt.id, kinds };
}

export function renderRedList(doc) {
  const lines = [`Reds for attempt ${doc.attemptId}`];
  if (doc.kinds.length === 0) lines.push('(no required red kinds and none recorded)');
  for (const row of doc.kinds) {
    lines.push('', `${row.kind}: red satisfied by ${row.satisfiedBy}`);
    if (row.exception) lines.push(`  exception ${row.exception.id} (${row.exception.type}${row.exception.invalidRed ? ', invalid-red' : ''})`);
    if (row.entries.length === 0) lines.push('  (no red recorded)');
    for (const entry of row.entries) {
      const marks = [
        entry.current ? 'current' : null,
        entry.invalidated ? 'invalidated' : null,
        entry.referencedBy ? `referenced by ${entry.referencedBy}` : null,
      ].filter(Boolean);
      lines.push(`  #${entry.order} ${entry.digest} started ${entry.startedAt} exit ${entry.exitCode}${marks.length ? ` [${marks.join(', ')}]` : ''}`);
    }
  }
  return lines.join('\n');
}
