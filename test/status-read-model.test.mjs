import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function snapshot(dir) {
  const root = path.join(dir, '.factory');
  const files = [];
  const walk = (current) => {
    for (const name of fs.readdirSync(current)) {
      const abs = path.join(current, name);
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) walk(abs);
      else files.push(`${path.relative(root, abs)}:${stat.mtimeMs}:${stat.size}`);
    }
  };
  walk(root);
  return files.sort();
}

test('status --json reports counts and stop reasons without writing or leaking notes', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeJson(path.join(dir, '.factory/work/items/demo--1.1.json'), {
      id: '1.1',
      change: 'demo',
      title: 'one',
      status: 'todo',
      dependencies: [],
    });
    writeJson(path.join(dir, '.factory/orchestration/runs/run-1.json'), {
      schemaVersion: 1,
      runId: 'run-1',
      change: 'demo',
      status: 'closed',
      stopReason: 'max-tasks',
    });
    writeJson(path.join(dir, '.factory/approvals/secret.json'), {
      schemaVersion: 1,
      note: 'SUPER_SECRET_NOTE',
    });
    const before = snapshot(dir);
    const result = await idefactory(dir, ['status', '--json']);
    assert.equal(result.code, 0, result.err);
    const body = JSON.parse(result.out);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.workCounts.todo, 1);
    assert.equal(body.metrics.stopReasons['max-tasks'], 1);
    assert.equal(JSON.stringify(body).includes('SUPER_SECRET_NOTE'), false);
    assert.deepEqual(snapshot(dir), before);

    const text = await idefactory(dir, ['status']);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /^Factory status/);
  } finally {
    cleanup(dir);
  }
});
