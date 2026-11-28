import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { BUILTIN_RUN_BUDGETS, createRunSession } from '../src/lib/run-session.mjs';
import { readControlEvents } from '../src/lib/event-log.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { BASIC_TASK, commitAll, nodeCheck, seedChange } from './factory-project.mjs';

function blockedRecorded(dir) {
  return readControlEvents(dir).filter((event) => event.type === 'blocked.recorded');
}

async function seedAttemptWithPassingCheck(dir) {
  await seedChange(dir, {
    tasks: BASIC_TASK,
    checks: { unit: nodeCheck('process.exit(0)') },
  });
  commitAll(dir);
  const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
  assert.equal(started.code, 0, started.err + started.out);
  return JSON.parse(started.out).id;
}

function redRun(dir, attemptId) {
  return idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit', '--red']);
}

test('a vacuous red inside an open session is recorded once across the session and the CLI', async () => {
  const dir = tempProject();
  try {
    const attemptId = await seedAttemptWithPassingCheck(dir);
    createRunSession(dir, { change: 'demo', budgets: BUILTIN_RUN_BUDGETS });

    const red = await redRun(dir, attemptId);
    assert.notEqual(red.code, 0);
    assert.match(red.err, /^vacuous-red: red run did not record an assertion failure/);

    const recorded = blockedRecorded(dir);
    assert.equal(recorded.length, 1, JSON.stringify(recorded));
    assert.equal(recorded[0].invariant, 'vacuous-red');
    assert.equal(recorded[0].change, 'demo');
    assert.equal(recorded[0].task, '1.1');
    assert.equal(recorded[0].attemptId, attemptId);
  } finally {
    cleanup(dir);
  }
});

test('repeated vacuous reds record one vacuous-red stop and then one retry-cap stop', async () => {
  const dir = tempProject();
  try {
    const attemptId = await seedAttemptWithPassingCheck(dir);
    createRunSession(dir, { change: 'demo', budgets: BUILTIN_RUN_BUDGETS });
    const prefixes = [];
    for (let i = 0; i < 4; i += 1) {
      const red = await redRun(dir, attemptId);
      assert.notEqual(red.code, 0);
      prefixes.push(red.err.split(':')[0]);
    }
    assert.deepEqual(prefixes, ['vacuous-red', 'vacuous-red', 'vacuous-red', 'retry-cap']);
    assert.deepEqual(blockedRecorded(dir).map((event) => event.invariant), ['vacuous-red', 'retry-cap']);
  } finally {
    cleanup(dir);
  }
});

test('a HALT stop with no change is still recorded in the control log', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.writeFileSync(path.join(dir, 'HALT'), 'stop\n');
    const halted = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.notEqual(halted.code, 0);
    const recorded = blockedRecorded(dir);
    assert.equal(recorded.length, 1, JSON.stringify(recorded));
    assert.equal(recorded[0].invariant, 'halted');
    assert.equal(recorded[0].change, undefined);
  } finally {
    cleanup(dir);
  }
});
