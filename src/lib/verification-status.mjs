import { getAttempt } from './attempt.mjs';
import { getWorkItem } from './work.mjs';
import { checkStates, readCheckRegistry, requiredChecksFor } from './required-checks.mjs';
import { gitSnapshot } from './verification-evidence.mjs';

export const VERIFY_STATUS_SCHEMA_VERSION = 1;

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
  };
}

export function renderVerifyStatusText(status) {
  const lines = [`Verification status for attempt ${status.attemptId} (${status.change} ${status.taskId})`];
  for (const entry of status.checks) {
    lines.push(`  ${entry.kind}: ${entry.state}${entry.reason ? ` - ${entry.reason}` : ''}`);
  }
  lines.push(`allValid: ${status.allValid}`);
  return `${lines.join('\n')}\n`;
}
