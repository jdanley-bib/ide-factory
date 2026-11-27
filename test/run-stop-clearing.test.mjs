import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { getAttempt } from '../src/lib/attempt.mjs';
import { eventLogPath } from '../src/lib/event-log.mjs';
import { evaluateConditionStop } from '../src/lib/run-stop.mjs';
import {
  BUILTIN_RUN_BUDGETS,
  closeLatestRunSession,
  createRunSession,
  latestRunSession,
  readRunSession,
  resolveMaxNewRuns,
} from '../src/lib/run-session.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { BASIC_TASK, commitAll, readJson, seedChange, writeJson } from './factory-project.mjs';

function runsDir(dir) {
  return path.join(dir, '.factory', 'orchestration', 'runs');
}

function sessionFiles(dir) {
  return fs.readdirSync(runsDir(dir)).filter((name) => name.endsWith('.json'));
}

function events(dir) {
  const file = eventLogPath(dir);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function tasksBody(count) {
  return Array.from({ length: count }, (_, i) => [
    `- [ ] 1.${i + 1} Add parser ${i + 1}`,
    '  factory:',
    '    kind: general',
    '    checks: [unit]',
    '    verificationProfile: frontend-low',
    '    roles: [engineer, reviewer, scribe]',
  ].join('\n')).join('\n');
}

test('a closed host-usage-unavailable stop reopens the same session once the metric is exposed', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    const first = await idefactory(dir, ['run', '--change', 'demo', '--max-cost', '5']);
    assert.equal(first.code, 1, first.err + first.out);
    const closed = readRunSession(path.join(runsDir(dir), sessionFiles(dir)[0]));
    assert.equal(closed.stopReason, 'host-usage-unavailable');

    const resumed = await idefactory(dir, ['run', '--change', 'demo', '--max-cost', '5', '--host-cost', '1']);
    assert.equal(resumed.code, 2, resumed.err + resumed.out);
    const reopened = readRunSession(path.join(runsDir(dir), sessionFiles(dir)[0]));
    assert.equal(reopened.runId, closed.runId);
    assert.equal(reopened.status, 'open');
    assert.equal(reopened.agentSteps, closed.agentSteps + 1);
    assert.deepEqual(
      reopened.clearedStops.map((entry) => [entry.stopReason, entry.resolution]),
      [['host-usage-unavailable', 'metric-exposed']],
    );
    const cleared = events(dir).filter((event) => event.type === 'run.stop-cleared');
    assert.equal(cleared.length, 1);
    assert.equal(cleared[0].runId, closed.runId);
    assert.equal(cleared[0].resolution, 'metric-exposed');
    assert.equal(cleared[0].text, undefined);
  } finally {
    cleanup(dir);
  }
});

test('a host-usage-unavailable stop holds while the metric is still missing', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    assert.equal((await idefactory(dir, ['run', '--change', 'demo', '--max-cost', '5'])).code, 1);
    const again = await idefactory(dir, ['run', '--change', 'demo', '--max-cost', '5']);
    assert.match(again.out, /host-usage-unavailable/);
    assert.equal(readRunSession(path.join(runsDir(dir), sessionFiles(dir)[0])).status, 'closed');
    assert.equal(events(dir).some((event) => event.type === 'run.stop-cleared'), false);
  } finally {
    cleanup(dir);
  }
});

test('an invalid budget closes the open session and clears when the config is fixed', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    const started = await idefactory(dir, ['run', '--change', 'demo']);
    assert.equal(started.code, 2, started.err + started.out);
    const before = readRunSession(path.join(runsDir(dir), sessionFiles(dir)[0]));

    const invalid = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '0']);
    assert.equal(invalid.code, 1);
    assert.match(invalid.out, /invalid-budget/);
    const stored = readRunSession(path.join(runsDir(dir), sessionFiles(dir)[0]));
    assert.equal(stored.stopReason, 'invalid-budget');
    assert.equal(stored.agentSteps, before.agentSteps);

    const fixed = await idefactory(dir, ['run', '--change', 'demo']);
    const after = readRunSession(path.join(runsDir(dir), sessionFiles(dir)[0]));
    assert.equal(after.runId, before.runId);
    assert.deepEqual(after.clearedStops.map((entry) => [entry.stopReason, entry.resolution]), [['invalid-budget', 'config-fixed']]);
    assert.match(fixed.out, /unchanged-state/, 'the same request as before the stop closes the reopened session again');
  } finally {
    cleanup(dir);
  }
});

test('a budget stop stays closed without --new-run and the file is not reset', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    assert.equal((await idefactory(dir, ['run', '--change', 'demo'])).code, 2);
    closeLatestRunSession(dir, 'demo', 'max-agent-steps');
    const before = fs.readFileSync(path.join(runsDir(dir), sessionFiles(dir)[0]), 'utf8');
    const again = await idefactory(dir, ['run', '--change', 'demo']);
    assert.match(again.out, /max-agent-steps/);
    assert.equal(fs.readFileSync(path.join(runsDir(dir), sessionFiles(dir)[0]), 'utf8'), before);
  } finally {
    cleanup(dir);
  }
});

test('--new-run after a budget stop opens a session and records run.new-run with the previous stop', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    assert.equal((await idefactory(dir, ['run', '--change', 'demo'])).code, 2);
    const previous = closeLatestRunSession(dir, 'demo', 'max-agent-steps');
    const fresh = await idefactory(dir, ['run', '--change', 'demo', '--new-run']);
    assert.equal(fresh.code, 2, fresh.err + fresh.out);
    assert.equal(sessionFiles(dir).length, 2);
    const created = latestRunSession(dir, 'demo');
    assert.notEqual(created.runId, previous.runId);
    assert.equal(created.agentSteps, 1);
    const newRunEvents = events(dir).filter((event) => event.type === 'run.new-run');
    assert.deepEqual(newRunEvents.map((event) => [event.runId, event.stopReason]), [[created.runId, 'max-agent-steps']]);
  } finally {
    cleanup(dir);
  }
});

test('a fourth new session is refused with new-run-cap and creates no file', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    for (let i = 0; i < 4; i += 1) {
      createRunSession(dir, { change: 'demo', budgets: BUILTIN_RUN_BUDGETS });
    }
    assert.equal(sessionFiles(dir).length, 4);
    const refused = await idefactory(dir, ['run', '--change', 'demo', '--new-run']);
    assert.equal(refused.code, 1, refused.err + refused.out);
    assert.match(refused.out, /new-run-cap/);
    assert.equal(sessionFiles(dir).length, 4);
  } finally {
    cleanup(dir);
  }
});

test('run.maxNewRuns raises the cap so a fifth session is allowed', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    const config = readJson(dir, '.factory/config.json');
    writeJson(dir, '.factory/config.json', { ...config, run: { ...config.run, maxNewRuns: 5 } });
    for (let i = 0; i < 4; i += 1) {
      createRunSession(dir, { change: 'demo', budgets: BUILTIN_RUN_BUDGETS });
    }
    const allowed = await idefactory(dir, ['run', '--change', 'demo', '--new-run']);
    assert.equal(allowed.code, 2, allowed.err + allowed.out);
    assert.equal(sessionFiles(dir).length, 5);
  } finally {
    cleanup(dir);
  }
});

test('--new-run is refused after a spend ceiling and names a human', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    assert.equal((await idefactory(dir, ['run', '--change', 'demo'])).code, 2);
    closeLatestRunSession(dir, 'demo', 'max-cost');
    const refused = await idefactory(dir, ['run', '--change', 'demo', '--new-run', '--json']);
    assert.equal(refused.code, 1, refused.err + refused.out);
    const report = JSON.parse(refused.out);
    assert.equal(report.stopReason, 'max-cost');
    assert.equal(report.blocked.actor, 'human');
    assert.equal(sessionFiles(dir).length, 1);
  } finally {
    cleanup(dir);
  }
});

test('the new-run cap defaults to 3 and rejects out-of-range config', () => {
  assert.equal(resolveMaxNewRuns({}), 3);
  assert.equal(resolveMaxNewRuns({ run: { maxNewRuns: 0 } }), 3);
  assert.equal(resolveMaxNewRuns({ run: { maxNewRuns: 21 } }), 3);
  assert.equal(resolveMaxNewRuns({ run: { maxNewRuns: 7 } }), 7);
});

test('a low agent-step budget prints one advisory for a new session and none at 120', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: tasksBody(10) });
    const low = await idefactory(dir, ['run', '--change', 'demo', '--max-agent-steps', '20']);
    assert.match(low.out, /^advisory: agent-step budget 20 is low for 10 pending tasks \(suggest at least 40\)$/m);
    const resumed = await idefactory(dir, ['run', '--change', 'demo', '--max-agent-steps', '20']);
    assert.doesNotMatch(resumed.out, /advisory:/);
  } finally {
    cleanup(dir);
  }
  const roomy = tempProject();
  try {
    await seedChange(roomy, { tasks: tasksBody(10) });
    const ok = await idefactory(roomy, ['run', '--change', 'demo', '--max-agent-steps', '120']);
    assert.doesNotMatch(ok.out, /advisory:/);
  } finally {
    cleanup(roomy);
  }
});

test('a new project defaults to 120 agent steps and leaves other budgets alone', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const config = readJson(dir, '.factory/config.json');
    assert.equal(config.run.defaultMaxAgentSteps, 120);
    assert.equal(config.run.defaultMaxTasks, 20);
  } finally {
    cleanup(dir);
  }
});

test('vacuous-red names the unresolved kinds until every kind is resolved', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const attempt = JSON.parse(started.out);
    const session = {
      schemaVersion: 1,
      runId: 'run-x',
      change: 'demo',
      status: 'closed',
      startedAt: new Date().toISOString(),
      stopReason: 'vacuous-red',
      stopContext: { attemptId: attempt.id, kinds: ['integration', 'unit'] },
    };
    assert.deepEqual(evaluateConditionStop(dir, session), { holds: true, unresolved: ['integration', 'unit'] });

    const legacy = { ...session, stopContext: undefined };
    assert.deepEqual(evaluateConditionStop(dir, legacy), { holds: true, unresolved: [] });
    assert.equal(getAttempt(dir, attempt.id).state, 'assigned');
  } finally {
    cleanup(dir);
  }
});

test('a vacuous-red stop clears to the same session once a method covers the kind', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const attempt = JSON.parse(started.out);
    assert.equal((await idefactory(dir, ['run', '--change', 'demo'])).code, 2);
    closeLatestRunSession(dir, 'demo', 'vacuous-red', { stopContext: { attemptId: attempt.id, kinds: ['unit'] } });
    const runFile = path.join(runsDir(dir), sessionFiles(dir)[0]);
    const runId = readRunSession(runFile).runId;

    const stillStopped = await idefactory(dir, ['run', '--change', 'demo']);
    assert.match(stillStopped.out, /vacuous-red/);
    assert.match(stillStopped.out, /Unresolved red kinds: unit/);

    commitAll(dir, 'checkpoint');
    const proposed = await idefactory(dir, [
      'method', 'propose', attempt.id, '--choice', 'no-red', '--reason', 'configuration',
      '--rationale', 'only a config value changes', '--implementer', 'engineer-1', '--kind', 'unit',
    ]);
    assert.equal(proposed.code, 0, proposed.err + proposed.out);
    for (const [state, extra] of [['implementing', ['--evidence', '{"implementerId":"engineer-1"}']], ['verifying', []]]) {
      const moved = await idefactory(dir, ['attempt', 'transition', attempt.id, state, ...extra]);
      assert.equal(moved.code, 0, moved.err + moved.out);
    }
    const reviewed = await idefactory(dir, [
      'method', 'review', attempt.id, '--verdict', 'ACCEPT', '--reviewer', 'reviewer-1', '--note', 'checked the diff',
    ]);
    assert.equal(reviewed.code, 0, reviewed.err + reviewed.out);

    const resumed = await idefactory(dir, ['run', '--change', 'demo']);
    assert.equal(resumed.code, 2, resumed.err + resumed.out);
    const session = readRunSession(runFile);
    assert.equal(session.runId, runId);
    assert.deepEqual(session.clearedStops.map((entry) => [entry.stopReason, entry.resolution]), [['vacuous-red', 'method']]);
  } finally {
    cleanup(dir);
  }
});

test('help run names --new-run, run.maxNewRuns, and that vacuous-red clears on its own', async () => {
  const dir = tempProject();
  try {
    const help = await idefactory(dir, ['help', 'run']);
    assert.equal(help.code, 0, help.err);
    assert.match(help.out, /run\.maxNewRuns/);
    assert.match(help.out, /vacuous-red/);
    assert.match(help.out, /--new-run/);
  } finally {
    cleanup(dir);
  }
});
