import { getAttempt } from './attempt.mjs';
import { readBoundMethod } from './red-method.mjs';
import { readBoundException, redSatisfaction } from './red-exceptions.mjs';
import { checkHostUsageBudgets } from './run-session.mjs';
import { getWorkItem, listWorkItems } from './work.mjs';

/**
 * Whether a closed condition stop still holds for the current project state.
 *
 * @returns {{ holds: boolean, resolution?: string, unresolved?: string[] }}
 */
export function evaluateConditionStop(project, session, { budgets, hostUsage } = {}) {
  switch (session.stopReason) {
    case 'vacuous-red':
      return vacuousRedVerdict(project, session);
    case 'host-usage-unavailable':
      return hostUsageVerdict(budgets, hostUsage);
    case 'invalid-budget':
      return { holds: false, resolution: 'config-fixed' };
    default:
      return { holds: false, resolution: 'state-changed' };
  }
}

function hostUsageVerdict(budgets = {}, hostUsage = {}) {
  const hasCeiling = budgets.maxTokens !== undefined || budgets.maxCost !== undefined;
  const exposed = hostUsage.hostTokens !== undefined || hostUsage.hostCost !== undefined;
  if (hasCeiling) {
    const stop = checkHostUsageBudgets({ budgets }, hostUsage);
    if (stop?.stopReason === 'host-usage-unavailable') return { holds: true };
  }
  return { holds: false, resolution: exposed ? 'metric-exposed' : 'config-fixed' };
}

function vacuousRedVerdict(project, session) {
  const context = session.stopContext;
  if (!context?.attemptId) return legacyVacuousRedVerdict(project, session);
  const attempt = getAttempt(project, context.attemptId);
  const item = getWorkItem(project, attempt.change, attempt.taskId);
  if (item?.attemptId && item.attemptId !== attempt.id) {
    return { holds: false, resolution: 'new-attempt' };
  }
  const unresolved = [];
  const how = new Set();
  for (const kind of context.kinds || []) {
    const satisfied = redSatisfaction(project, attempt, kind);
    if (satisfied === 'missing') unresolved.push(kind);
    else how.add(satisfied);
  }
  if (unresolved.length > 0) return { holds: true, unresolved };
  return { holds: false, resolution: resolutionFor(how) };
}

/** Sessions closed before `stopContext` existed clear on a method or exception recorded after the stop. */
function legacyVacuousRedVerdict(project, session) {
  const stoppedAt = Date.parse(session.lastObservedAt || session.startedAt);
  for (const item of listWorkItems(project, session.change)) {
    if (!item.attemptId) continue;
    const attempt = getAttempt(project, item.attemptId);
    const method = readBoundMethod(project, attempt);
    if (method && Date.parse(method.issuance) > stoppedAt) {
      return { holds: false, resolution: 'method' };
    }
    for (const kind of Object.keys(attempt.evidence?.redExceptions || {})) {
      const record = readBoundException(project, attempt, kind);
      if (record && Date.parse(record.issuance) > stoppedAt) {
        return { holds: false, resolution: 'exception' };
      }
    }
  }
  return { holds: true, unresolved: [] };
}

function resolutionFor(how) {
  if (how.has('method')) return 'method';
  if (how.has('waiver') || how.has('reuse')) return 'exception';
  return 'state-changed';
}
