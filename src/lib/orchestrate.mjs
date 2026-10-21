import fs from 'node:fs';
import path from 'node:path';
import { getAttempt, startAttempt, transitionAttempt } from './attempt.mjs';
import { halted, ledger, readText } from './layout.mjs';
import { syncTasks } from './queue.mjs';
import {
  checkHostUsageBudgets,
  InvalidBudgetError,
  openOrResumeRunSession,
  parseExposedHostMetric,
  refreshCompletedTasks,
  refreshFailures,
  resolveNewSessionBudgets,
  STICKY_STOP_REASONS,
  writeRunSession,
} from './run-session.mjs';
import { humanGateAllows } from './risk-gates.mjs';
import { getWorkItem, listWorkItems, selectReady, workCounts } from './work.mjs';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_NEEDS_AGENT = 2;

export function runFactory(project, env, {
  change,
  until = 'human-gate',
  maxTasks,
  maxAgentSteps,
  maxTokens,
  maxCost,
  hostTokens,
  hostCost,
  newRun = false,
} = {}) {
  if (halted(project)) {
    const error = new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
    error.code = 'HALT';
    throw error;
  }
  if (!change) throw new Error('Usage: idefactory run --change <name>');
  if (hasActiveLockout(project)) {
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
  let session = openOrResumeRunSession(project, {
    change,
    budgets: sessionBudgets,
    now,
    newRun,
    resumeFlags: { maxTasks, maxAgentSteps },
    config,
  });
  if (session.status === 'closed' && STICKY_STOP_REASONS.has(session.stopReason)) {
    return {
      code: EXIT_OK,
      text: `Run stopped (${session.stopReason}) for ${change}.\n`,
      stopReason: session.stopReason,
      request: null,
    };
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
    if (!item) {
      return {
        code: EXIT_ERROR,
        text: `No ready work items for ${change}. Remaining todos may be blocked by dependencies.\n`,
        stopReason: 'blocked',
      };
    }

    let attempt = item.attemptId ? getAttempt(project, item.attemptId) : null;
    if (!attempt) {
      const role = primaryRole(item);
      const modelProfile = item.factory?.modelProfile || profileForRole(config, role);
      attempt = startAttempt(project, change, item.id, { role, modelProfile });
      item = getWorkItem(project, change, item.id);
    }

    if (attempt.state === 'rejected') {
      return {
        code: EXIT_ERROR,
        text: renderStop('rejected', attempt, item),
        stopReason: 'rejected',
        request: null,
      };
    }

    if (attempt.state === 'accepted') {
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
      session = persistCompleteBeforeRequest(project, session, fingerprint);
      return {
        code: EXIT_NEEDS_AGENT,
        text: renderRequest({
          action: 'complete',
          role: 'scribe',
          item,
          attempt,
          modelProfile: profileForRole(config, 'scribe'),
          message: 'Attempt accepted. Run idefactory complete to finalize.',
        }),
        stopReason: 'needs-complete',
        request: { action: 'complete', change, taskId: item.id, attemptId: attempt.id },
      };
    }

    const stage = stageForState(attempt.state, item);
    if (stage.needsAgent) {
      if (
        stage.nextState === 'accepted'
        && !humanGateAllows(project, {
          action: 'accept',
          verificationProfile: item.factory?.verificationProfile,
        })
      ) {
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
        text: renderRequest({ ...request, item, attempt, message: stage.message }),
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

function persistCompleteBeforeRequest(project, session, fingerprint) {
  return writeRunSession(project, {
    ...session,
    lastObservedAt: new Date().toISOString(),
    lastRequestFingerprint: fingerprint,
  });
}

function closeRunSession(project, session, stopReason, extra = {}) {
  return writeRunSession(project, {
    ...session,
    ...extra,
    status: 'closed',
    stopReason,
    lastObservedAt: new Date().toISOString(),
  });
}

function stageForState(state, item) {
  const roles = item.factory?.roles || ['engineer', 'reviewer', 'scribe'];
  const implementer = roles.find((role) => !['reviewer', 'scribe', 'security-reviewer'].includes(role))
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
      return {
        needsAgent: true,
        role: implementer,
        nextState: 'red-confirmed',
        message: 'Write a failing test and report red evidence.',
      };
    case 'red-confirmed':
      return {
        needsAgent: true,
        role: implementer,
        nextState: 'verifying',
        message: 'Implement until green and run verification profile checks.',
      };
    case 'verifying': {
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

function primaryRole(item) {
  const roles = item.factory?.roles || ['engineer'];
  return roles.find((role) => !['reviewer', 'scribe'].includes(role)) || 'engineer';
}

function profileForRole(config, role) {
  return config.roles?.[role]?.modelProfile
    || config.modelProfiles && 'coding-standard'
    || 'coding-standard';
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

function hasActiveLockout(project) {
  const dir = path.join(project, '.factory', 'orchestration');
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((name) => name.includes('lockout') && name.endsWith('.md'));
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

export { getWorkItem, transitionAttempt };
