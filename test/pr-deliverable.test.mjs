import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { isDeliverableChange, stage1ExitRecordCheck } from '../src/lib/pull-request.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

const CHANGE = 'demo-change';

function writeRecord(dir, record) {
  const file = path.join(dir, '.factory', 'pull-requests', `${CHANGE}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

function changeDir(dir) {
  const target = path.join(dir, 'openspec', 'changes', CHANGE);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'proposal.md'), 'stay\n');
  return target;
}

test('a missing or incomplete pull-request record is not deliverable', () => {
  const dir = tempProject();
  try {
    const target = changeDir(dir);
    assert.equal(isDeliverableChange(dir, CHANGE), false);
    assert.deepEqual(stage1ExitRecordCheck(dir, CHANGE), { change: CHANGE, result: 'fail' });
    assert.equal(fs.readFileSync(path.join(target, 'proposal.md'), 'utf8'), 'stay\n');

    writeRecord(dir, {
      change: CHANGE,
      branch: `factory/${CHANGE}`,
      pullRequest: { url: 'https://github.com/example/test/pull/23' },
    });
    assert.equal(isDeliverableChange(dir, CHANGE), false);
    assert.equal(stage1ExitRecordCheck(dir, CHANGE).result, 'fail');

    writeRecord(dir, {
      change: CHANGE,
      branch: `factory/${CHANGE}`,
      pullRequest: { number: 23 },
    });
    assert.equal(isDeliverableChange(dir, CHANGE), false);

    writeRecord(dir, {
      change: CHANGE,
      branch: `factory/${CHANGE}`,
      pullRequest: { number: 23, url: '' },
    });
    assert.equal(isDeliverableChange(dir, CHANGE), false);

    writeRecord(dir, {
      change: CHANGE,
      branch: `cursor/${CHANGE}`,
      pullRequest: { number: 23, url: 'https://github.com/example/test/pull/23' },
    });
    assert.equal(isDeliverableChange(dir, CHANGE), false);
    assert.equal(stage1ExitRecordCheck(dir, CHANGE).result, 'fail');
    assert.equal(fs.existsSync(target), true);
  } finally {
    cleanup(dir);
  }
});

test('a factory branch record with a positive number and URL is deliverable', () => {
  const dir = tempProject();
  try {
    const target = changeDir(dir);
    writeRecord(dir, {
      change: CHANGE,
      branch: `factory/${CHANGE}`,
      pullRequest: {
        number: 23,
        url: 'https://github.com/example/test/pull/23',
      },
    });
    assert.equal(isDeliverableChange(dir, CHANGE), true);
    assert.deepEqual(stage1ExitRecordCheck(dir, CHANGE), { change: CHANGE, result: 'pass' });
    assert.equal(fs.readFileSync(path.join(target, 'proposal.md'), 'utf8'), 'stay\n');
  } finally {
    cleanup(dir);
  }
});

test('archive guidance runs the deliverable check before moving a change', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const rel of [
      '.cursor/skills/factory-coordinator/SKILL.md',
      '.cursor/skills/factory-openspec/SKILL.md',
    ]) {
      const text = fs.readFileSync(path.join(dir, rel), 'utf8');
      assert.match(text, /run `isDeliverableChange` first/);
      assert.match(text, /do not move `openspec\/changes\/<change>\/`/);
    }
  } finally {
    cleanup(dir);
  }
});
