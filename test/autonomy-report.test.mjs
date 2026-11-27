import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { BLOCKED_CODES, agentActionable, buildBlockedReport } from '../src/lib/blocked-states.mjs';
import {
  HUMAN_DECISION_EVENTS,
  POLICY_SET,
  SCOPE_STATEMENT,
  buildAutonomyReport,
  classifyStop,
  renderAutonomyText,
} from '../src/lib/autonomy.mjs';
import { AUTHORITY, EVENT_GATES, eventGateIds } from '../src/lib/authority.mjs';
import { BUILTIN_RUN_BUDGETS, createRunSession, writeRunSession } from '../src/lib/run-session.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { commitAll, nodeCheck, writeJson } from './factory-project.mjs';

function stop(overrides = {}) {
  return {
    type: 'blocked.recorded',
    time: '2026-11-01T10:00:00.000Z',
    change: 'demo',
    task: '1.1',
    invariant: 'approval-missing',
    actor: 'human',
    retry: 'only-after-change',
    agentActionable: false,
    ...overrides,
  };
}

function resolved(overrides = {}) {
  return {
    type: 'blocked.resolved',
    time: '2026-11-01T10:05:00.000Z',
    change: 'demo',
    task: '1.1',
    resolution: 'superseded',
    ...overrides,
  };
}

function writeEvents(dir, events) {
  const file = path.join(dir, '.factory/observability/events.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, events.map((event) => JSON.stringify(event)).join('\n') + '\n');
}

function digest(dir) {
  const rows = [];
  const walk = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      if (name === '.git') continue;
      const full = path.join(current, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else rows.push(`${path.relative(dir, full)}:${fs.readFileSync(full, 'utf8')}`);
    }
  };
  walk(dir);
  return rows.join('\n');
}

test('classification table covers every invariant code in the stated order', () => {
  for (const code of BLOCKED_CODES) {
    assert.equal(classifyStop(stop({ invariant: code, actor: 'tooling' })), 'handled', code);
    assert.equal(classifyStop(stop({ invariant: code, actor: 'independent-agent' })), 'handled', code);
    assert.equal(classifyStop(stop({ invariant: code, agentActionable: true })), 'redundant', code);
    const expected = POLICY_SET.has(code) ? 'policy-decision' : 'failure';
    assert.equal(classifyStop(stop({ invariant: code })), expected, code);
  }
  assert.equal(classifyStop(stop({ invariant: 'unclassified' })), 'failure');
  assert.equal(classifyStop(stop({ invariant: 'approval-missing', agentActionable: true })), 'redundant');
});

test('the report counts interventions by category, invariant, and item, and handled stops', async () => {
  const dir = tempProject();
  try {
    writeEvents(dir, [
      stop({ task: '1.1' }),
      stop({ task: '1.2', invariant: 'reviewer-lockout' }),
      stop({ task: '1.3', invariant: 'needs-review', actor: 'independent-agent' }),
    ]);
    const report = buildAutonomyReport(dir);
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.counts.interventions, 2);
    assert.equal(report.counts.handled, 1);
    assert.deepEqual(report.counts.byCategory, { 'policy-decision': 1, failure: 1, redundant: 0 });
    assert.deepEqual(report.counts.byInvariant, { 'approval-missing': 1, 'reviewer-lockout': 1 });
    assert.deepEqual(report.counts.byItem, { 'demo/1.1': 1, 'demo/1.2': 1 });
    assert.equal(report.routineClean, false);
    assert.equal(report.scope, SCOPE_STATEMENT);
    assert.deepEqual(Object.keys(report.interventions[0]).sort(), ['category', 'change', 'invariant', 'task', 'time']);
  } finally {
    cleanup(dir);
  }
});

test('a failure or a redundant prompt makes routineClean false', async () => {
  const dir = tempProject();
  try {
    writeEvents(dir, [stop({ invariant: 'unclassified' })]);
    assert.equal(buildAutonomyReport(dir).routineClean, false);
    writeEvents(dir, [stop({ agentActionable: true })]);
    assert.equal(buildAutonomyReport(dir).routineClean, false);
    writeEvents(dir, [stop()]);
    assert.equal(buildAutonomyReport(dir).routineClean, true);
  } finally {
    cleanup(dir);
  }
});

test('an autonomous recovery needs a resolution with no human decision between', async () => {
  const dir = tempProject();
  try {
    const infra = stop({ invariant: 'infrastructure-failure', actor: 'tooling', retry: 'safe' });
    writeEvents(dir, [infra, resolved()]);
    let report = buildAutonomyReport(dir);
    assert.equal(report.counts.autonomousRecoveries, 1);
    assert.equal(report.counts.interventions, 0);
    assert.equal(report.autonomousRecoveries[0].invariant, 'infrastructure-failure');

    writeEvents(dir, [infra, { type: 'approval.issued', time: '2026-11-01T10:02:00.000Z', change: 'demo', task: '1.1' }, resolved()]);
    assert.equal(buildAutonomyReport(dir).counts.autonomousRecoveries, 0);

    writeEvents(dir, [infra]);
    report = buildAutonomyReport(dir);
    assert.equal(report.counts.autonomousRecoveries, 0);
    assert.equal(report.counts.handled, 1);
  } finally {
    cleanup(dir);
  }
});

test('events without an actor are skipped and counted', async () => {
  const dir = tempProject();
  try {
    const old = stop();
    delete old.actor;
    writeEvents(dir, [old, stop({ task: '1.2' })]);
    const report = buildAutonomyReport(dir);
    assert.equal(report.unclassifiedEvents, 1);
    assert.equal(report.counts.interventions, 1);
  } finally {
    cleanup(dir);
  }
});

test('autonomy report prints text and JSON, writes nothing, and states its scope', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeEvents(dir, [stop(), stop({ task: '1.2', invariant: 'needs-review', actor: 'independent-agent' })]);
    const before = digest(dir);
    const text = await idefactory(dir, ['autonomy', 'report']);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /Interventions: 1/);
    assert.match(text.out, /Handled without a human: 1/);
    assert.match(text.out, /routineClean: true/);
    assert.ok(text.out.includes(SCOPE_STATEMENT));
    const json = await idefactory(dir, ['autonomy', 'report', '--json']);
    const doc = JSON.parse(json.out);
    assert.equal(doc.counts.interventions, 1);
    assert.equal(doc.scope, SCOPE_STATEMENT);
    assert.equal(digest(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('--change and --since limit the report and bad values are refused', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeEvents(dir, [
      stop({ time: '2026-10-01T00:00:00.000Z' }),
      stop({ time: '2026-11-02T00:00:00.000Z', task: '1.2' }),
      stop({ time: '2026-11-03T00:00:00.000Z', change: 'other' }),
    ]);
    const since = await idefactory(dir, ['autonomy', 'report', '--since', '2026-11-01T00:00:00Z', '--json']);
    assert.equal(JSON.parse(since.out).counts.interventions, 2);
    const change = await idefactory(dir, ['autonomy', 'report', '--change', 'demo', '--json']);
    assert.equal(JSON.parse(change.out).counts.interventions, 2);
    const both = await idefactory(dir, ['autonomy', 'report', '--change', 'demo', '--since', '2026-11-01T00:00:00Z', '--json']);
    assert.equal(JSON.parse(both.out).counts.interventions, 1);

    const bad = await idefactory(dir, ['autonomy', 'report', '--since', 'yesterday']);
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /--since must be an ISO 8601 time/);
    const badChange = await idefactory(dir, ['autonomy', 'report', '--change', 'Bad Name']);
    assert.notEqual(badChange.code, 0);
    const unknown = await idefactory(dir, ['autonomy', 'summary']);
    assert.notEqual(unknown.code, 0);
  } finally {
    cleanup(dir);
  }
});

test('a missing or empty log reports zero with a reason', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.rmSync(path.join(dir, '.factory/observability'), { recursive: true, force: true });
    const missing = JSON.parse((await idefactory(dir, ['autonomy', 'report', '--json'])).out);
    assert.equal(missing.counts.interventions, 0);
    assert.equal(missing.noEvents, true);
    assert.match(missing.reason, /no events were recorded/);
    writeEvents(dir, []);
    fs.writeFileSync(path.join(dir, '.factory/observability/events.jsonl'), '');
    const empty = JSON.parse((await idefactory(dir, ['autonomy', 'report', '--json'])).out);
    assert.equal(empty.noEvents, true);
    const text = await idefactory(dir, ['autonomy', 'report']);
    assert.match(text.out, /Interventions: 0 \(no events were recorded\)/);
  } finally {
    cleanup(dir);
  }
});

test('secret-like notes and check output never reach the events or the report', async () => {
  const dir = tempProject();
  const secret = 'sk-live-ABCDEF0123456789SECRET';
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const profilesFile = path.join(dir, '.factory/profiles.json');
    fs.writeFileSync(profilesFile, JSON.stringify({
      ...JSON.parse(fs.readFileSync(profilesFile, 'utf8')),
      gated: { checks: ['unit'], humanGate: true },
    }, null, 2));
    writeJson(dir, '.factory/checks.json', {
      schemaVersion: 1,
      checks: { unit: nodeCheck(`console.log('${secret}'); process.exit(1)`) },
    });
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), [
      '- [ ] 1.1 Item',
      '  factory:',
      '    kind: general',
      '    dependencies: []',
      '    checks: [unit]',
      '    verificationProfile: gated',
      '    roles: [engineer, reviewer, scribe]',
      '',
    ].join('\n'));
    assert.equal((await idefactory(dir, ['sync-tasks', 'demo'], {}, { rawRegistry: true })).code, 0);
    commitAll(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err + started.out);
    const { id } = JSON.parse(started.out);
    await idefactory(dir, ['attempt', 'transition', id, 'implementing', '--evidence', '{"implementerId":"engineer-1"}']);
    await idefactory(dir, ['verify', 'run', id, '--check', 'unit', '--red']);
    const approved = await idefactory(dir, [
      'approve', 'g1', '--note', `token ${secret}`, '--change', 'demo', '--task', '1.1', '--action', 'accept',
      '--approver', 'human-1', '--expiry', new Date(Date.now() + 3_600_000).toISOString(),
    ]);
    assert.equal(approved.code, 0, approved.err);
    await idefactory(dir, ['run', '--change', 'demo', '--json']);
    const events = fs.readFileSync(path.join(dir, '.factory/observability/events.jsonl'), 'utf8');
    assert.ok(events.length > 0);
    assert.ok(!events.includes(secret));
    const report = (await idefactory(dir, ['autonomy', 'report', '--json'])).out;
    assert.ok(!report.includes(secret));
    assert.ok(!(await idefactory(dir, ['autonomy', 'report'])).out.includes(secret));
  } finally {
    cleanup(dir);
  }
});

test('a stop whose first usable option is independent or agent is handled, and a spend stop stays a human stop', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const review = buildBlockedReport(dir, {
      code: 'needs-review',
      attempt: { id: 'a1', change: 'demo', taskId: '1.1', state: 'awaiting-review' },
    });
    assert.equal(review.actor, 'independent-agent');
    const reviewEvent = stop({ invariant: 'needs-review', actor: review.actor, agentActionable: agentActionable(review) });
    assert.equal(classifyStop(reviewEvent), 'handled');

    const budget = buildBlockedReport(dir, { code: 'budget-exhausted', change: 'demo', stopReason: 'max-tasks' });
    assert.equal(budget.actor, 'implementing-agent');
    const budgetEvent = stop({ invariant: 'budget-exhausted', actor: budget.actor, agentActionable: agentActionable(budget) });
    assert.equal(classifyStop(budgetEvent), 'handled');

    const spend = buildBlockedReport(dir, { code: 'budget-exhausted', change: 'demo', stopReason: 'max-cost' });
    assert.equal(spend.actor, 'human');
    assert.notEqual(classifyStop(stop({ invariant: 'budget-exhausted', actor: spend.actor })), 'handled');
  } finally {
    cleanup(dir);
  }
});

function closedSession(dir, { change = 'demo', stopReason, startedAt, closedAt }) {
  const open = createRunSession(dir, { change, budgets: BUILTIN_RUN_BUDGETS, now: new Date(startedAt) });
  return writeRunSession(dir, { ...open, status: 'closed', stopReason, lastObservedAt: closedAt });
}

test('human-level decisions count as policy-decision interventions and other levels are listed', () => {
  const dir = tempProject();
  try {
    writeEvents(dir, [
      { type: 'approval.issued', time: '2026-11-01T10:00:00.000Z', change: 'demo', task: '1.1' },
      { type: 'halt.resumed', time: '2026-11-01T10:01:00.000Z' },
      { type: 'lockout.resolved', time: '2026-11-01T10:02:00.000Z', change: 'demo', task: '1.2' },
      { type: 'red-exception.recorded', time: '2026-11-01T10:03:00.000Z', change: 'demo', task: '1.3', exceptionType: 'waiver' },
    ]);
    const report = buildAutonomyReport(dir);
    assert.deepEqual(report.interventions.map((row) => [row.event, row.category]), [
      ['approval.issued', 'policy-decision'],
      ['halt.resumed', 'policy-decision'],
    ]);
    assert.equal(report.counts.interventions, 2);
    assert.deepEqual(report.decisions.map((row) => [row.event, row.level, row.gate]), [
      ['lockout.resolved', 'independent', 'resolve-lockout'],
      ['red-exception.recorded', 'independent', 'waive-red'],
    ]);
    assert.equal(report.counts.decisions, 2);
    assert.equal(report.routineClean, true);
  } finally {
    cleanup(dir);
  }
});

test('the event gates and the human decision set agree', () => {
  for (const [type] of Object.entries(EVENT_GATES)) {
    const ids = eventGateIds(type);
    for (const id of ids) assert.ok(Object.hasOwn(AUTHORITY, id), `${type} names ${id}`);
    const expectedHuman = ids.some((id) => AUTHORITY[id].level !== 'agent');
    assert.equal(HUMAN_DECISION_EVENTS.has(type), expectedHuman, type);
  }
  assert.equal(HUMAN_DECISION_EVENTS.has('run.new-run'), false);
  assert.equal(HUMAN_DECISION_EVENTS.has('lockout.resolved'), true);
});

test('a stop from the level of its option decides its category, and a lockout is not a policy decision', () => {
  assert.equal(classifyStop(stop({ actor: 'human', level: 'independent' })), 'handled');
  assert.equal(classifyStop(stop({ actor: 'independent-agent', level: 'human' })), 'policy-decision');
  assert.equal(classifyStop(stop({ invariant: 'reviewer-lockout' })), 'failure');
  assert.equal(POLICY_SET.has('reviewer-lockout'), false);
  assert.equal(POLICY_SET.has('new-run-cap'), true);
});

test('unrecorded stops list closed sessions without a matching stop event', () => {
  const dir = tempProject();
  try {
    const t0 = '2026-11-01T10:00:00.000Z';
    closedSession(dir, { stopReason: 'vacuous-red', startedAt: t0, closedAt: '2026-11-01T10:01:00.000Z' });
    writeEvents(dir, [stop({ invariant: 'vacuous-red', time: '2026-11-01T10:00:30.000Z' })]);
    let report = buildAutonomyReport(dir);
    assert.deepEqual(report.unrecordedStops, []);
    assert.equal(report.measurementComplete, true);

    closedSession(dir, { stopReason: 'retry-cap', startedAt: '2026-11-02T10:00:00.000Z', closedAt: '2026-11-02T10:05:00.000Z' });
    closedSession(dir, { stopReason: 'max-tasks', startedAt: '2026-11-03T10:00:00.000Z', closedAt: '2026-11-03T10:05:00.000Z' });
    closedSession(dir, { stopReason: 'all-done', startedAt: '2026-11-04T10:00:00.000Z', closedAt: '2026-11-04T10:05:00.000Z' });
    writeEvents(dir, [stop({ invariant: 'vacuous-red', time: '2026-11-01T10:00:30.000Z' }), stop({ invariant: 'vacuous-red', time: '2026-11-03T10:01:00.000Z' })]);
    report = buildAutonomyReport(dir);
    assert.deepEqual(report.unrecordedStops.map((row) => [row.change, row.stopReason, row.code]).sort(), [
      ['demo', 'max-tasks', 'budget-exhausted'],
      ['demo', 'retry-cap', 'retry-cap'],
    ]);
    assert.equal(report.measurementComplete, false);
    assert.equal(report.routineClean, false);
    assert.equal(Object.hasOwn(report.unrecordedStops[0], 'text'), false);
  } finally {
    cleanup(dir);
  }
});

test('an unreadable session is listed as unreadable and the report still prints', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.mkdirSync(path.join(dir, '.factory/orchestration/runs'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.factory/orchestration/runs/corrupt.json'), '{ not json');
    const report = buildAutonomyReport(dir);
    assert.deepEqual(report.unreadableSessions, [{ file: 'corrupt.json', unreadable: true }]);
    assert.equal(report.measurementComplete, false);
    const text = await idefactory(dir, ['autonomy', 'report']);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /Unreadable run sessions: corrupt\.json/);
  } finally {
    cleanup(dir);
  }
});

test('events with no stops keep their count, and a blind report is not clean', () => {
  const dir = tempProject();
  try {
    writeEvents(dir, Array.from({ length: 486 }, (_, i) => ({ type: 'work.completed', time: `2026-11-01T10:00:${String(i % 60).padStart(2, '0')}.000Z`, change: 'demo', task: `1.${i}` })));
    closedSession(dir, { stopReason: 'vacuous-red', startedAt: '2026-11-01T09:00:00.000Z', closedAt: '2026-11-01T09:30:00.000Z' });
    const report = buildAutonomyReport(dir);
    assert.equal(report.eventsRead, 486);
    assert.equal(report.noStopEvents, true);
    assert.equal(report.noEvents, true);
    assert.equal(report.measurementComplete, false);
    assert.equal(report.routineClean, false);
    const text = renderAutonomyText(report);
    assert.match(text, /486 events were read and none were stops\./);
    assert.match(text, /Unrecorded stops: 1/);
    assert.match(text, /measurementComplete: false/);
  } finally {
    cleanup(dir);
  }
});

test('an empty project reports both measures as true', () => {
  const dir = tempProject();
  try {
    const report = buildAutonomyReport(dir);
    assert.equal(report.measurementComplete, true);
    assert.equal(report.routineClean, true);
    assert.equal(report.noStopEvents, true);
    assert.equal(report.schemaVersion, 2);
  } finally {
    cleanup(dir);
  }
});
