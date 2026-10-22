import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parseCheckboxes } from '../src/lib/queue.mjs';
import { getWorkItem, listWorkItems } from '../src/lib/work.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

test('parseCheckboxes treats an x mark as done', () => {
  const tasks = parseCheckboxes([
    '- [ ] 1.1 First',
    '- [x] 1.2 Second',
    '- [ x] 1.3 Third',
  ].join('\n'));
  assert.deepEqual(tasks.map((task) => [task.id, task.done]), [
    ['1.1', false],
    ['1.2', true],
    ['1.3', true],
  ]);
});

function writeDemoTasks(dir, body) {
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), body);
}

function assertNoFactoryBacklogTaskList(dir) {
  const factoryDir = path.join(dir, '.factory');
  const names = fs.readdirSync(factoryDir);
  assert.equal(
    names.some((name) => name.toLowerCase() === 'backlog.md'),
    false,
    `.factory/ must not contain a backlog.md task list; found: ${names.join(', ')}`,
  );
  assert.equal(fs.existsSync(path.join(dir, 'Backlog.md')), false);
  assert.equal(fs.existsSync(path.join(dir, 'backlog.md')), false);
}

test('sync-tasks creates one work item per unchecked checkbox', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeDemoTasks(dir, [
      '# Tasks',
      '',
      '## 1. Work',
      '',
      '- [ ] 1.1 First unchecked task',
      '- [x] 1.2 Already done task',
      '- [ ] 1.3 Second unchecked task',
      '',
    ].join('\n'));
    const first = await idefactory(dir, ['sync-tasks', 'demo']);
    assert.equal(first.code, 0, first.err);
    assert.match(first.out, /created 2/);
    const items = listWorkItems(dir, 'demo');
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((item) => item.id).sort(), ['1.1', '1.3']);
    assert.match(items[0].acceptanceCriteria[0], /First unchecked task|works as specified/i);
    assert.doesNotMatch(items[0].acceptanceCriteria.join('\n'), /Checkbox .* is implemented/);
  } finally {
    cleanup(dir);
  }
});

test('sync-tasks skips checked checkboxes', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeDemoTasks(dir, [
      '- [x] 1.1 Already done task',
      '- [ ] 1.2 Still open task',
      '',
    ].join('\n'));
    const result = await idefactory(dir, ['sync-tasks', 'demo']);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /created 1/);
    const items = listWorkItems(dir, 'demo');
    assert.equal(items.length, 1);
    assert.equal(items[0].id, '1.2');
    assert.equal(fs.existsSync(path.join(dir, '.factory/work/items/demo--1.1.json')), false);
  } finally {
    cleanup(dir);
  }
});

test('sync-tasks does not duplicate already synced checkboxes', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeDemoTasks(dir, [
      '- [ ] 1.1 First unchecked task',
      '- [ ] 1.3 Second unchecked task',
      '',
    ].join('\n'));
    const first = await idefactory(dir, ['sync-tasks', 'demo']);
    assert.equal(first.code, 0, first.err);
    assert.match(first.out, /created 2/);
    const second = await idefactory(dir, ['sync-tasks', 'demo']);
    assert.equal(second.code, 0, second.err);
    assert.match(second.out, /created 0/);
    assert.equal(listWorkItems(dir, 'demo').length, 2);
    const itemFiles = fs.readdirSync(path.join(dir, '.factory/work/items'))
      .filter((name) => name.endsWith('.json'));
    assert.equal(itemFiles.length, 2);
  } finally {
    cleanup(dir);
  }
});

test('sync-tasks uses .factory/work as the only machine queue', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeDemoTasks(dir, '- [ ] 1.1 First unchecked task\n');
    const result = await idefactory(dir, ['sync-tasks', 'demo']);
    assert.equal(result.code, 0, result.err);
    assert.ok(
      fs.existsSync(path.join(dir, '.factory/work/items/demo--1.1.json')),
      'work item must exist under .factory/work/items',
    );
    assert.equal(listWorkItems(dir, 'demo').length, 1);
    assertNoFactoryBacklogTaskList(dir);
  } finally {
    cleanup(dir);
  }
});

test('sync-tasks wires factory metadata and sequential dependencies', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), [
      '# Tasks',
      '',
      '- [ ] 1.1 Scaffold app',
      '- [ ] 1.2 Add login form',
      '  factory:',
      '    kind: frontend',
      '    risk: low',
      '    roles: [engineer, test-engineer, reviewer]',
      '    checks: [unit, build, playwright]',
      '    dependencies: ["1.1"]',
      '',
    ].join('\n'));
    assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
    const second = getWorkItem(dir, 'demo', '1.2');
    assert.equal(second.factory.kind, 'frontend');
    assert.deepEqual(second.dependencies, ['1.1']);
    assert.ok(second.factory.roles.includes('test-engineer'));
    assert.ok(second.factory.checks.includes('playwright'));
  } finally {
    cleanup(dir);
  }
});

test('sync-tasks errors for a missing change and creates nothing', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const result = await idefactory(dir, ['sync-tasks', 'missing-change']);
    assert.notEqual(result.code, 0);
    assert.equal(listWorkItems(dir).length, 0);
  } finally {
    cleanup(dir);
  }
});

test('next prints one engineer packet and HALT blocks next and sync', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), '- [ ] 9.1 Add parser\n');
    assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
    const packet = await idefactory(dir, ['next', '--change', 'demo']);
    assert.equal(packet.code, 0, packet.err);
    assert.match(packet.out, /Role: engineer/);
    assert.match(packet.out, /\.factory\/agents\/engineer\/charter\.md/);
    assert.doesNotMatch(packet.out, /\.factory\/agents\/lead\/charter\.md/);
    assert.doesNotMatch(packet.out, /\.factory\/agents\/reviewer\/charter\.md/);
    assert.match(packet.out, /failing test/i);
    assert.match(packet.out, /verification/i);
    assert.match(packet.out, /different role/i);
    assert.match(packet.out, /Prefer common scaffolds|create vite/i);
    assert.match(packet.out, /Model profile:/);

    fs.writeFileSync(path.join(dir, 'HALT'), 'stop\n');
    const haltedNext = await idefactory(dir, ['next', '--change', 'demo']);
    assert.notEqual(haltedNext.code, 0);
    assert.doesNotMatch(haltedNext.out, /Work packet/);
    const haltedSync = await idefactory(dir, ['sync-tasks', 'demo']);
    assert.notEqual(haltedSync.code, 0);
  } finally {
    cleanup(dir);
  }
});

test('dependency ordering blocks 1.2 until 1.1 is done', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), [
      '- [ ] 1.1 First',
      '- [ ] 1.2 Second',
    ].join('\n'));
    assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
    const packet = await idefactory(dir, ['next', '--change', 'demo']);
    assert.match(packet.out, /Work item: demo\/1\.1/);
    assert.doesNotMatch(packet.out, /Work item: demo\/1\.2/);
  } finally {
    cleanup(dir);
  }
});
