import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { attemptPath, getAttempt } from '../src/lib/attempt.mjs';
import { syncTasks } from '../src/lib/queue.mjs';
import { applyReconciliation, buildReconciliationPlan } from '../src/lib/reconcile.mjs';
import { getWorkItem, isHeld, isReady, listWorkItems, selectReady, upsertWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

function block({ id, title, deps = [], type = 'code', checks = ['unit'], done = false }) {
  return [
    `- [${done ? 'x' : ' '}] ${id} ${title}`,
    '  factory:',
    '    kind: general',
    `    dependencies: [${deps.join(', ')}]`,
    `    taskType: ${type}`,
    `    checks: [${checks.join(', ')}]`,
    '    verificationProfile: cli',
    '    roles: [engineer, reviewer, scribe]',
    '',
  ].join('\n');
}

const BASE = [
  { id: '1.1', title: 'Build the parser' },
  { id: '1.2', title: 'Wire the parser into the CLI', deps: ['1.1'] },
  { id: '1.3', title: 'Document the parser' },
];

function writeTasks(dir, rows, change = 'demo') {
  const file = path.join(dir, 'openspec/changes', change, 'tasks.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map(block).join('\n'));
}

async function seed(dir, rows = BASE, { policyVersion = 1 } = {}) {
  ok(await idefactory(dir, ['init']));
  const configFile = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.governance.policyVersion = policyVersion;
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  writeTasks(dir, rows);
  ok(await idefactory(dir, ['sync-tasks', 'demo']));
}

function ok(result) {
  assert.equal(result.code, 0, result.err + result.out);
  return result;
}

function tree(dir, rel = '.factory/work') {
  const rows = {};
  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    for (const name of fs.readdirSync(current)) {
      const file = path.join(current, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else rows[path.relative(dir, file)] = fs.readFileSync(file, 'utf8');
    }
  };
  walk(path.join(dir, rel));
  return rows;
}

function itemBytes(dir, id, change = 'demo') {
  return fs.readFileSync(path.join(dir, '.factory/work/items', `${change}--${id}.json`), 'utf8');
}

function writeDecisions(dir, decisions, name = 'decisions.json') {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(decisions, null, 2));
  return file;
}

function plan(dir, change = 'demo') {
  return buildReconciliationPlan(dir, change);
}

function apply(dir, decisions, { digest, by = 'lead-1', extra = [] } = {}) {
  const file = writeDecisions(dir, decisions);
  return idefactory(dir, [
    'sync-tasks', 'demo', '--apply', '--decisions-file', file,
    '--plan-digest', digest ?? plan(dir).digest, '--decided-by', by, ...extra,
  ]);
}

async function startAttempt(dir, task, implementerId = 'engineer-1') {
  const { id } = JSON.parse(ok(await idefactory(dir, ['attempt', 'start', 'demo', task])).out);
  ok(await idefactory(dir, ['attempt', 'transition', id, 'implementing', '--evidence', JSON.stringify({ implementerId })]));
  return id;
}

async function assertRefusedUnchanged(dir, run, pattern) {
  const before = tree(dir);
  const result = await run();
  assert.notEqual(result.code, 0, result.out);
  assert.match(result.err, pattern);
  assert.deepEqual(tree(dir), before);
}

test('an appended task joins the change and leaves every other item byte-identical', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const before = BASE.map((row) => itemBytes(dir, row.id));
    writeTasks(dir, [...BASE, { id: '1.4', title: 'Add the release note' }]);
    const result = ok(await idefactory(dir, ['sync-tasks', 'demo']));
    assert.match(result.out, /created 1, skipped 3/);
    assert.deepEqual(BASE.map((row) => itemBytes(dir, row.id)), before);
    assert.equal(getWorkItem(dir, 'demo', '1.4').status, 'todo');
  } finally {
    cleanup(dir);
  }
});

test('a checked task without an item is ignored', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    writeTasks(dir, [...BASE, { id: '1.4', title: 'Already finished elsewhere', done: true }]);
    const result = ok(await idefactory(dir, ['sync-tasks', 'demo']));
    assert.match(result.out, /created 0/);
    assert.equal(getWorkItem(dir, 'demo', '1.4'), null);
    assert.ok(plan(dir).automatic.some((row) => row.action === 'ignore-checked' && row.id === '1.4'));
  } finally {
    cleanup(dir);
  }
});

test('an addition together with a reword is ambiguous, changes nothing, and names the plan command', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    writeTasks(dir, [
      { id: '1.1', title: 'Build the parser' },
      { id: '1.2', title: 'Wire the parser into the CLI and the API', deps: ['1.1'] },
      BASE[2],
      { id: '1.4', title: 'Add the release note' },
    ]);
    await assertRefusedUnchanged(dir, () => idefactory(dir, ['sync-tasks', 'demo']), /sync-tasks demo --plan/);
  } finally {
    cleanup(dir);
  }
});

test('removed and split tasks leave the queue unchanged and name the plan command', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    writeTasks(dir, [BASE[0], BASE[2]]);
    await assertRefusedUnchanged(dir, () => idefactory(dir, ['sync-tasks', 'demo']), /unmatched previous checkbox ids: 1\.2.*--plan/s);
  } finally {
    cleanup(dir);
  }
});

test('a reworded task with an attempt keeps its gates, records the old text, and reports drift', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    await startAttempt(dir, '1.1');
    const stored = getWorkItem(dir, 'demo', '1.1');
    assert.equal(stored.status, 'in_progress');
    writeTasks(dir, [
      { id: '1.1', title: 'Build the parser and the lexer', type: 'lightweight', checks: ['build'], deps: [] },
      BASE[1],
      BASE[2],
    ]);
    const result = ok(await idefactory(dir, ['sync-tasks', 'demo']));
    assert.match(result.out, /drift for 1\.1: stored code cli checks \[unit\]/);
    assert.match(result.out, /plan lightweight cli checks \[unit, build\]/);
    const after = getWorkItem(dir, 'demo', '1.1');
    assert.equal(after.title, 'Build the parser and the lexer');
    assert.equal(after.provenance.text, 'Build the parser and the lexer');
    assert.equal(after.titleHistory.length, 1);
    assert.equal(after.titleHistory[0].text, 'Build the parser');
    assert.deepEqual(after.factory, stored.factory);
    assert.deepEqual(after.dependencies, stored.dependencies);
    assert.deepEqual(after.acceptanceCriteria, stored.acceptanceCriteria);
    assert.equal(after.status, 'in_progress');
    assert.equal(after.attemptId, stored.attemptId);
  } finally {
    cleanup(dir);
  }
});

test('a reworded task without an attempt adopts the plan as before', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    writeTasks(dir, [
      BASE[0],
      BASE[1],
      { id: '1.3', title: 'Document the parser well', type: 'lightweight', checks: ['build'] },
    ]);
    ok(await idefactory(dir, ['sync-tasks', 'demo']));
    const item = getWorkItem(dir, 'demo', '1.3');
    assert.equal(item.factory.taskType, 'lightweight');
    assert.equal(item.titleHistory[0].text, 'Document the parser');
  } finally {
    cleanup(dir);
  }
});

test('a renumber writes new files before removing old ones and a repeat sync finishes after a crash', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir, '1.1');
    writeTasks(dir, [
      { id: '1.2', title: 'Build the parser' },
      { id: '1.3', title: 'Wire the parser into the CLI', deps: ['1.2'] },
      { id: '1.4', title: 'Document the parser' },
    ]);
    assert.throws(() => syncTasks(dir, 'demo', {}, {
      afterWrite(index) {
        if (index === 0) throw new Error('injected crash');
      },
    }), /injected crash/);
    assert.equal(listWorkItems(dir, 'demo').length, 3);
    assert.ok(fs.existsSync(path.join(dir, '.factory/work/pending/demo.renumber.json')));

    ok(await idefactory(dir, ['sync-tasks', 'demo']));
    assert.equal(fs.existsSync(path.join(dir, '.factory/work/pending/demo.renumber.json')), false);
    assert.equal(getWorkItem(dir, 'demo', '1.2').title, 'Build the parser');
    assert.equal(getWorkItem(dir, 'demo', '1.3').title, 'Wire the parser into the CLI');
    assert.equal(getWorkItem(dir, 'demo', '1.4').title, 'Document the parser');
    assert.equal(getWorkItem(dir, 'demo', '1.1'), null);
    assert.equal(getAttempt(dir, attemptId).taskId, '1.2');
    assert.equal(listWorkItems(dir, 'demo').length, 3);
  } finally {
    cleanup(dir);
  }
});

test('held items are not ready, not selected, and round-trip through upsertWorkItem', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const item = getWorkItem(dir, 'demo', '1.1');
    const held = upsertWorkItem(dir, {
      ...item,
      status: 'blocked',
      hold: { kind: 'deferred', previousStatus: 'todo', decisionRecord: 'rec-x' },
    });
    assert.equal(isHeld(held), true);
    assert.equal(isHeld(getWorkItem(dir, 'demo', '1.1')), true);
    assert.equal(getWorkItem(dir, 'demo', '1.1').hold.decisionRecord, 'rec-x');
    assert.equal(isReady(dir, held, listWorkItems(dir, 'demo')), false);
    assert.equal(selectReady(dir, 'demo').id, '1.3');
    const next = ok(await idefactory(dir, ['next', '--change', 'demo']));
    assert.doesNotMatch(next.out, /1\.1 Build the parser/);
    const start = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.notEqual(start.code, 0);
    assert.match(start.err, /is deferred/);
  } finally {
    cleanup(dir);
  }
});

test('the plan lists automatic actions, unmatched items and tasks, in-flight work, dependents, and a digest, and writes nothing', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir, '1.1');
    writeTasks(dir, [BASE[1], BASE[2], { id: '1.4', title: 'Replace the parser plan' }]);
    const before = tree(dir, '.');
    const text = ok(await idefactory(dir, ['sync-tasks', 'demo', '--plan'])).out;
    const doc = JSON.parse(ok(await idefactory(dir, ['sync-tasks', 'demo', '--plan', '--json'])).out);
    assert.deepEqual(tree(dir, '.'), before);

    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.kind, 'ambiguous');
    assert.match(doc.digest, /^sha256:[0-9a-f]{64}$/);
    assert.ok(doc.unmatchedItems.some((row) => row.id === '1.1'));
    assert.ok(doc.unmatchedTasks.some((row) => row.id === '1.4'));
    const inFlight = doc.inFlight.find((row) => row.id === '1.1');
    assert.equal(inFlight.attemptId, attemptId);
    assert.equal(inFlight.attemptState, 'implementing');
    assert.deepEqual(doc.dependents['1.1'], ['1.2']);
    assert.ok(doc.requiredDecisions.includes('1.1'));
    for (const needle of ['1.1', attemptId, 'implementing', '1.2 depend on 1.1', doc.digest]) {
      assert.ok(text.includes(needle), needle);
    }
  } finally {
    cleanup(dir);
  }
});

test('the plan reports overlapping capability deltas of other changes with unfinished work', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const spec = (change, capability) => {
      const file = path.join(dir, 'openspec/changes', change, 'specs', capability, 'spec.md');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '# delta\n');
    };
    spec('demo', 'cli');
    spec('other', 'cli');
    spec('third', 'billing');
    spec('done-change', 'cli');
    writeTasks(dir, [{ id: '2.1', title: 'Other work' }], 'other');
    writeTasks(dir, [{ id: '3.1', title: 'Third work' }], 'third');
    writeTasks(dir, [{ id: '4.1', title: 'Finished work' }], 'done-change');
    for (const change of ['other', 'third', 'done-change']) ok(await idefactory(dir, ['sync-tasks', change]));
    const item = getWorkItem(dir, 'done-change', '4.1');
    upsertWorkItem(dir, { ...item, status: 'done' });
    const doc = plan(dir);
    assert.deepEqual(doc.overlaps.map((row) => [row.change, row.capability]), [['other', 'cli']]);
  } finally {
    cleanup(dir);
  }
});

async function replaced(dir) {
  await seed(dir);
  writeTasks(dir, [BASE[1], BASE[2], { id: '1.4', title: 'Replace the parser plan' }]);
  return plan(dir).digest;
}

test('apply refuses a missing decision, a conflicting file, a stale digest, and bad decisions without touching the queue', async () => {
  const dir = tempProject();
  try {
    const digest = await replaced(dir);
    await assertRefusedUnchanged(dir, () => apply(dir, {}, { digest }), /no decision for: 1\.1/);
    await assertRefusedUnchanged(dir, () => apply(dir, { '1.1': { decision: 'bogus' } }, { digest }), /must be one of/);
    await assertRefusedUnchanged(dir, () => apply(dir, { '9.9': 'defer', '1.1': 'defer' }, { digest }), /not a stored item/);
    await assertRefusedUnchanged(dir, () => apply(dir, { '1.1': { decision: 'drop' } }, { digest }), /needs dependents: block or release/);
    await assertRefusedUnchanged(dir, () => apply(dir, { '1.1': 'keep' }, { digest }), /needs a task with the same id|keep for 1\.1/);
    await assertRefusedUnchanged(dir, () => apply(dir, { '1.1': { decision: 'drop', dependents: 'block' } }, { digest: 'sha256:stale' }), /plan digest mismatch/);
    await assertRefusedUnchanged(dir, () => apply(dir, { '1.1': { decision: 'renumber', to: '1.4' }, '1.2': { decision: 'renumber', to: '1.4' } }, { digest }), /conflict|already used/);
  } finally {
    cleanup(dir);
  }
});

test('every decision applies: renumber, defer, resume, drop, split, merge, move, keep, adopt, and keep-classification', async () => {
  const dir = tempProject();
  try {
    await seed(dir, [
      { id: '1.1', title: 'Build the parser', deps: [] },
      { id: '1.2', title: 'Wire the parser', deps: ['1.1'] },
      { id: '1.3', title: 'Document the parser', deps: [] },
      { id: '1.4', title: 'Release the parser', deps: [] },
      { id: '1.5', title: 'Announce the parser', deps: [] },
      { id: '1.6', title: 'Benchmark the parser', deps: [] },
    ]);
    writeTasks(dir, [{ id: '2.1', title: 'Moved work' }], 'other');
    ok(await idefactory(dir, ['sync-tasks', 'other']));
    writeTasks(dir, [
      { id: '1.2', title: 'Wire the parser', deps: [] },
      { id: '1.3', title: 'Document the parser', deps: [] },
      { id: '1.4', title: 'Release the parser', deps: [] },
      { id: '1.5', title: 'Announce the parser better', deps: [] },
      { id: '1.7', title: 'Benchmark parsing speed', deps: [] },
      { id: '1.8', title: 'Profile the lexer', deps: [] },
      { id: '1.9', title: 'Profile the grammar', deps: [] },
    ]);
    const doc = plan(dir);
    assert.deepEqual(doc.requiredDecisions, ['1.1', '1.2', '1.5', '1.6']);
    const decisions = {
      '1.1': { decision: 'split', into: ['1.8', '1.9'], dependents: 'release' },
      '1.2': 'adopt-classification',
      '1.5': 'keep',
      '1.6': { decision: 'renumber', to: '1.7' },
      '1.4': 'defer',
      '1.3': { decision: 'drop', supersededBy: [{ change: 'other', id: '2.1' }], dependents: 'block' },
    };
    const result = ok(await apply(dir, decisions, { digest: doc.digest }));
    assert.match(result.out, /Applied reconciliation rec-/);

    const split = getWorkItem(dir, 'demo', '1.1');
    assert.equal(isHeld(split), true);
    assert.equal(split.hold.kind, 'dropped');
    assert.deepEqual(split.hold.supersededBy, [{ change: 'demo', id: '1.8' }, { change: 'demo', id: '1.9' }]);
    assert.equal(getWorkItem(dir, 'demo', '1.8').status, 'todo');
    assert.equal(getWorkItem(dir, 'demo', '1.9').status, 'todo');
    assert.deepEqual(getWorkItem(dir, 'demo', '1.2').dependencies, []);
    assert.equal(getWorkItem(dir, 'demo', '1.5').title, 'Announce the parser better');
    assert.equal(getWorkItem(dir, 'demo', '1.5').titleHistory[0].text, 'Announce the parser');
    assert.equal(getWorkItem(dir, 'demo', '1.6'), null);
    assert.equal(getWorkItem(dir, 'demo', '1.7').title, 'Benchmark parsing speed');
    assert.equal(getWorkItem(dir, 'demo', '1.4').hold.kind, 'deferred');
    assert.equal(getWorkItem(dir, 'demo', '1.4').hold.previousStatus, 'todo');
    assert.deepEqual(getWorkItem(dir, 'demo', '1.3').hold.supersededBy, [{ change: 'other', id: '2.1' }]);

    const resumed = writeDecisions(dir, { '1.4': 'resume' }, 'resume.json');
    const next = plan(dir);
    ok(await idefactory(dir, ['sync-tasks', 'demo', '--apply', '--decisions-file', resumed, '--plan-digest', next.digest, '--decided-by', 'lead-1']));
    assert.equal(getWorkItem(dir, 'demo', '1.4').status, 'todo');
    assert.equal(getWorkItem(dir, 'demo', '1.4').hold, undefined);

    const merged = writeDecisions(dir, { '1.5': { decision: 'merge', into: '1.4', dependents: 'block' } }, 'merge.json');
    ok(await idefactory(dir, ['sync-tasks', 'demo', '--apply', '--decisions-file', merged, '--plan-digest', plan(dir).digest, '--decided-by', 'lead-1']));
    assert.equal(getWorkItem(dir, 'demo', '1.5').hold.kind, 'dropped');
    assert.deepEqual(getWorkItem(dir, 'demo', '1.5').hold.supersededBy, [{ change: 'demo', id: '1.4' }]);

    const moved = writeDecisions(dir, { '1.7': { decision: 'move', to: { change: 'other', id: '2.1' }, dependents: 'block' } }, 'move.json');
    ok(await idefactory(dir, ['sync-tasks', 'demo', '--apply', '--decisions-file', moved, '--plan-digest', plan(dir).digest, '--decided-by', 'lead-1']));
    assert.equal(getWorkItem(dir, 'demo', '1.7').hold.kind, 'dropped');
    assert.equal(selectReady(dir, 'demo').id, '1.2');
  } finally {
    cleanup(dir);
  }
});

test('a move needs the target task to exist in the other change', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    writeTasks(dir, [{ id: '2.1', title: 'Moved work' }], 'other');
    writeTasks(dir, [BASE[1], BASE[2], { id: '1.4', title: 'Replace the parser plan' }]);
    const digest = plan(dir).digest;
    await assertRefusedUnchanged(dir, () => apply(dir, { '1.1': { decision: 'move', to: { change: 'other', id: '9.9' }, dependents: 'block' } }, { digest }), /needs task 9\.9 in openspec\/changes\/other\/tasks\.md/);
    ok(await apply(dir, { '1.1': { decision: 'move', to: { change: 'other', id: '2.1' }, dependents: 'block' } }, { digest }));
    assert.equal(getWorkItem(dir, 'demo', '1.1').hold.supersededBy[0].change, 'other');
    assert.notEqual(selectReady(dir, 'demo')?.id, '1.1');
  } finally {
    cleanup(dir);
  }
});

test('classification decisions: adopt needs an independent identity, keep records the stored gates', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir, '1.1', 'engineer-1');
    writeTasks(dir, [
      { id: '1.1', title: 'Build the parser', type: 'lightweight', checks: ['build'] },
      BASE[1],
      BASE[2],
    ]);
    const doc = plan(dir);
    assert.deepEqual(doc.requiredDecisions, ['1.1']);
    assert.equal(doc.drift[0].new.taskType, 'lightweight');
    await assertRefusedUnchanged(dir, () => apply(dir, { '1.1': 'keep' }, { digest: doc.digest }), /adopt-classification or keep-classification/);
    await assertRefusedUnchanged(dir, () => apply(dir, { '1.1': 'adopt-classification' }, { digest: doc.digest, by: 'engineer-1' }), /other than the implementer's of attempt/);
    const before = fs.readFileSync(attemptPath(dir, attemptId), 'utf8');

    ok(await apply(dir, { '1.1': 'keep-classification' }, { digest: doc.digest, by: 'engineer-1' }));
    assert.equal(getWorkItem(dir, 'demo', '1.1').factory.taskType, 'code');

    const again = plan(dir);
    ok(await apply(dir, { '1.1': 'adopt-classification' }, { digest: again.digest, by: 'lead-1' }));
    const adopted = getWorkItem(dir, 'demo', '1.1');
    assert.equal(adopted.factory.taskType, 'lightweight');
    assert.deepEqual(adopted.factory.checks, ['build']);
    assert.equal(fs.readFileSync(attemptPath(dir, attemptId), 'utf8'), before);
  } finally {
    cleanup(dir);
  }
});

test('policy version 2 refuses a loosening decision that no verified principal confirms', async () => {
  const dir = tempProject();
  try {
    await seed(dir, BASE, { policyVersion: 2 });
    await startAttempt(dir, '1.1', 'engineer-1');
    writeTasks(dir, [BASE[1], BASE[2], { id: '1.4', title: 'Replace the parser plan' }]);
    const digest = plan(dir).digest;
    await assertRefusedUnchanged(dir, () => apply(dir, { '1.1': { decision: 'drop', dependents: 'block' } }, { digest }), /principal|verifier/i);
    ok(await apply(dir, { '1.1': 'defer' }, { digest }));
    assert.equal(getWorkItem(dir, 'demo', '1.1').hold.kind, 'deferred');
  } finally {
    cleanup(dir);
  }
});

test('an apply writes one record, is idempotent, resumes after a crash, and appends an event', async () => {
  const dir = tempProject();
  try {
    const digest = await replaced(dir);
    const decisions = { '1.1': { decision: 'drop', supersededBy: ['1.4'], dependents: 'release' } };
    const first = ok(await apply(dir, decisions, { digest }));
    const dirFiles = fs.readdirSync(path.join(dir, '.factory/work/reconciliations'));
    assert.equal(dirFiles.length, 1);
    const record = JSON.parse(fs.readFileSync(path.join(dir, '.factory/work/reconciliations', dirFiles[0]), 'utf8'));
    assert.equal(record.status, 'applied');
    assert.equal(record.planDigest, digest);
    assert.deepEqual(record.decisions, decisions);
    assert.equal(record.decidedBy, 'lead-1');
    assert.ok(record.time);
    const touched = Object.fromEntries(record.touched.map((row) => [row.id, row]));
    assert.ok(touched['1.1'].before && touched['1.1'].after && touched['1.1'].before !== touched['1.1'].after);
    assert.equal(touched['1.4'].before, null);
    assert.match(touched['1.4'].after, /^sha256:/);
    assert.ok(touched['1.2'], 'the released dependent is recorded');

    const snapshot = tree(dir);
    const repeat = ok(await apply(dir, decisions, { digest }));
    assert.match(repeat.out, /already applied; nothing changed/);
    assert.deepEqual(tree(dir), snapshot);
    assert.ok(first.out.includes(record.id));

    const events = fs.readFileSync(path.join(dir, '.factory/observability/events.jsonl'), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line));
    const event = events.find((row) => row.type === 'tasks.reconciled');
    assert.equal(event.id, record.id);
    assert.equal(event.change, 'demo');
  } finally {
    cleanup(dir);
  }
});

test('a pending record left by a crash is finished by a repeat apply', async () => {
  const dir = tempProject();
  try {
    const digest = await replaced(dir);
    const decisions = { '1.1': { decision: 'drop', supersededBy: ['1.4'], dependents: 'release' } };
    ok(await apply(dir, decisions, { digest }));
    const recordsDir = path.join(dir, '.factory/work/reconciliations');
    const file = path.join(recordsDir, fs.readdirSync(recordsDir)[0]);
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...record, status: 'pending', after: undefined, touched: undefined }, null, 2));
    fs.rmSync(path.join(dir, '.factory/work/items/demo--1.4.json'));
    upsertWorkItem(dir, { ...getWorkItem(dir, 'demo', '1.2'), dependencies: ['1.1'] });

    ok(await apply(dir, decisions, { digest }));
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).status, 'applied');
    assert.equal(getWorkItem(dir, 'demo', '1.4').status, 'todo');
    assert.deepEqual(getWorkItem(dir, 'demo', '1.2').dependencies, []);
  } finally {
    cleanup(dir);
  }
});

test('complete refuses a dropped item and names the hold', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir, '1.3');
    writeTasks(dir, [BASE[0], BASE[1]]);
    const digest = plan(dir).digest;
    ok(await apply(dir, { '1.3': { decision: 'drop', dependents: 'block' } }, { digest }));
    const result = await idefactory(dir, ['complete', 'demo', '1.3', '--attempt', attemptId]);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /is dropped by reconciliation rec-.* and cannot be completed/);
    assert.notEqual(getWorkItem(dir, 'demo', '1.3').status, 'done');
    const status = ok(await idefactory(dir, ['status'])).out;
    assert.match(status, /Held items:/);
    assert.match(status, /demo\/1\.3 dropped by reconciliation rec-/);
  } finally {
    cleanup(dir);
  }
});

test('end to end: an in-flight task is dropped for a replacement while another is deferred, and run selects only ready current work', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir, '1.1');
    const attemptBefore = fs.readFileSync(attemptPath(dir, attemptId), 'utf8');
    writeTasks(dir, [BASE[1], BASE[2], { id: '1.4', title: 'A replacement for the parser' }]);

    const plain = await idefactory(dir, ['sync-tasks', 'demo']);
    assert.notEqual(plain.code, 0);
    assert.match(plain.err, /sync-tasks demo --plan/);

    const doc = JSON.parse(ok(await idefactory(dir, ['sync-tasks', 'demo', '--plan', '--json'])).out);
    assert.equal(doc.inFlight.find((row) => row.id === '1.1').attemptState, 'implementing');
    assert.deepEqual(doc.dependents['1.1'], ['1.2']);

    const decisions = {
      '1.1': { decision: 'drop', supersededBy: ['1.4'], dependents: 'release' },
      '1.3': 'defer',
    };
    const refused = await apply(dir, decisions, { digest: doc.digest, by: 'engineer-1' });
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /other than the implementer's/);
    ok(await apply(dir, decisions, { digest: doc.digest, by: 'lead-1' }));

    assert.equal(getWorkItem(dir, 'demo', '1.1').hold.kind, 'dropped');
    assert.equal(getWorkItem(dir, 'demo', '1.3').hold.kind, 'deferred');
    assert.equal(getWorkItem(dir, 'demo', '1.4').status, 'todo');
    const run = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.match(run.out, /1\.2/);
    assert.doesNotMatch(run.out, /"taskId": "1\.1"|"taskId": "1\.3"/);
    assert.equal(fs.readFileSync(attemptPath(dir, attemptId), 'utf8'), attemptBefore);
  } finally {
    cleanup(dir);
  }
});

test('sync-tasks help documents the plan, apply, files, and every decision without changing the global usage', async () => {
  const dir = tempProject();
  try {
    const help = ok(await idefactory(dir, ['help', 'sync-tasks'])).out;
    for (const needle of ['--plan', '--apply', '--decisions-file', '--plan-digest', '--decided-by',
      'keep', 'renumber', 'defer', 'resume', 'drop', 'split', 'merge', 'move', 'adopt-classification', 'keep-classification']) {
      assert.ok(help.includes(needle), needle);
    }
    const json = JSON.parse(ok(await idefactory(dir, ['help', 'sync-tasks', '--json'])).out);
    assert.ok(JSON.stringify(json).includes('--plan'));
    const global = ok(await idefactory(dir, ['--help'])).out;
    assert.match(global, /idefactory sync-tasks <change> \[--path dir\]/);
    assert.doesNotMatch(global, /--plan/);
  } finally {
    cleanup(dir);
  }
});
