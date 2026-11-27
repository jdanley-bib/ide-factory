import { getAttempt } from './attempt.mjs';
import { getWorkItem } from './work.mjs';
import { checkStates, readCheckRegistry, redKindsFor, requiredChecksFor } from './required-checks.mjs';
import { redSatisfaction } from './red-exceptions.mjs';
import { gitSnapshot } from './verification-evidence.mjs';

export const VERIFY_STATUS_SCHEMA_VERSION = 1;

/** Red state per kind in the item's resolved requirement set: cli, reuse, waiver, or missing. */
export function redStates(project, attempt, item) {
  return redKindsFor(project, item).map((kind) => ({ kind, state: redSatisfaction(project, attempt, kind) }));
}

/**
 * Per-check state for one attempt, judged by the same rule the gates use. Read-only.
 */
export function verifyStatus(project, attemptId) {
  const attempt = getAttempt(project, attemptId);
  if (!attempt) throw new Error(`Unknown attempt: ${attemptId}`);
  const item = getWorkItem(project, attempt.change, attempt.taskId);
  const required = requiredChecksFor(project, item);
  const checks = checkStates(attempt, required, {
    rawChecks: readCheckRegistry(project),
    project,
    snapshot: gitSnapshot(project),
  });
  return {
    schemaVersion: VERIFY_STATUS_SCHEMA_VERSION,
    attemptId: attempt.id,
    change: attempt.change,
    taskId: attempt.taskId,
    allValid: checks.every((entry) => entry.state === 'valid'),
    checks,
    reds: redStates(project, attempt, item),
  };
}

export function renderVerifyStatusText(status) {
  const lines = [`Verification status for attempt ${status.attemptId} (${status.change} ${status.taskId})`];
  for (const entry of status.checks) {
    lines.push(`  ${entry.kind}: ${entry.state}${entry.reason ? ` - ${entry.reason}` : ''}`);
  }
  for (const entry of status.reds || []) lines.push(`  red ${entry.kind}: ${entry.state}`);
  lines.push(`allValid: ${status.allValid}`);
  return `${lines.join('\n')}\n`;
}
