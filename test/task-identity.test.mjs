import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { getAttempt } from '../src/lib/attempt.mjs';
import { getWorkItem, listWorkItems } from '../src/lib/work.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

const CHANGE = 'demo';

function writeTasks(dir, body) {
  const file = path.join(dir, 'openspec', 'changes', CHANGE, 'tasks.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function normalizeTitle(title) {
  return String(title).trim().replace(/\s+/g, ' ');
}

function expectedProvenance(title) {
  const text = normalizeTitle(title);
  return {
    algorithm: 'sha256',
    text,
    digest: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}

function snapshotWork(dir) {
  const root = path.join(dir, '.factory', 'work');
  const files = {};
  if (!fs.existsSync(root)) return files;
  const walk = (rel) => {
    const abs = path.join(root, rel);
    for (const name of fs.readdirSync(abs).sort()) {
      const child = rel ? `${rel}/${name}` : name;
      const childAbs = path.join(root, child);
      const st = fs.statSync(childAbs);
      if (st.isDirectory()) walk(child);
      else files[child] = fs.readFileSync(childAbs);
    }
  };
  walk('');
  return files;
}

function assertWorkByteIdentical(before, after) {
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
  for (const key of Object.keys(before)) {
    assert.ok(Buffer.compare(before[key], after[key]) === 0, `work file changed: ${key}`);
  }
}

function reportText(result) {
  return `${result.err}\n${result.out}`;
}

test('first sync stores sha256 provenance of the normalized title', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeTasks(dir, '- [ ] 1.1 First   unchecked task\n');
    const sync = await idefactory(dir, ['sync-tasks', CHANGE]);
    assert.equal(sync.code, 0, sync.err);
    assert.match(sync.out, /created 1/);
    const item = getWorkItem(dir, CHANGE, '1.1');
    assert.ok(item, 'work item must exist');
    assert.deepEqual(item.provenance, expectedProvenance('First   unchecked task'));
    assert.equal(item.id, '1.1');
  } finally {
    cleanup(dir);
  }
});

test('second sync of the same tasks.md leaves ids and statuses unchanged', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeTasks(dir, [
      '- [ ] 1.1 First unchecked task',
      '- [ ] 1.2 Second unchecked task',
      '',
    ].join('\n'));
    assert.equal((await idefactory(dir, ['sync-tasks', CHANGE])).code, 0);
    const before = listWorkItems(dir, CHANGE).map((item) => ({
      id: item.id,
      status: item.status,
    }));
    const second = await idefactory(dir, ['sync-tasks', CHANGE]);
    assert.equal(second.code, 0, second.err);
    assert.match(second.out, /created 0/);
    const after = listWorkItems(dir, CHANGE).map((item) => ({
      id: item.id,
      status: item.status,
    }));
    assert.deepEqual(after, before);
  } finally {
    cleanup(dir);
  }
});

test('whitespace-only rewrite of a title does not create a second item', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeTasks(dir, '- [ ] 1.1 First unchecked task\n');
    assert.equal((await idefactory(dir, ['sync-tasks', CHANGE])).code, 0);
    const beforeIds = listWorkItems(dir, CHANGE).map((item) => item.id);
    writeTasks(dir, '- [ ] 1.1   First    unchecked   task  \n');
    const again = await idefactory(dir, ['sync-tasks', CHANGE]);
    assert.equal(again.code, 0, again.err);
    assert.match(again.out, /created 0/);
    const items = listWorkItems(dir, CHANGE);
    assert.equal(items.length, 1);
    assert.deepEqual(items.map((item) => item.id), beforeIds);
    assert.equal(items[0].status, 'todo');
  } finally {
    cleanup(dir);
  }
});

test('renumbering one task keeps one work item and retargets the attempt taskId', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeTasks(dir, '- [ ] 1.1 First unchecked task\n');
    assert.equal((await idefactory(dir, ['sync-tasks', CHANGE])).code, 0);
    const started = await idefactory(dir, ['attempt', 'start', CHANGE, '1.1']);
    assert.equal(started.code, 0, started.err);
    const attempt = JSON.parse(started.out);
    assert.equal(attempt.taskId, '1.1');
    assert.notEqual(attempt.state, 'accepted');
    const statusBefore = getWorkItem(dir, CHANGE, '1.1').status;

    writeTasks(dir, '- [ ] 2.1 First unchecked task\n');
    const sync = await idefactory(dir, ['sync-tasks', CHANGE]);
    assert.equal(sync.code, 0, sync.err);

    const items = listWorkItems(dir, CHANGE);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, '2.1');
    assert.equal(items[0].status, statusBefore);
    assert.equal(fs.existsSync(path.join(dir, '.factory/work/items/demo--1.1.json')), false);
    assert.ok(fs.existsSync(path.join(dir, '.factory/work/items/demo--2.1.json')));

    const after = getAttempt(dir, attempt.id);
    assert.ok(after);
    assert.equal(after.taskId, '2.1');
    assert.notEqual(after.state, 'accepted');
    assert.equal(after.state, attempt.state);
  } finally {
    cleanup(dir);
  }
});

test('replacing one synced task with two fails closed with a reconciliation report', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeTasks(dir, '- [ ] 1.1 First unchecked task\n');
    assert.equal((await idefactory(dir, ['sync-tasks', CHANGE])).code, 0);
    const before = snapshotWork(dir);

    writeTasks(dir, [
      '- [ ] 1.1 First unchecked task',
      '- [ ] 1.2 Second unchecked task',
      '',
    ].join('\n'));
    const result = await idefactory(dir, ['sync-tasks', CHANGE]);
    assert.notEqual(result.code, 0);
    assertWorkByteIdentical(before, snapshotWork(dir));
    const report = reportText(result);
    assert.match(report, /Reconciliation failed for change demo/);
    assert.match(report, /unmatched previous checkbox ids:/);
    assert.match(report, /unmatched current checkbox ids:/);
    assert.match(report, /1\.2/);
  } finally {
    cleanup(dir);
  }
});

test('replacing two synced tasks with one fails closed with a reconciliation report', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeTasks(dir, [
      '- [ ] 1.1 First unchecked task',
      '- [ ] 1.2 Second unchecked task',
      '',
    ].join('\n'));
    assert.equal((await idefactory(dir, ['sync-tasks', CHANGE])).code, 0);
    const before = snapshotWork(dir);

    writeTasks(dir, '- [ ] 1.1 Combined unchecked task\n');
    const result = await idefactory(dir, ['sync-tasks', CHANGE]);
    assert.notEqual(result.code, 0);
    assertWorkByteIdentical(before, snapshotWork(dir));
    const report = reportText(result);
    assert.match(report, /Reconciliation failed for change demo/);
    assert.match(report, /unmatched previous checkbox ids:/);
    assert.match(report, /unmatched current checkbox ids:/);
    assert.match(report, /1\.1/);
    assert.match(report, /1\.2/);
  } finally {
    cleanup(dir);
  }
});

test('hand-checked box does not mark the work item done or accept the attempt', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeTasks(dir, '- [ ] 1.1 First unchecked task\n');
    assert.equal((await idefactory(dir, ['sync-tasks', CHANGE])).code, 0);
    const started = await idefactory(dir, ['attempt', 'start', CHANGE, '1.1']);
    assert.equal(started.code, 0, started.err);
    const attempt = JSON.parse(started.out);

    writeTasks(dir, '- [x] 1.1 First unchecked task\n');
    const sync = await idefactory(dir, ['sync-tasks', CHANGE]);
    assert.equal(sync.code, 0, sync.err);
    assert.match(sync.out, /created 0/);

    const item = getWorkItem(dir, CHANGE, '1.1');
    assert.ok(item);
    assert.notEqual(item.status, 'done');
    const after = getAttempt(dir, attempt.id);
    assert.notEqual(after.state, 'accepted');
  } finally {
    cleanup(dir);
  }
});

test('archive move and main-spec write leave attempt, evidence, and work-item status unchanged', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeTasks(dir, '- [ ] 1.1 First unchecked task\n');
    assert.equal((await idefactory(dir, ['sync-tasks', CHANGE])).code, 0);
    const started = await idefactory(dir, ['attempt', 'start', CHANGE, '1.1']);
    assert.equal(started.code, 0, started.err);
    const attempt = JSON.parse(started.out);

    const attemptPath = path.join(dir, '.factory', 'attempts', `${attempt.id}.json`);
    const itemPath = path.join(dir, '.factory', 'work', 'items', 'demo--1.1.json');
    const attemptBefore = fs.readFileSync(attemptPath);
    const itemBefore = fs.readFileSync(itemPath);
    const statusBefore = getWorkItem(dir, CHANGE, '1.1').status;

    const changeDir = path.join(dir, 'openspec', 'changes', CHANGE);
    const archiveDir = path.join(dir, 'openspec', 'changes', 'archive', CHANGE);
    fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
    fs.renameSync(changeDir, archiveDir);

    const mainSpec = path.join(dir, 'openspec', 'specs', 'demo-capability', 'spec.md');
    fs.mkdirSync(path.dirname(mainSpec), { recursive: true });
    fs.writeFileSync(mainSpec, '# demo-capability\n\nAccepted spec text.\n');

    assert.ok(Buffer.compare(fs.readFileSync(attemptPath), attemptBefore) === 0);
    assert.ok(Buffer.compare(fs.readFileSync(itemPath), itemBefore) === 0);
    assert.equal(getWorkItem(dir, CHANGE, '1.1').status, statusBefore);
    assert.notEqual(getAttempt(dir, attempt.id).state, 'accepted');
  } finally {
    cleanup(dir);
  }
});
