import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parseCheckboxes } from '../src/lib/queue.mjs';
import { cleanup, fakeBacklog, idefactory, tempProject } from './helpers.mjs';

function backlogEnv(dir) {
  return {
    IDEFACTORY_BACKLOG: fakeBacklog,
    IDEFACTORY_FAKE_DB: path.join(dir, 'fake-tasks.json'),
    IDEFACTORY_FAKE_LOG: path.join(dir, 'fake-log.txt'),
  };
}

function tasksOf(dir) {
  const file = path.join(dir, 'fake-tasks.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

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

test('sync-tasks creates unchecked backlog tasks once and skips checked boxes', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), [
      '# Tasks',
      '',
      '## 1. Work',
      '',
      '- [ ] 1.1 First unchecked task',
      '- [x] 1.2 Already done task',
      '- [ ] 1.3 Second unchecked task',
      '',
    ].join('\n'));
    const env = backlogEnv(dir);
    const first = await idefactory(dir, ['sync-tasks', 'demo'], env);
    assert.equal(first.code, 0, first.err);
    assert.match(first.out, /created 2/);
    const tasks = tasksOf(dir);
    assert.equal(tasks.length, 2);
    assert.equal(tasks.some((task) => task.title.startsWith('[1.2]')), false);
    assert.equal(tasks.every((task) => task.labels.includes('demo')), true);
    assert.equal(fs.existsSync(path.join(dir, '.factory/backlog.md')), false);
    const second = await idefactory(dir, ['sync-tasks', 'demo'], env);
    assert.equal(second.code, 0, second.err);
    assert.match(second.out, /created 0/);
    assert.equal(tasksOf(dir).length, 2);
  } finally {
    cleanup(dir);
  }
});

test('sync-tasks errors for a missing change and creates nothing', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const env = backlogEnv(dir);
    const result = await idefactory(dir, ['sync-tasks', 'missing-change'], env);
    assert.notEqual(result.code, 0);
    assert.equal(tasksOf(dir).length, 0);
    assert.equal(fs.existsSync(path.join(dir, 'fake-log.txt')), false);
  } finally {
    cleanup(dir);
  }
});

test('next prints one engineer packet and HALT blocks next and sync', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const env = backlogEnv(dir);
    fs.writeFileSync(env.IDEFACTORY_FAKE_DB, JSON.stringify([{
      id: 'TASK-9',
      title: '[9.1] Add parser',
      status: 'To Do',
      archived: false,
      labels: ['demo', 'factory'],
      description: 'openspec-task: 9.1\n\nAdd the parser.',
      isReady: true,
      acceptanceCriteria: [{ text: 'parser test passes' }],
    }]));
    const packet = await idefactory(dir, ['next'], env);
    assert.equal(packet.code, 0, packet.err);
    assert.match(packet.out, /Role: engineer/);
    assert.match(packet.out, /\.factory\/agents\/engineer\/charter\.md/);
    assert.doesNotMatch(packet.out, /\.factory\/agents\/lead\/charter\.md/);
    assert.doesNotMatch(packet.out, /\.factory\/agents\/reviewer\/charter\.md/);
    assert.match(packet.out, /failing test/i);
    assert.match(packet.out, /verification command/i);
    assert.match(packet.out, /different role/i);

    fs.writeFileSync(path.join(dir, 'HALT'), 'stop\n');
    const logBefore = fs.readFileSync(env.IDEFACTORY_FAKE_LOG, 'utf8').split('\n').filter(Boolean).length;
    const haltedNext = await idefactory(dir, ['next'], env);
    assert.notEqual(haltedNext.code, 0);
    assert.doesNotMatch(haltedNext.out, /Work packet/);
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), '- [ ] 1.1 Something\n');
    const haltedSync = await idefactory(dir, ['sync-tasks', 'demo'], env);
    assert.notEqual(haltedSync.code, 0);
    const logAfter = fs.readFileSync(env.IDEFACTORY_FAKE_LOG, 'utf8').split('\n').filter(Boolean).length;
    assert.equal(logAfter, logBefore);
  } finally {
    cleanup(dir);
  }
});
