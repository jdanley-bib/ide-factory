import fs from 'node:fs';
import path from 'node:path';
import { getAttempt, transitionAttempt } from './attempt.mjs';
import { appendControlEvent } from './event-log.mjs';
import { confirmPrincipal, configuredPrincipalProvider, readPolicyVersion } from './principal.mjs';
import {
  finalizationJournalPath,
  readFinalizationJournal,
  runJournaledFinalization,
} from './finalization-recovery.mjs';
import { hasActiveLockout } from './govern.mjs';
import { halted, ledger, readText } from './layout.mjs';
import { requiredTestKinds } from './red-evidence.mjs';
import { redSatisfaction } from './red-exceptions.mjs';
import {
  assertPassingCliSecurityEvidence,
  humanGateAllows,
} from './risk-gates.mjs';
import { resolveGitBinding } from './verification-evidence.mjs';
import {
  readCheckRegistry,
  requiredChecksFor,
  unpassedChecks,
} from './required-checks.mjs';
import { getWorkItem } from './work.mjs';

/**
 * Complete an accepted (or recoverable) attempt via journaled finalization.
 *
 * Library-only options (never exposed by the production CLI):
 * - faultHook: deterministic in-process crash injection for tests
 * - completionDate / finalizedAt: freeze timestamps for deterministic plans
 *
 * @param {string} project
 * @param {string} change
 * @param {string} taskId
 * @param {string} attemptId
 * @param {{
 *   faultHook?: ((boundary: string) => void) | null,
 *   completionDate?: string,
 *   finalizedAt?: string,
 * }} [options]
 */
export function completeWorkItem(project, change, taskId, attemptId, options = {}) {
  if (halted(project)) {
    const error = new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
    error.code = 'HALT';
    throw error;
  }
  if (hasActiveLockout(project)) {
    throw new Error('Active lockout present under .factory/orchestration/. Resolve before complete.');
  }

  const item = getWorkItem(project, change, taskId);
  if (!item) throw new Error(`Work item not found: ${change}/${taskId}`);
  const attempt = getAttempt(project, attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);
  if (attempt.change !== change || attempt.taskId !== taskId) {
    throw new Error('Attempt does not match work item');
  }

  const journalExists = fs.existsSync(finalizationJournalPath(project, attemptId));
  const recoverableState = attempt.state === 'accepted'
    || attempt.state === 'finalize-failed'
    || (attempt.state === 'finalized' && journalExists);
  if (!recoverableState) {
    throw new Error(`Attempt must be accepted before complete (state=${attempt.state})`);
  }

  const requiredChecks = requiredChecksFor(project, item);
  if (!humanGateAllows(project, {
    action: 'complete',
    verificationProfile: item.factory?.verificationProfile,
    change,
    task: taskId,
    implementerId: attempt.implementerId,
  })) {
    throw new Error(
      'complete requires a valid scoped approval when humanGate is true (or the profile is missing / non-boolean)',
    );
  }

  const config = readConfig(project);
  if (config.governance?.reviewerMustDiffer !== false) {
    if (!attempt.implementerId || !attempt.reviewerId) {
      throw new Error('complete requires implementerId and reviewerId on the attempt');
    }
    if (attempt.implementerId === attempt.reviewerId) {
      throw new Error('reviewer must differ from implementer');
    }
    if (readPolicyVersion(project) >= 2) {
      confirmPrincipal(project, {
        provider: configuredPrincipalProvider(project),
        subject: attempt.reviewerId,
      });
    }
  }

  // Partial finalization may dirty allowlisted targets (for example tasks.md).
  // Resume is still safe when a matching journal binds the same clean HEAD.
  let resumeJournal = null;
  if (journalExists) {
    resumeJournal = readFinalizationJournal(project, attemptId, {
      change,
      taskId,
      attemptId,
    });
  }
  const { sourceRevision } = assertChecksPassed(project, attempt, requiredChecks, {
    allowDirtyWorktree: Boolean(resumeJournal),
    expectedSourceRevision: resumeJournal?.sourceRevision,
    taskType: item.factory?.taskType,
  });
  assertPassingCliSecurityEvidence(project, attempt, item);

  const faultHook = typeof options.faultHook === 'function' ? options.faultHook : null;
  const completionDate = typeof options.completionDate === 'string' && options.completionDate.length > 0
    ? options.completionDate
    : new Date().toISOString().slice(0, 10);
  const finalizedAt = typeof options.finalizedAt === 'string' && options.finalizedAt.length > 0
    ? options.finalizedAt
    : new Date().toISOString();

  try {
    const result = runJournaledFinalization(project, {
      change,
      taskId,
      attemptId,
      sourceRevision,
      completionDate,
      finalizedAt,
      faultHook,
    });
    // Best-effort ledger only after the work-item commit point.
    if (result.status !== 'already-committed') {
      ledger(project, 'complete', { change, taskId, attemptId });
      appendControlEvent(project, {
        type: 'work.completed',
        time: finalizedAt,
        id: taskId,
        change,
        attemptId,
      });
    }
    return {
      item: result.item || getWorkItem(project, change, taskId),
      attempt: result.attempt || getAttempt(project, attemptId),
    };
  } catch (error) {
    try {
      // Never mutate attempt bytes after a journal exists: the journal froze
      // before/after digests, and a finalize-failed rewrite would conflict recovery.
      const current = getAttempt(project, attemptId);
      const hasJournal = fs.existsSync(finalizationJournalPath(project, attemptId));
      if (current && current.state === 'accepted' && !hasJournal) {
        transitionAttempt(project, attemptId, 'finalize-failed', {
          evidence: { error: error.message },
        });
      }
    } catch {
      // keep original error
    }
    throw error;
  }
}

function assertChecksPassed(project, attempt, required, options = {}) {
  const rawChecks = readCheckRegistry(project);

  const { sourceRevision: headSha, worktreeClean } = resolveGitBinding(project);
  if (!headSha) {
    throw new Error('complete requires a clean git worktree at the current HEAD');
  }
  if (!worktreeClean && !options.allowDirtyWorktree) {
    throw new Error('complete requires a clean git worktree at the current HEAD');
  }
  if (
    typeof options.expectedSourceRevision === 'string'
    && options.expectedSourceRevision.length > 0
    && options.expectedSourceRevision !== headSha
  ) {
    throw new Error('finalization journal source revision mismatch');
  }

  const [failure] = unpassedChecks(attempt, required, { rawChecks, headSha, stopAtFirst: true });
  if (failure) {
    throw new Error(failure.reason);
  }

  const taskType = options.taskType === 'lightweight' ? 'lightweight' : 'code';
  if (taskType === 'code') {
    for (const kind of requiredTestKinds(required)) {
      if (redSatisfaction(project, attempt, kind) === 'missing') {
        throw new Error(`complete requires a recorded failing CLI red or red exception for: ${kind}`);
      }
    }
  }

  return { sourceRevision: headSha };
}

function readConfig(project) {
  const file = path.join(project, '.factory', 'config.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(readText(file));
  } catch {
    return {};
  }
}
