import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAttempt } from '../src/lib/attempt.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { BASIC_TASK, commitAll, git, seedChange } from './factory-project.mjs';

async function start(dir) {
  const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
  assert.equal(started.code, 0, started.err + started.out);
  return JSON.parse(started.out).id;
}

test('starting an attempt in a git project records the commit as its start revision', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    const head = commitAll(dir);
    const attempt = getAttempt(dir, await start(dir));
    assert.equal(attempt.startRevision, head);
    assert.equal(attempt.evidence.baseRev, null);
    assert.equal(git(dir, ['rev-parse', 'HEAD']), head);
  } finally {
    cleanup(dir);
  }
});

test('starting an attempt where git has no commit records a null start revision', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    const attempt = getAttempt(dir, await start(dir));
    assert.equal(attempt.startRevision, null);
  } finally {
    cleanup(dir);
  }
});
