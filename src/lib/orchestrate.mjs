import { standingDecisionsText } from './standing-decisions.mjs';
import { haltError } from './blocked-error.mjs';
import { blockedReportForStop, focusItem, recordStop, resolveClearedRecords, resolveOpenForChange, resolveSetupStop } from './blocked-states.mjs';
import { setupStopGaps, setupStopMessage } from './setup.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { attemptPath, getAttempt, startAttempt, transitionAttempt } from './attempt.mjs';
import {
  canResumeFinalization,
  finalizationJournalPath,
  readFinalizationJournal,
} from './finalization-recovery.mjs';
import { hasActiveLockout } from './govern.mjs';
import { appendControlEvent } from './event-log.mjs';
import { halted, ledger, readText, writeText } from './layout.mjs';
import { syncTasks } from './queue.mjs';
import {
  checkHostUsageBudgets,
  closeLatestRunSession,
  CONDITION_STOP_REASONS,
  InvalidBudgetError,
  latestRunSession,
  newRunRefusal,
  openOrResumeRunSession,
  parseExposedHostMetric,
  refreshCompletedTasks,
  refreshFailures,
  resolveNewSessionBudgets,
  STICKY_STOP_REASONS,
  writeRunSession,
} from './run-session.mjs';
import { evaluateConditionStop } from './run-stop.mjs';
import { classifyCheckOutcome, isFailingRed, isRequiredTestKind, redForKind, retryKey } from './red-evidence.mjs';
import { describeException, listAttemptExceptions, redSatisfaction } from './red-exceptions.mjs';
import { describeReopens } from './attempt-reopen.mjs';
import { describeAttemptMethod, describeCoverage, describeMethod, methodCoveredKinds } from './red-method.mjs';
import { humanGateAllows } from './risk-gates.mjs';
import { describeProblems, missingChecks, redKindsFor, resolveRequirements } from './required-checks.mjs';
import {
  gitSnapshot,
  registrySetDigest,
  revisionReuse,
  validateCheckRegistry,
} from './verification-evidence.mjs';
import { describeHold, getWorkItem, isHeld, listWorkItems, selectReady, workCounts } from './work.mjs';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_NEEDS_AGENT = 2;


export function runFactory(project, env, options = {}) {
  const focus = {};
  const result = runFactoryCore(project, env, options, focus);
  if (focus.advisory) result.text = `${focus.advisory}${result.text}`;
  const scope = { change: options.change, ...(focus.task ? { task: focus.task } : {}), ...(focus.attemptId ? { attemptId: focus.attemptId } : {}), ...(focus.action ? { action: focus.action } : {}) };
  const blocked = blockedReportForStop(project, result, scope);
  if (blocked) {
    result.blocked = blocked;
    recordStop(project, blocked);
  } else if (result.stopReason === 'all-done') {
    resolveOpenForChange(project, options.change, 'work-completed');
  }
  return result;
}

function runFactoryCore(project, env, {
  change,
  until = 'human-gate',
  maxTasks,
  maxAgentSteps,
  maxTokens,
  maxCost,
  hostTokens,
  hostCost,
  newRun = false,
  acceptBaseline = false,
  acceptReason,
} = {}, focus = {}) {
  if (halted(project)) {
    throw haltError();
  }
  if (!change) throw new Error('Usage: idefactory run --change <name>');
  const setupGaps = setupStopGaps(project);
  if (setupGaps.length) {
    const message = setupStopMessage(setupGaps);
    return { code: EXIT_OK, text: `${message}\n`, stopReason: 'setup-incomplete', request: null, blocked: { message } };
  }
  resolveSetupStop(project, change);
  resolveClearedRecords(project, change);
  if (hasActiveLockout(project)) {
    const focusItemRow = focusItem(project, change);
    if (focusItemRow) {
      focus.task = focusItemRow.id;
      if (focusItemRow.attemptId) focus.attemptId = focusItemRow.attemptId;
    }
    return {
      code: EXIT_ERROR,
      text: 'Active lockout present. Resolve before run.\n',
      stopReason: 'lockout',
    };
  }

  const config = readConfig(project);
  let sessionBudgets;
  let hostUsage;
  try {
    sessionBudgets = resolveNewSessionBudgets(config, {
      maxTasks,
      maxAgentSteps,
      maxTokens,
      maxCost,
    });
    hostUsage = {
      hostTokens: parseExposedHostMetric(hostTokens, env.IDEFACTORY_HOST_TOKENS, {
        label: 'host-tokens',
        integer: true,
      }),
      hostCost: parseExposedHostMetric(hostCost, env.IDEFACTORY_HOST_COST, {
        label: 'host-cost',
        integer: false,
      }),
    };
  } catch (err) {
    if (err instanceof InvalidBudgetError) {
      const latest = latestRunSession(project, change);
      if (latest?.status === 'open') closeLatestRunSession(project, change, 'invalid-budget');
      return {
        code: EXIT_ERROR,
        text: `Run stopped (invalid-budget) for ${change}.\n`,
        stopReason: 'invalid-budget',
        request: null,
      };
    }
    throw err;
  }
  const now = new Date();
  const existingSession = latestRunSession(project, change);
  const refusal = newRun ? newRunRefusal(project, change, existingSession, config) : null;
  if (refusal) {
    return {
      code: EXIT_ERROR,
      text: refusal.text,
      stopReason: refusal.stopReason,
      request: null,
    };
  }
  const priorRunId = existingSession?.runId ?? null;
  let session = openOrResumeRunSession(project, {
    change,
    budgets: sessionBudgets,
    now,
    newRun,
    resumeFlags: { maxTasks, maxAgentSteps },
    config,
    condition: (candidate) => evaluateConditionStop(project, candidate, {
      budgets: sessionBudgets,
      hostUsage,
    }),
  });
  const createdNow = session.runId !== priorRunId;
  if (session.status === 'closed' && (STICKY_STOP_REASONS.has(session.stopReason) || CONDITION_STOP_REASONS.has(session.stopReason))) {
    return {
      code: EXIT_OK,
      text: `Run stopped (${session.stopReason}) for ${change}.\n${unresolvedRedText(project, session)}`,
      stopReason: session.stopReason,
      request: null,
    };
  }
  if (session.status === 'closed' && (session.stopReason === 'infrastructure-failure' || session.stopReason === 'baseline')) {
    session = writeRunSession(project, {
      ...session,
      status: 'open',
      stopReason: null,
      lastObservedAt: new Date().toISOString(),
    });
  }
  const hostStop = checkHostUsageBudgets(session, hostUsage);
  if (hostStop) {
    session = closeRunSession(project, session, hostStop.stopReason, hostStop.patch);
    return {
      code: hostStop.code,
      text: `Run stopped (${hostStop.stopReason}) for ${change}.\n`,
      stopReason: hostStop.stopReason,
      request: null,
    };
  }
  const startedMs = Date.parse(session.startedAt);
  const nowMs = now.getTime();
  if (Number.isFinite(startedMs) && nowMs < startedMs) {
    session = closeRunSession(project, session, 'invalid-session');
    return {
      code: EXIT_ERROR,
      text: `Run stopped (invalid-session) for ${change}.\n`,
      stopReason: 'invalid-session',
      request: null,
    };
  }
  if (Number.isFinite(startedMs) && nowMs - startedMs >= session.budgets.maxWallClockMs) {
    session = closeRunSession(project, session, 'wall-clock');
    return {
      code: EXIT_OK,
      text: `Run stopped (wall-clock) for ${change}.\n`,
      stopReason: 'wall-clock',
      request: null,
    };
  }
  if (session.agentSteps >= session.budgets.maxAgentSteps) {
    session = closeRunSession(project, session, 'max-agent-steps');
    return {
      code: EXIT_OK,
      text: `Run stopped (max-agent-steps) for ${change}.\n`,
      stopReason: 'max-agent-steps',
      request: null,
    };
  }

  syncTasks(project, change, env);
  if (createdNow) {
    const advisory = lowBudgetAdvisory(project, change, session.budgets.maxAgentSteps);
    if (advisory) focus.advisory = advisory;
  }
  session = refreshCompletedTasks(project, session);
  if (session.completedTasks >= session.budgets.maxTasks) {
    session = closeRunSession(project, session, 'max-tasks');
    return {
      code: EXIT_OK,
      text: `Run stopped (max-tasks) for ${change}.\n`,
      stopReason: 'max-tasks',
      request: null,
    };
  }
  session = refreshFailures(project, session);
  if (session.failureCount >= session.budgets.maxFailures) {
    session = closeRunSession(project, session, 'max-failures');
    return {
      code: EXIT_OK,
      text: `Run stopped (max-failures) for ${change}.\n`,
      stopReason: 'max-failures',
      request: null,
    };
  }

  const limit = session.budgets.maxTasks;
  let progressed = 0;

  while (progressed < limit) {
    const counts = workCounts(project, change);
    if (counts.todo === 0 && counts.in_progress === 0) {
      ledger(project, 'run-complete', { change, reason: 'all-done' });
      return {
        code: EXIT_OK,
        text: `Run complete for ${change}: all work items done.\n`,
        stopReason: 'all-done',
      };
    }

    const inProgress = listWorkItems(project, change).find((item) => item.status === 'in_progress');
    let item = inProgress || selectReady(project, change);
    if (item) {
      focus.task = item.id;
      if (item.attemptId) focus.attemptId = item.attemptId;
    }
    if (!item) {
      return {
        code: EXIT_ERROR,
        text: `No ready work items for ${change}. Remaining todos may be blocked by dependencies.\n${heldCauseText(project, change)}`,
        stopReason: 'blocked',
      };
    }

    let attempt = item.attemptId ? getAttempt(project, item.attemptId) : null;
    if (!attempt) {
      const { problems } = resolveRequirements(project, item);
      if (problems.length) {
        return {
          code: EXIT_ERROR,
          text: `Run stopped (blocked) for ${change}: ${item.id} has requirement problems; no attempt started.\n${describeProblems(problems).join('\n')}\n`,
          stopReason: 'blocked',
          request: null,
        };
      }
      const role = primaryRole(item);
      const modelProfile = item.factory?.modelProfile || profileForRole(config, role);
      attempt = startAttempt(project, change, item.id, { role, modelProfile });
      item = getWorkItem(project, change, item.id);
    }
    focus.attemptId = attempt.id;

    if (attempt.state === 'rejected') {
      return {
        code: EXIT_ERROR,
        text: renderStop('rejected', attempt, item),
        stopReason: 'rejected',
        request: null,
      };
    }

    if (attempt.state === 'accepted' || needsCompleteForUnfinishedJournal(project, attempt, item)) {
      const fingerprint = {
        action: 'complete',
        role: 'scribe',
        taskId: item.id,
        attemptId: attempt.id,
        attemptState: attempt.state,
        workItemStatus: item.status,
      };
      if (fingerprintsEqual(session.lastRequestFingerprint, fingerprint)) {
        session = closeRunSession(project, session, 'unchanged-state');
        return {
          code: EXIT_OK,
          text: `Run stopped (unchanged-state) for ${change}.\n`,
          stopReason: 'unchanged-state',
          request: null,
        };
      }
      session = recordPendingStopCleared(project, session);
      session = persistCompleteBeforeRequest(project, session, fingerprint);
      const message = attempt.state === 'accepted'
        ? 'Attempt accepted. Run idefactory complete to finalize.'
        : 'Finalization journal unfinished. Run idefactory complete to resume.';
      return {
        code: EXIT_NEEDS_AGENT,
        text: renderRequest({
          action: 'complete',
          role: 'scribe',
          item,
          attempt,
          modelProfile: profileForRole(config, 'scribe'),
          message,
          standing: standingDecisionsText(project, item),
        }),
        stopReason: 'needs-complete',
        request: { action: 'complete', change, taskId: item.id, attemptId: attempt.id },
      };
    }

    const stage = stageForState(attempt.state, item, { project, attempt });
    if (stage.needsAgent) {
      if (
        stage.nextState === 'accepted'
        && !humanGateAllows(project, {
          action: 'accept',
          verificationProfile: item.factory?.verificationProfile,
          change: attempt.change || change,
          task: item.id,
          implementerId: attempt.implementerId,
        })
      ) {
        focus.action = 'accept';
        return {
          code: EXIT_OK,
          text: renderStop('human-gate', attempt, item),
          stopReason: 'human-gate',
          request: null,
        };
      }
      if (session.agentSteps >= session.budgets.maxAgentSteps) {
        session = closeRunSession(project, session, 'max-agent-steps');
        return {
          code: EXIT_OK,
          text: `Run stopped (max-agent-steps) for ${change}.\n`,
          stopReason: 'max-agent-steps',
          request: null,
        };
      }
      if ((attempt.state === 'planned' || attempt.state === 'assigned') && stage.nextState === 'implementing') {
        const baseline = applyTestBaseline(project, session, attempt, { acceptBaseline, acceptReason });
        session = baseline.session;
        if (baseline.stop) {
          session = closeRunSession(project, session, baseline.stop);
          const extra = baseline.stop === 'infrastructure-failure'
            ? 'Run idefactory setup to map a test command.\n'
            : '';
          return {
            code: EXIT_OK,
            text: `Run stopped (${baseline.stop}) for ${change}.\n${extra}`,
            stopReason: baseline.stop,
            request: null,
          };
        }
      }
      const request = {
        action: 'agent-step',
        role: stage.role,
        change,
        taskId: item.id,
        attemptId: attempt.id,
        state: attempt.state,
        nextState: stage.nextState,
        modelProfile: item.factory?.modelProfile || profileForRole(config, stage.role),
        charter: `.factory/agents/${stage.role}/charter.md`,
        history: `.factory/agents/${stage.role}/history.md`,
        checks: item.factory?.checks || [],
        verificationProfile: item.factory?.verificationProfile,
      };
      const fingerprint = {
        action: 'agent-step',
        role: stage.role,
        taskId: item.id,
        attemptId: attempt.id,
        attemptState: attempt.state,
        workItemStatus: item.status,
      };
      if (fingerprintsEqual(session.lastRequestFingerprint, fingerprint)) {
        session = closeRunSession(project, session, 'unchanged-state');
        return {
          code: EXIT_OK,
          text: `Run stopped (unchanged-state) for ${change}.\n`,
          stopReason: 'unchanged-state',
          request: null,
        };
      }
      session = recordPendingStopCleared(project, session);
      session = persistAgentStepBeforeRequest(project, session, {
        action: 'agent-step',
        role: stage.role,
        taskId: item.id,
        attemptId: attempt.id,
        attemptState: attempt.state,
        workItemStatus: item.status,
      });
      ledger(project, 'run-needs-agent', { change, taskId: item.id, role: stage.role, state: attempt.state });
      return {
        code: EXIT_NEEDS_AGENT,
        text: renderRequest({ ...request, item, attempt, message: withRedExceptions(project, attempt, stage), standing: standingDecisionsText(project, item) }),
        stopReason: 'needs-agent',
        request,
      };
    }

    // Pure file advances are limited; if we cannot advance, stop.
    progressed += 1;
  }

  return {
    code: EXIT_OK,
    text: `Stopped after max-tasks=${limit} for ${change}.\n`,
    stopReason: 'max-tasks',
  };
}

function needsCompleteForUnfinishedJournal(project, attempt, item) {
  if (!attempt || !item || item.status === 'done') return false;
  if (attempt.state !== 'finalized' && attempt.state !== 'finalize-failed') return false;
  const file = finalizationJournalPath(project, attempt.id);
  if (!fs.existsSync(file)) return false;
  try {
    const journal = readFinalizationJournal(project, attempt.id, {
      change: attempt.change,
      taskId: attempt.taskId,
      attemptId: attempt.id,
    });
    return canResumeFinalization(attempt, item, journal);
  } catch {
    return false;
  }
}

function fingerprintsEqual(a, b) {
  if (!a || !b) return false;
  return a.action === b.action
    && a.role === b.role
    && a.taskId === b.taskId
    && a.attemptId === b.attemptId
    && a.attemptState === b.attemptState
    && a.workItemStatus === b.workItemStatus;
}

function persistAgentStepBeforeRequest(project, session, fingerprint) {
  const written = writeRunSession(project, {
    ...session,
    agentSteps: session.agentSteps + 1,
    lastObservedAt: new Date().toISOString(),
    lastRequestFingerprint: fingerprint,
  });
  // Best-effort: ledger() must not block a valid session write.
  ledger(project, 'run-agent-step', {
    change: written.change,
    runId: written.runId,
    agentSteps: written.agentSteps,
  });
  return written;
}

/**
 * A session reopened from `unchanged-state` is cleared once the next request
 * differs from the stored one; the same request closes it again without a clear.
 */
function recordPendingStopCleared(project, session) {
  if (!session.pendingStopCheck) return session;
  const clearedAt = new Date().toISOString();
  const written = writeRunSession(project, {
    ...session,
    pendingStopCheck: null,
    clearedStops: [
      ...(session.clearedStops || []),
      { stopReason: session.pendingStopCheck, clearedAt, resolution: 'state-changed' },
    ],
    lastObservedAt: clearedAt,
  });
  appendControlEvent(project, {
    type: 'run.stop-cleared',
    time: clearedAt,
    runId: written.runId,
    change: written.change,
    stopReason: session.pendingStopCheck,
    resolution: 'state-changed',
  });
  return written;
}

function lowBudgetAdvisory(project, change, maxAgentSteps) {
  const pending = listWorkItems(project, change).filter((item) => item.status !== 'done').length;
  if (pending === 0 || maxAgentSteps >= 4 * pending) return null;
  return `advisory: agent-step budget ${maxAgentSteps} is low for ${pending} pending tasks (suggest at least ${4 * pending})\n`;
}

function unresolvedRedText(project, session) {
  if (session.stopReason !== 'vacuous-red') return '';
  const { unresolved = [] } = evaluateConditionStop(project, session);
  return unresolved.length > 0 ? `Unresolved red kinds: ${unresolved.join(', ')}.\n` : '';
}

function persistCompleteBeforeRequest(project, session, fingerprint) {
  return writeRunSession(project, {
    ...session,
    lastObservedAt: new Date().toISOString(),
    lastRequestFingerprint: fingerprint,
  });
}

function closeRunSession(project, session, stopReason, extra = {}) {
  const written = writeRunSession(project, {
    ...session,
    ...extra,
    status: 'closed',
    stopReason,
    pendingStopCheck: null,
    lastObservedAt: new Date().toISOString(),
  });
  appendControlEvent(project, {
    type: 'run.stopped',
    time: written.lastObservedAt,
    runId: written.runId,
    change: written.change,
    stopReason,
  });
  return written;
}

function alreadySatisfiedHint(attempt) {
  const kinds = [...new Set((attempt?.evidence?.redFailures || [])
    .filter((entry) => entry.classification === 'vacuous-red')
    .map((entry) => entry.kind))]
    .filter((kind) => !isFailingRed(redForKind(attempt, kind)));
  if (kinds.length === 0) return '';
  const kindFlags = kinds.map((kind) => `--kind ${kind}`).join(' ');
  return ` A red run reported vacuous-red for ${kinds.join(', ')}. If the behavior already exists, record an already-satisfied method: `
    + `idefactory method propose ${attempt.id} --choice no-red --reason already-satisfied --rationale "<text>" --implementer <id> ${kindFlags} --test-path <path>. `
    + 'Cite the tests that cover the behavior; the diff may change only those tests.';
}

function stageForState(state, item, { project, attempt } = {}) {
  const roles = item.factory?.roles || ['engineer', 'reviewer', 'scribe'];
  const implementer = item.factory?.route === 'quick'
    ? 'engineer'
    : roles.find((role) => !['reviewer', 'scribe', 'security-reviewer'].includes(role))
      || 'engineer';
  switch (state) {
    case 'planned':
    case 'assigned':
      return {
        needsAgent: true,
        role: implementer,
        nextState: 'implementing',
        message: 'Begin implementation. Record implementerId, then transition to implementing / red-confirmed.',
      };
    case 'implementing':
      if (item.factory?.taskType === 'lightweight') {
        return {
          needsAgent: true,
          role: implementer,
          nextState: 'verifying',
          message: 'Lightweight item. Implement and run verification. A failing test is not required.',
        };
      }
      if (redKindsFor(project, item).length === 0) {
        return {
          needsAgent: true,
          role: implementer,
          nextState: 'verifying',
          message: 'No check of this item needs a failing test. Implement, run the verification profile checks, and move to verifying. A failing test is not required.',
        };
      }
      if (project && attempt && redRequirementMet(project, attempt, item)) {
        return {
          needsAgent: true,
          role: implementer,
          nextState: 'verifying',
          message: methodCoveredKinds(project, attempt).length > 0
            ? 'Every required test kind has a failing red or is covered by the recorded no-red method. Implement until green, run verification profile checks, and move to verifying.'
            : 'Every required test kind has a red or a human-authorized red exception. Implement until green, run verification profile checks, and move to verifying.',
        };
      }
      return {
        needsAgent: true,
        role: implementer,
        nextState: 'red-confirmed',
        message: 'Write a failing test and report red evidence with idefactory verify run --red.'
          + (item.factory?.taskTypeSource === 'inferred'
            ? ' If a failing test cannot specify the change, record a no-red method with idefactory method propose before editing.'
            : '')
          + alreadySatisfiedHint(attempt),
      };
    case 'red-confirmed':
      return {
        needsAgent: true,
        role: implementer,
        nextState: 'verifying',
        message: 'Implement until green and run verification profile checks.',
      };
    case 'verifying': {
      if (project && attempt) {
        const missing = missingChecks(project, attempt, item);
        if (missing.length) {
          const commands = missing
            .map((kind) => `idefactory verify run ${attempt.id} --check ${kind}`)
            .join('; ');
          return {
            needsAgent: true,
            role: implementer,
            nextState: 'awaiting-review',
            message: `Record a passing verify run for: ${missing.join(', ')}. Run ${commands}, then hand off for review.`,
          };
        }
      }
      const needsSecurity = (item.factory?.securityProfile === 'security-sensitive')
        || (item.factory?.checks || []).some((check) => /security|sast|threat|secret|audit/i.test(check));
      if (needsSecurity) {
        return {
          needsAgent: true,
          role: 'security-reviewer',
          nextState: 'security-checking',
          message: 'Run security profile checks and record security evidence.',
        };
      }
      return {
        needsAgent: true,
        role: 'reviewer',
        nextState: 'awaiting-review',
        message: 'Hand off for review with verification evidence recorded.',
      };
    }
    case 'security-checking':
      return {
        needsAgent: true,
        role: 'reviewer',
        nextState: 'awaiting-review',
        message: 'Security evidence recorded. Reviewer reviews the change.',
      };
    case 'awaiting-review':
      return {
        needsAgent: true,
        role: 'reviewer',
        nextState: 'accepted',
        message: 'Reviewer returns ACCEPT or REJECT with reviewerId different from implementer.',
      };
    default:
      return { needsAgent: false };
  }
}

function redRequirementMet(project, attempt, item) {
  const kinds = redKindsFor(project, item);
  if (kinds.length === 0) return false;
  return kinds.every((kind) => redSatisfaction(project, attempt, kind) !== 'missing');
}

function primaryRole(item) {
  if (item.factory?.route === 'quick') return 'engineer';
  const roles = item.factory?.roles || ['engineer'];
  return roles.find((role) => !['reviewer', 'scribe'].includes(role)) || 'engineer';
}

function profileForRole(config, role) {
  return config.roles?.[role]?.modelProfile
    || config.modelProfiles && 'coding-standard'
    || 'coding-standard';
}

function withRedExceptions(project, attempt, stage) {
  const method = describeAttemptMethod(project, attempt);
  let message = stage.message;
  if (method) {
    const methodLines = [describeMethod(method), ...describeCoverage(method)].map((line) => `- ${line}`);
    if (stage.role === 'reviewer' || stage.role === 'security-reviewer') {
      methodLines.push(
        `- Record a method review: idefactory method review ${attempt.id} --verdict ACCEPT|REJECT --reviewer <id> --note "text". Reject it when the reason class does not fit the diff.`,
      );
    } else if (!method.review) {
      methodLines.push('- A different role must record a method review before this attempt can be accepted.');
    }
    message = `${message}\n\nRed method:\n${methodLines.join('\n')}`;
  }
  if (stage.role !== 'reviewer' && stage.role !== 'security-reviewer') return message;
  const reopenLines = describeReopens(attempt);
  if (reopenLines.length > 0) {
    message = `${message}\n\nReopened attempt (the earlier verdict does not cover the amended evidence):\n${reopenLines.map((line) => `- ${line}`).join('\n')}`;
  }
  const lines = listAttemptExceptions(project, attempt).map((row) => `- ${describeException(row)}`);
  if (lines.length === 0) return message;
  return `${message}\n\nRed exceptions:\n${lines.join('\n')}`;
}

function renderRequest(request) {
  const lines = [
    '# Orchestration request',
    '',
    `Action: ${request.action}`,
    `Role: ${request.role}`,
    `Model profile: ${request.modelProfile || 'coding-standard'}`,
    `Change: ${request.change || request.item?.change}`,
    `Work item: ${request.taskId || request.item?.id}`,
    `Attempt: ${request.attemptId || request.attempt?.id}`,
    `State: ${request.state || request.attempt?.state || ''}`,
    `Next state: ${request.nextState || ''}`,
    `Charter: ${request.charter || `.factory/agents/${request.role}/charter.md`}`,
    `History: ${request.history || `.factory/agents/${request.role}/history.md`}`,
    '',
    request.message || '',
    '',
    ...(request.standing ? [request.standing, ''] : []),
    '```json',
    JSON.stringify({
      action: request.action,
      role: request.role,
      change: request.change || request.item?.change,
      taskId: request.taskId || request.item?.id,
      attemptId: request.attemptId || request.attempt?.id,
      state: request.state || request.attempt?.state,
      nextState: request.nextState,
      modelProfile: request.modelProfile,
      checks: request.checks,
      verificationProfile: request.verificationProfile,
    }, null, 2),
    '```',
    '',
    'The IDE session model does the work. Do not start a model process from the CLI.',
    '',
  ];
  return lines.join('\n');
}

function renderStop(reason, attempt, item) {
  return [
    `# Run stopped (${reason})`,
    '',
    `Change: ${item.change}`,
    `Work item: ${item.id}`,
    `Attempt: ${attempt.id}`,
    `State: ${attempt.state}`,
    '',
  ].join('\n');
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

function applyTestBaseline(project, session, attempt, { acceptBaseline, acceptReason }) {
  const mapped = mappedTestChecks(project);
  if (mapped.length === 0) return { session, stop: null };
  const snapshot = gitSnapshot(project);
  const revision = snapshot.head || '';
  const configDigest = registrySetDigest(mapped);
  const current = session.testBaseline;
  if (
    current
    && (current.result === 'passed' || current.result === 'accepted')
    && current.configDigest === configDigest
    && revisionReuse(project, current.sourceRevision, snapshot).valid
  ) {
    return { session, stop: null };
  }

  for (const entry of mapped) {
    const classification = runMappedCheck(project, entry);
    if (classification === 'infrastructure-failure') {
      const count = bumpAttemptRetry(project, attempt, classification, entry.kind);
      return { session, stop: count >= 4 ? 'retry-cap' : 'infrastructure-failure' };
    }
    if (classification === 'assertion-failure') {
      if (acceptBaseline) {
        return {
          session: writeRunSession(project, {
            ...session,
            testBaseline: {
              sourceRevision: revision,
              configDigest,
              result: 'accepted',
              reason: acceptReason,
              acceptedAt: new Date().toISOString(),
            },
          }),
          stop: null,
        };
      }
      return { session, stop: 'baseline' };
    }
  }

  return {
    session: writeRunSession(project, {
      ...session,
      testBaseline: { sourceRevision: revision, configDigest, result: 'passed' },
    }),
    stop: null,
  };
}

function mappedTestChecks(project) {
  const registryPath = path.join(project, '.factory', 'checks.json');
  if (!fs.existsSync(registryPath)) return [];
  try {
    const registry = validateCheckRegistry(JSON.parse(readText(registryPath)), { projectRoot: project });
    return Object.entries(registry.checks)
      .filter(([kind]) => isRequiredTestKind(kind))
      .map(([kind, entry]) => ({ kind, ...entry }));
  } catch {
    return [];
  }
}

function runMappedCheck(project, entry) {
  const result = spawnSync(entry.argv[0], entry.argv.slice(1), {
    cwd: project,
    shell: false,
    timeout: entry.timeoutMs,
    encoding: 'buffer',
  });
  const timedOut = Boolean(result.error && result.error.code === 'ETIMEDOUT');
  const spawnError = result.error && !timedOut ? result.error : null;
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  return classifyCheckOutcome({
    spawnError,
    timedOut,
    exitCode: typeof result.status === 'number' ? result.status : null,
    output: Buffer.concat([stdout, stderr]).toString('utf8'),
    asRed: false,
  });
}

function bumpAttemptRetry(project, attempt, classification, kind) {
  const fresh = getAttempt(project, attempt.id) || attempt;
  const key = retryKey(classification, kind);
  const counts = { ...(fresh.evidence?.retryCounts || {}) };
  counts[key] = (counts[key] || 0) + 1;
  fresh.evidence = fresh.evidence || {};
  fresh.evidence.retryCounts = counts;
  fresh.updatedAt = new Date().toISOString();
  writeText(attemptPath(project, fresh.id), JSON.stringify(fresh, null, 2));
  return counts[key];
}

export { getWorkItem, transitionAttempt };

function heldCauseText(project, change) {
  const items = listWorkItems(project, change);
  const held = items.filter(isHeld);
  if (held.length === 0) return '';
  const lines = held.map((item) => {
    const blocked = items
      .filter((entry) => entry.status === 'todo' && (entry.dependencies || []).includes(item.id))
      .map((entry) => entry.id);
    return `- ${item.id} is ${describeHold(item)}${blocked.length ? `; blocks ${blocked.join(', ')}` : ''}`;
  });
  return `Held items:\n${lines.join('\n')}\nResume or release them with idefactory sync-tasks ${change} --plan.\n`;
}
