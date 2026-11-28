import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { attemptPath, getAttempt, startAttempt } from '../src/lib/attempt.mjs';
import { BlockedError } from '../src/lib/blocked-error.mjs';
import { blockedReportForError } from '../src/lib/blocked-states.mjs';
import { cliCommandKey } from '../src/lib/writer-lease.mjs';
import { getWorkItem, updateWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { nodeCheck, writeJson } from './factory-project.mjs';

const RAW = { rawRegistry: true };

function ok(result) {
  assert.equal(result.code, 0, result.err + result.out);
  return result;
}

function registry() {
  return {
    schemaVersion: 1,
    checks: {
      unit: nodeCheck('process.exit(1)'),
      integration: nodeCheck('process.exit(1)'),
    },
  };
}

async function seed(dir) {
  ok(await idefactory(dir, ['init']));
  const profilesFile = path.join(dir, '.factory/profiles.json');
  fs.writeFileSync(profilesFile, JSON.stringify({
    ...JSON.parse(fs.readFileSync(profilesFile, 'utf8')),
    two: { checks: ['unit', 'integration'], humanGate: false },
  }, null, 2));
  writeJson(dir, '.factory/checks.json', registry());
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), [
    '- [ ] 1.1 Change the parser',
    '  factory:',
    '    kind: general',
    '    dependencies: []',
    '    taskType: code',
    '    checks: [unit, integration]',
    '    verificationProfile: two',
    '    roles: [engineer, reviewer, scribe]',
    '',
  ].join('\n'));
  ok(await idefactory(dir, ['sync-tasks', 'demo'], {}, RAW));
}

/**
 * Every file under .factory, keyed by relative path, for byte-identical comparisons. The stop
 * trail is written on refusal by design, so it is left out.
 */
function snapshot(dir) {
  const files = new Map();
  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else files.set(path.relative(dir, full), fs.readFileSync(full, 'utf8'));
    }
  };
  walk(path.join(dir, '.factory'));
  for (const key of [...files.keys()]) {
    if (key.startsWith(`.factory${path.sep}observability${path.sep}`) || key.startsWith(`.factory${path.sep}blocked${path.sep}`)) files.delete(key);
  }
  return files;
}

function rewriteAttempt(dir, attemptId, patch) {
  const attempt = getAttempt(dir, attemptId);
  const next = typeof patch === 'function' ? patch(attempt) : { ...attempt, ...patch };
  fs.writeFileSync(attemptPath(dir, attemptId), JSON.stringify(next, null, 2));
  return next;
}

async function start(dir) {
  const result = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
  return result;
}

function attemptFiles(dir) {
  return fs.readdirSync(path.join(dir, '.factory/attempts')).filter((name) => name.endsWith('.json'));
}

/**
 * Two attempts for 1.1: the first rejected and replaced by the second. The first is then made
 * live and empty again, so it is a valid repair target while the second holds evidence.
 */
async function pointerMovedByMistake(dir) {
  const first = JSON.parse(ok(await start(dir)).out);
  rewriteAttempt(dir, first.id, { state: 'rejected' });
  const second = JSON.parse(ok(await start(dir)).out);
  rewriteAttempt(dir, second.id, (attempt) => ({
    ...attempt,
    implementerId: 'implementer-1',
    evidence: { ...attempt.evidence, method: { choice: 'no-red' } },
  }));
  rewriteAttempt(dir, first.id, { state: 'assigned' });
  return { first, second };
}

test('a second start returns the empty live attempt and changes nothing', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const first = JSON.parse(ok(await start(dir)).out);
    const before = snapshot(dir);
    const second = JSON.parse(ok(await start(dir)).out);
    assert.equal(second.id, first.id);
    assert.equal(second.reused, true);
    assert.equal(attemptFiles(dir).length, 1);
    assert.deepEqual(snapshot(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('a live attempt with any kind of evidence blocks a second start and writes nothing', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const first = JSON.parse(ok(await start(dir)).out);
    const evidenceCases = {
      red: { reds: { unit: { kind: 'unit' } } },
      'red diagnostic': { redFailures: [{ kind: 'unit', classification: 'infrastructure-failure' }] },
      verification: { verification: [{ kind: 'unit', exitCode: 0 }] },
      method: { method: { choice: 'no-red' } },
      exception: { redExceptions: { unit: { id: 'exc-1' } } },
      review: { review: { verdict: 'ACCEPT' } },
    };
    for (const [label, evidence] of Object.entries(evidenceCases)) {
      const original = fs.readFileSync(attemptPath(dir, first.id), 'utf8');
      rewriteAttempt(dir, first.id, (attempt) => ({ ...attempt, evidence: { ...attempt.evidence, ...evidence } }));
      const before = snapshot(dir);
      const result = await start(dir);
      assert.notEqual(result.code, 0, label);
      assert.match(result.err, /attempt-active|has recorded evidence/, label);
      assert.deepEqual(snapshot(dir), before, label);
      fs.writeFileSync(attemptPath(dir, first.id), original);
    }
  } finally {
    cleanup(dir);
  }
});

test('the attempt-active refusal names the attempt through the blocked-state report', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const first = JSON.parse(ok(await start(dir)).out);
    rewriteAttempt(dir, first.id, (attempt) => ({ ...attempt, evidence: { ...attempt.evidence, method: { choice: 'no-red' } } }));
    let error;
    try {
      startAttempt(dir, 'demo', '1.1');
    } catch (caught) {
      error = caught;
    }
    assert.ok(error instanceof BlockedError);
    assert.equal(error.invariant, 'attempt-active');
    const report = blockedReportForError(dir, error, { change: 'demo', task: '1.1' });
    assert.equal(report.invariant.code, 'attempt-active');
    assert.equal(report.attemptId, first.id);
    assert.ok(report.recovery.options.some((option) => option.id === 'continue-attempt' && option.supported));
  } finally {
    cleanup(dir);
  }
});

test('a rejected attempt is replaced and the history records why', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const first = JSON.parse(ok(await start(dir)).out);
    const firstItem = getWorkItem(dir, 'demo', '1.1');
    assert.deepEqual(firstItem.attemptHistory.map((entry) => entry.cause), ['first']);
    assert.equal(firstItem.attemptHistory[0].previousAttemptId, null);
    rewriteAttempt(dir, first.id, { state: 'rejected' });
    const second = JSON.parse(ok(await start(dir)).out);
    assert.notEqual(second.id, first.id);
    const item = getWorkItem(dir, 'demo', '1.1');
    assert.equal(item.attemptId, second.id);
    const last = item.attemptHistory.at(-1);
    assert.equal(last.cause, 'after-rejection');
    assert.equal(last.previousAttemptId, first.id);
    assert.equal(last.attemptId, second.id);
  } finally {
    cleanup(dir);
  }
});

test('attempt history survives a later work item update', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const first = JSON.parse(ok(await start(dir)).out);
    updateWorkItem(dir, 'demo', '1.1', { status: 'done' });
    const item = getWorkItem(dir, 'demo', '1.1');
    assert.equal(item.attemptHistory.length, 1);
    assert.equal(item.attemptHistory[0].attemptId, first.id);
  } finally {
    cleanup(dir);
  }
});

test('repoint preview prints the digest and writes nothing', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const { first } = await pointerMovedByMistake(dir);
    const before = snapshot(dir);
    const preview = JSON.parse(ok(await idefactory(dir, ['attempt', 'repoint', 'demo', '1.1', '--attempt', first.id])).out);
    assert.match(preview.planDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(preview.targetAttemptId, first.id);
    assert.ok(preview.current.evidence.method > 0);
    assert.deepEqual(snapshot(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('repoint apply moves only the pointer, adds a repair entry, and leaves attempt files unchanged', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const { first, second } = await pointerMovedByMistake(dir);
    const preview = JSON.parse(ok(await idefactory(dir, ['attempt', 'repoint', 'demo', '1.1', '--attempt', first.id])).out);
    const attemptBytes = new Map([first.id, second.id].map((id) => [id, fs.readFileSync(attemptPath(dir, id), 'utf8')]));
    ok(await idefactory(dir, [
      'attempt', 'repoint', 'demo', '1.1', '--attempt', first.id, '--apply',
      '--plan-digest', preview.planDigest, '--decided-by', 'reviewer-2',
      '--reason', 'picked the wrong attempt',
    ]));
    const item = getWorkItem(dir, 'demo', '1.1');
    assert.equal(item.attemptId, first.id);
    const last = item.attemptHistory.at(-1);
    assert.equal(last.cause, 'repair');
    assert.equal(last.previousAttemptId, second.id);
    for (const [id, bytes] of attemptBytes) assert.equal(fs.readFileSync(attemptPath(dir, id), 'utf8'), bytes);
    const repairs = fs.readdirSync(path.join(dir, '.factory/work/repairs'));
    assert.equal(repairs.length, 1);
    const record = JSON.parse(fs.readFileSync(path.join(dir, '.factory/work/repairs', repairs[0]), 'utf8'));
    assert.equal(record.reason, 'picked the wrong attempt');
    assert.equal(record.decidedBy, 'reviewer-2');
    const events = fs.readFileSync(path.join(dir, '.factory/observability/events.jsonl'), 'utf8');
    const repointed = events.split('\n').filter((line) => line.includes('attempt.repointed'));
    assert.equal(repointed.length, 1);
    assert.ok(repointed[0].includes(second.id) && repointed[0].includes(first.id));
    assert.ok(!events.includes('picked the wrong attempt'));
  } finally {
    cleanup(dir);
  }
});

test('repoint apply refuses a stale digest, missing decision fields, and writes nothing', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const { first } = await pointerMovedByMistake(dir);
    const before = snapshot(dir);
    const stale = await idefactory(dir, [
      'attempt', 'repoint', 'demo', '1.1', '--attempt', first.id, '--apply',
      '--plan-digest', 'sha256:' + '0'.repeat(64), '--decided-by', 'reviewer-2', '--reason', 'x',
    ]);
    assert.notEqual(stale.code, 0);
    assert.match(stale.err, /digest does not match/);
    assert.deepEqual(snapshot(dir), before);
    const preview = JSON.parse(ok(await idefactory(dir, ['attempt', 'repoint', 'demo', '1.1', '--attempt', first.id])).out);
    for (const missing of ['--reason', '--decided-by', '--plan-digest']) {
      const args = ['attempt', 'repoint', 'demo', '1.1', '--attempt', first.id, '--apply', '--plan-digest', preview.planDigest, '--decided-by', 'reviewer-2', '--reason', 'x'];
      const index = args.indexOf(missing);
      args.splice(index, 2);
      const result = await idefactory(dir, args);
      assert.notEqual(result.code, 0, missing);
      assert.deepEqual(snapshot(dir), before, missing);
    }
  } finally {
    cleanup(dir);
  }
});

test('repoint over an attempt with evidence refuses the implementer as decider', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const { first, second } = await pointerMovedByMistake(dir);
    const preview = JSON.parse(ok(await idefactory(dir, ['attempt', 'repoint', 'demo', '1.1', '--attempt', first.id])).out);
    const before = snapshot(dir);
    const result = await idefactory(dir, [
      'attempt', 'repoint', 'demo', '1.1', '--attempt', first.id, '--apply',
      '--plan-digest', preview.planDigest, '--decided-by', 'implementer-1', '--reason', 'x',
    ]);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /identity other than its implementer/);
    assert.deepEqual(snapshot(dir), before);
    assert.equal(getWorkItem(dir, 'demo', '1.1').attemptId, second.id);
  } finally {
    cleanup(dir);
  }
});

test('repoint refuses a target that is current, rejected, or missing', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const { first, second } = await pointerMovedByMistake(dir);
    rewriteAttempt(dir, first.id, { state: 'rejected' });
    const before = snapshot(dir);
    const current = await idefactory(dir, ['attempt', 'repoint', 'demo', '1.1', '--attempt', second.id]);
    assert.notEqual(current.code, 0);
    assert.match(current.err, /already the current attempt/);
    const rejected = await idefactory(dir, ['attempt', 'repoint', 'demo', '1.1', '--attempt', first.id]);
    assert.notEqual(rejected.code, 0);
    assert.match(rejected.err, /is rejected/);
    const missing = await idefactory(dir, ['attempt', 'repoint', 'demo', '1.1', '--attempt', '00000000-0000-4000-8000-000000000009']);
    assert.notEqual(missing.code, 0);
    assert.match(missing.err, /Attempt not found/);
    assert.deepEqual(snapshot(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('repoint is refused while HALT is set', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const { first } = await pointerMovedByMistake(dir);
    const preview = JSON.parse(ok(await idefactory(dir, ['attempt', 'repoint', 'demo', '1.1', '--attempt', first.id])).out);
    fs.writeFileSync(path.join(dir, 'HALT'), '');
    const before = snapshot(dir);
    const result = await idefactory(dir, [
      'attempt', 'repoint', 'demo', '1.1', '--attempt', first.id, '--apply',
      '--plan-digest', preview.planDigest, '--decided-by', 'reviewer-2', '--reason', 'x',
    ]);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /HALT/);
    assert.deepEqual(snapshot(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('repoint is a mutating command under the writer lease', () => {
  assert.equal(cliCommandKey('attempt', ['repoint', 'demo', '1.1']), 'attempt repoint');
});

test('an attempt file the work item does not reference is reported without stopping status or run', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const { first, second } = await pointerMovedByMistake(dir);
    const orphanId = '11111111-1111-4111-8111-111111111111';
    const orphan = { ...getAttempt(dir, first.id), id: orphanId, state: 'assigned', evidence: { ...getAttempt(dir, first.id).evidence, reds: {}, method: null } };
    fs.writeFileSync(attemptPath(dir, orphanId), JSON.stringify(orphan, null, 2));
    const status = ok(await idefactory(dir, ['status']));
    assert.match(status.out, /Orphan attempts:/);
    assert.ok(status.out.includes(orphanId));
    const run = await idefactory(dir, ['run', '--change', 'demo']);
    assert.match(run.out, /Orphan attempts:/);
    assert.ok(run.out.includes(orphanId));

    const preview = JSON.parse(ok(await idefactory(dir, ['attempt', 'repoint', 'demo', '1.1', '--attempt', orphanId])).out);
    ok(await idefactory(dir, [
      'attempt', 'repoint', 'demo', '1.1', '--attempt', orphanId, '--apply',
      '--plan-digest', preview.planDigest, '--decided-by', 'reviewer-2', '--reason', 'adopt the orphan',
    ]));
    const after = ok(await idefactory(dir, ['status']));
    assert.ok(!after.out.includes('Orphan attempts:'));
    assert.equal(getWorkItem(dir, 'demo', '1.1').attemptId, orphanId);
    assert.ok(getWorkItem(dir, 'demo', '1.1').attemptHistory.some((entry) => entry.attemptId === second.id));
  } finally {
    cleanup(dir);
  }
});

test('repoint help names the flags and the no-evidence-edit rule', async () => {
  const dir = tempProject();
  try {
    const help = ok(await idefactory(dir, ['help', 'attempt', 'repoint']));
    assert.match(help.out, /--plan-digest/);
    assert.match(help.out, /--decided-by/);
    assert.match(help.out, /No attempt file/);
  } finally {
    cleanup(dir);
  }
});
