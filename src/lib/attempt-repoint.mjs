import crypto from 'node:crypto';
import path from 'node:path';
import { appendControlEvent } from './event-log.mjs';
import { writeText } from './layout.mjs';
import {
  evidenceCounts,
  getAttempt,
  hasEvidence,
} from './attempt.mjs';
import { confirmPrincipal, readPolicyVersion } from './principal.mjs';
import { getWorkItem, updateWorkItem } from './work.mjs';

export const REPOINT_USAGE = 'Usage: idefactory attempt repoint <change> <taskId> --attempt <id> '
  + '[--apply --plan-digest <digest> --decided-by <id> --reason "<text>"]';

function summarize(attempt) {
  if (!attempt) return null;
  return {
    id: attempt.id,
    state: attempt.state,
    implementerId: attempt.implementerId || null,
    evidence: evidenceCounts(attempt),
  };
}

function digestOf(body) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
}

/**
 * Preview a pointer repair. Writes nothing. The digest covers the change, task, both pointers,
 * and the evidence counts, so an apply after any of those changed is refused.
 */
export function repointPreview(project, change, taskId, targetId) {
  const item = getWorkItem(project, change, taskId);
  if (!item) throw new Error(`Work item not found: ${change}/${taskId}`);
  const target = getAttempt(project, targetId);
  if (!target) throw new Error(`Attempt not found: ${targetId}`);
  if (target.change !== change || target.taskId !== taskId) {
    throw new Error(`Attempt ${targetId} belongs to ${target.change}/${target.taskId}, not ${change}/${taskId}`);
  }
  if (targetId === item.attemptId) {
    throw new Error(`Attempt ${targetId} is already the current attempt for ${change}/${taskId}`);
  }
  if (target.state === 'rejected') {
    throw new Error(`Attempt ${targetId} is rejected; start a new attempt instead of repointing to it`);
  }
  const current = item.attemptId ? getAttempt(project, item.attemptId) : null;
  const body = {
    change,
    task: taskId,
    currentAttemptId: item.attemptId || null,
    targetAttemptId: targetId,
    current: summarize(current),
    target: summarize(target),
  };
  return { ...body, planDigest: digestOf(body), item, displaced: current };
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required; nothing was written`);
  }
  return value.trim();
}

/**
 * Apply a repair. Writes the work item pointer and its history entry, a repair record under
 * .factory/work/repairs/, and one attempt.repointed event. Attempt files are never edited.
 */
export function applyRepoint(project, {
  change,
  task,
  attemptId,
  planDigest,
  decidedBy,
  reason,
  principalProvider,
  principalSubject,
}) {
  const digest = requireText(planDigest, '--plan-digest');
  const resolver = requireText(decidedBy, '--decided-by');
  const note = requireText(reason, '--reason');
  const plan = repointPreview(project, change, task, attemptId);
  if (plan.planDigest !== digest) {
    throw new Error('plan digest does not match the current state; preview again with idefactory attempt repoint. Nothing was written.');
  }

  const displaced = plan.displaced;
  if (displaced && hasEvidence(evidenceCounts(displaced))) {
    if (typeof displaced.implementerId === 'string' && displaced.implementerId === resolver) {
      throw new Error('repoint over an attempt with evidence needs an identity other than its implementer. Nothing was written.');
    }
    if (readPolicyVersion(project) >= 2) {
      const principal = confirmPrincipal(project, {
        provider: principalProvider,
        subject: principalSubject,
      });
      if (resolver !== principal.subject) {
        throw new Error('repoint decided-by must equal the verified principal subject. Nothing was written.');
      }
    }
  }

  const at = new Date().toISOString();
  const entry = {
    previousAttemptId: plan.currentAttemptId,
    attemptId,
    cause: 'repair',
    at,
  };
  updateWorkItem(project, change, task, {
    attemptId,
    attemptHistory: [...(plan.item.attemptHistory || []), entry],
  });
  const recordFile = path.join(
    project,
    '.factory',
    'work',
    'repairs',
    `${change}--${task}--${at.replace(/[:.]/g, '-')}.json`,
  );
  writeText(recordFile, `${JSON.stringify({
    schemaVersion: 1,
    change,
    task,
    previousAttemptId: plan.currentAttemptId,
    attemptId,
    decidedBy: resolver,
    reason: note,
    planDigest: digest,
    at,
  }, null, 2)}\n`);
  appendControlEvent(project, {
    type: 'attempt.repointed',
    time: at,
    change,
    task,
    previousAttemptId: plan.currentAttemptId,
    attemptId,
    resolver,
  });
  return { change, task, previousAttemptId: plan.currentAttemptId, attemptId, at, record: recordFile };
}
