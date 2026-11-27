import fs from 'node:fs';
import path from 'node:path';
import { AUTHORITY, describeGate, eventGateIds, gateForEvent, EVENT_GATES } from './authority.mjs';
import { codeForStopReason } from './blocked-states.mjs';
import { readControlEvents } from './event-log.mjs';
import { isRetryDecision } from './mcp-progress.mjs';
import { readRunSession, runsDir } from './run-session.mjs';

export const AUTONOMY_SCHEMA_VERSION = 2;
export const SCOPE_STATEMENT = 'This report covers interventions the factory recorded. It does not cover prompts typed into an IDE chat.';
export const CATEGORIES = ['policy-decision', 'failure', 'redundant'];

/** Invariants that are an intentional human decision when a human is the actor. */
export const POLICY_SET = new Set([
  'approval-missing',
  'halted',
  'budget-exhausted',
  'new-run-cap',
]);

/** Event types whose gate needs a person or an identity other than the implementer. */
export const HUMAN_DECISION_EVENTS = new Set(
  Object.keys(EVENT_GATES).filter((type) => eventGateIds(type).some((id) => AUTHORITY[id].level !== 'agent')),
);

/** Stop reasons that close a session without a stop: the run finished or hands off to an agent. */
const NON_STOP_REASONS = new Set(['all-done', 'needs-agent', 'needs-complete']);

/**
 * Ordered classification of one blocked.recorded event: handled, redundant, policy-decision,
 * or failure. The order matters: an avoidable stop is redundant even when its invariant is
 * normally a policy decision. Only a human-level stop is an intervention.
 */
export function classifyStop(event) {
  const level = event.level || (event.actor === 'human' ? 'human' : 'agent');
  if (level !== 'human') return 'handled';
  if (event.agentActionable === true) return 'redundant';
  if (POLICY_SET.has(event.invariant)) return 'policy-decision';
  return 'failure';
}

export function parseSince(value) {
  if (value === undefined) return null;
  const at = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(at)) throw new Error('--since must be an ISO 8601 time');
  return at;
}

function inRange(event, { change, since }) {
  if (change && event.change !== change) return false;
  if (since !== null && since !== undefined) {
    const at = Date.parse(event.time || '');
    if (Number.isNaN(at) || at < since) return false;
  }
  return true;
}

function bump(map, key) {
  map[key] = (map[key] || 0) + 1;
}

/**
 * Closed run sessions whose stop no blocked.recorded event with the same code explains. A session
 * file that cannot be read is listed as unreadable and does not stop the report.
 */
function sessionCompleteness(project, events, { change, since }) {
  const stops = [];
  const unreadable = [];
  const dir = runsDir(project);
  if (!fs.existsSync(dir)) return { stops, unreadable };
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort()) {
    let session;
    try {
      session = readRunSession(path.join(dir, name));
    } catch {
      unreadable.push({ file: name, unreadable: true });
      continue;
    }
    if (session.status !== 'closed' || !session.stopReason || NON_STOP_REASONS.has(session.stopReason)) continue;
    if (change && session.change !== change) continue;
    if (since !== null && Date.parse(session.lastObservedAt || '') < since) continue;
    const code = codeForStopReason(session.stopReason);
    const startedAt = Date.parse(session.startedAt);
    const recorded = events.some((event) => event.type === 'blocked.recorded'
      && event.change === session.change
      && event.invariant === code
      && Date.parse(event.time) >= startedAt);
    if (!recorded) {
      stops.push({
        runId: session.runId,
        change: session.change,
        stopReason: session.stopReason,
        code,
        closedAt: session.lastObservedAt || null,
      });
    }
  }
  return { stops, unreadable };
}

/**
 * Autonomy report derived from the control event log. Pure read: it writes nothing.
 *
 * @param {string} project
 * @param {{ change?: string, since?: string }} [options]
 */
export function buildAutonomyReport(project, options = {}) {
  if (options.change !== undefined && (typeof options.change !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.change))) {
    throw new Error('--change must be an OpenSpec change name');
  }
  const since = parseSince(options.since);
  const all = readControlEvents(project);
  const selected = all.filter((event) => inRange(event, { change: options.change, since }));

  const interventions = [];
  const decisions = [];
  const handledByInvariant = {};
  const byCategory = Object.fromEntries(CATEGORIES.map((name) => [name, 0]));
  const byInvariant = {};
  const byItem = {};
  const recoveries = [];
  let handled = 0;
  let unclassifiedEvents = 0;
  let stopEvents = 0;
  const recoveredPlans = new Set();

  selected.forEach((event, index) => {
    if (event.type !== 'mcp-decision') return;
    if ((event.outcome !== 'applied' && isRetryDecision(event.decision)) || event.decision === 'skip-applied') {
      stopEvents += 1;
      handled += 1;
      bump(handledByInvariant, 'operation-retry');
      const ack = selected.slice(index + 1).find((next) => next.type === 'mcp-ack' && next.planId === event.planId);
      if (ack && !recoveredPlans.has(event.planId)) {
        recoveredPlans.add(event.planId);
        recoveries.push({
          change: event.change || null,
          task: null,
          invariant: 'operation-retry',
          recordedAt: event.time,
          resolvedAt: ack.time,
          resolution: 'mcp-ack',
        });
      }
    } else if (event.cause === 'conflict' && event.decision === 'abandon') {
      stopEvents += 1;
      handled += 1;
      bump(handledByInvariant, 'operation-conflict');
    }
  });

  selected.forEach((event, index) => {
    if (event.type !== 'blocked.recorded') return;
    stopEvents += 1;
    if (typeof event.actor !== 'string') {
      unclassifiedEvents += 1;
      return;
    }
    const category = classifyStop(event);
    if (category === 'handled') {
      handled += 1;
      bump(handledByInvariant, event.invariant || 'unclassified');
      const recovery = autonomousRecovery(selected, index, event);
      if (recovery) recoveries.push(recovery);
      return;
    }
    byCategory[category] += 1;
    bump(byInvariant, event.invariant || 'unclassified');
    const item = event.task ? `${event.change}/${event.task}` : `${event.change}`;
    bump(byItem, item);
    interventions.push({
      time: event.time,
      category,
      invariant: event.invariant || 'unclassified',
      change: event.change || null,
      task: event.task || null,
    });
  });

  selected.forEach((event) => {
    const gateId = gateForEvent(event);
    if (!gateId) return;
    const { level } = describeGate(project, gateId);
    const change = event.change || null;
    const task = event.task || null;
    if (level !== 'human') {
      decisions.push({ time: event.time, event: event.type, gate: gateId, level, change, task });
      return;
    }
    byCategory['policy-decision'] += 1;
    bump(byItem, task ? `${change}/${task}` : `${change}`);
    interventions.push({ time: event.time, category: 'policy-decision', invariant: null, event: event.type, change, task });
  });

  const completeness = sessionCompleteness(project, all, { change: options.change, since });
  const measurementComplete = completeness.stops.length === 0 && completeness.unreadable.length === 0;
  const routineClean = measurementComplete && byCategory.failure === 0 && byCategory.redundant === 0;
  const noStopEvents = stopEvents === 0;
  return {
    schemaVersion: AUTONOMY_SCHEMA_VERSION,
    scope: SCOPE_STATEMENT,
    range: { change: options.change || null, since: options.since || null },
    eventsRead: selected.length,
    noStopEvents,
    noEvents: noStopEvents,
    ...(noStopEvents ? { reason: all.length === 0 ? 'no events were recorded' : 'no stop events were recorded in this range' } : {}),
    interventions,
    decisions,
    counts: {
      interventions: interventions.length,
      decisions: decisions.length,
      byCategory,
      byInvariant,
      byItem,
      handled,
      handledByInvariant,
      autonomousRecoveries: recoveries.length,
    },
    autonomousRecoveries: recoveries,
    unclassifiedEvents,
    unrecordedStops: completeness.stops,
    unreadableSessions: completeness.unreadable,
    measurementComplete,
    routineClean,
  };
}

function autonomousRecovery(events, index, recorded) {
  for (let next = index + 1; next < events.length; next += 1) {
    const event = events[next];
    if (event.change !== recorded.change) continue;
    if (HUMAN_DECISION_EVENTS.has(event.type)) return null;
    if (
      event.type === 'blocked.resolved'
      && (event.task || null) === (recorded.task || null)
    ) {
      return {
        change: recorded.change || null,
        task: recorded.task || null,
        invariant: recorded.invariant || 'unclassified',
        recordedAt: recorded.time,
        resolvedAt: event.time,
        resolution: event.resolution || null,
      };
    }
  }
  return null;
}

export function renderAutonomyText(report) {
  const lines = [
    'Autonomy report',
    report.scope,
    '',
  ];
  if (report.range.change || report.range.since) {
    lines.push(`Range: ${[report.range.change && `change ${report.range.change}`, report.range.since && `since ${report.range.since}`].filter(Boolean).join(', ')}`);
  }
  if (report.noStopEvents && report.eventsRead > 0) lines.push(`${report.eventsRead} events were read and none were stops.`);
  if (report.counts.interventions === 0 && report.noStopEvents) {
    lines.push(`Interventions: 0 (${report.reason})`);
  } else {
    lines.push(`Interventions: ${report.counts.interventions}`);
  }
  for (const category of CATEGORIES) lines.push(`  ${category}: ${report.counts.byCategory[category]}`);
  const invariants = Object.entries(report.counts.byInvariant).sort();
  if (invariants.length) lines.push(`By invariant: ${invariants.map(([code, n]) => `${code}=${n}`).join(', ')}`);
  const items = Object.entries(report.counts.byItem).sort();
  if (items.length) lines.push(`By work item: ${items.map(([item, n]) => `${item}=${n}`).join(', ')}`);
  lines.push(`Decisions that needed no person: ${report.counts.decisions}`);
  lines.push(`Handled without a human: ${report.counts.handled}`);
  lines.push(`Autonomous recoveries: ${report.counts.autonomousRecoveries}`);
  if (report.unclassifiedEvents > 0) lines.push(`Events without an actor (skipped): ${report.unclassifiedEvents}`);
  if (report.unrecordedStops.length) {
    lines.push(`Unrecorded stops: ${report.unrecordedStops.length}`);
    for (const row of report.unrecordedStops) {
      lines.push(`- ${row.closedAt || '-'} ${row.change} run ${row.runId} ${row.stopReason} (${row.code})`);
    }
  }
  if (report.unreadableSessions.length) {
    lines.push(`Unreadable run sessions: ${report.unreadableSessions.map((row) => row.file).join(', ')}`);
  }
  lines.push(`measurementComplete: ${report.measurementComplete}`);
  lines.push(`routineClean: ${report.routineClean}`);
  if (report.interventions.length) {
    lines.push('', 'Interventions:');
    for (const row of report.interventions) {
      lines.push(`- ${row.time} ${row.category} ${row.invariant || row.event} ${row.change || '-'}${row.task ? `/${row.task}` : ''}`);
    }
  }
  if (report.decisions.length) {
    lines.push('', 'Decisions:');
    for (const row of report.decisions) {
      lines.push(`- ${row.time} ${row.level} ${row.event} ${row.change || '-'}${row.task ? `/${row.task}` : ''}`);
    }
  }
  return lines.join('\n');
}
