import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { getAttempt } from '../src/lib/attempt.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

async function seedChange(dir) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), [
    '- [ ] 1.1 Add parser',
    '  factory:',
    '    kind: general',
    '    checks: [unit]',
    '    verificationProfile: frontend-low',
    '    roles: [engineer, reviewer, scribe]',
    '',
  ].join('\n'));
  assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
}

async function acceptAttempt(dir, attemptId) {
  await idefactory(dir, [
    'attempt', 'transition', attemptId, 'implementing',
    '--evidence', JSON.stringify({ implementerId: 'engineer-1' }),
  ]);
  await idefactory(dir, [
    'attempt', 'transition', attemptId, 'red-confirmed',
    '--evidence', JSON.stringify({ red: { command: 'npm test', passed: false } }),
  ]);
  await idefactory(dir, [
    'attempt', 'transition', attemptId, 'verifying',
    '--evidence', JSON.stringify({ verification: [{ kind: 'unit', command: 'npm test', passed: true }] }),
  ]);
  await idefactory(dir, [
    'attempt', 'transition', attemptId, 'awaiting-review',
    '--evidence', JSON.stringify({}),
  ]);
  const accepted = await idefactory(dir, [
    'attempt', 'transition', attemptId, 'accepted',
    '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict: 'ACCEPT' }),
  ]);
  assert.equal(accepted.code, 0, accepted.err);
}

test('run emits needs-agent orchestration request without launching a model', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir);
    const result = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(result.code, 2, result.err + result.out);
    assert.match(result.out, /Orchestration request/);
    assert.match(result.out, /"action": "agent-step"/);
    assert.match(result.out, /modelProfile/);
  } finally {
    cleanup(dir);
  }
});

test('complete refuses same implementer and reviewer', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    const attempt = JSON.parse(started.out);
    await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'implementing',
      '--evidence', JSON.stringify({ implementerId: 'same-agent' }),
    ]);
    await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'red-confirmed',
      '--evidence', JSON.stringify({ red: { command: 'npm test', passed: false } }),
    ]);
    await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'verifying',
      '--evidence', JSON.stringify({ verification: [{ kind: 'unit', command: 'npm test', passed: true }] }),
    ]);
    await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'awaiting-review',
      '--evidence', '{}',
    ]);
    await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'accepted',
      '--evidence', JSON.stringify({ reviewerId: 'same-agent', verdict: 'ACCEPT' }),
    ]);
    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attempt.id]);
    assert.notEqual(done.code, 0);
    assert.match(done.err, /reviewer must differ/i);
    assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'in_progress');
  } finally {
    cleanup(dir);
  }
});

test('complete refuses missing verification evidence', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const attempt = JSON.parse(started.out);
    await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'implementing',
      '--evidence', JSON.stringify({ implementerId: 'engineer-1' }),
    ]);
    await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'red-confirmed',
      '--evidence', JSON.stringify({ red: { command: 'npm test', passed: false } }),
    ]);
    await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'verifying',
      '--evidence', JSON.stringify({ verification: [] }),
    ]);
    await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'awaiting-review',
      '--evidence', '{}',
    ]);
    await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'accepted',
      '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict: 'ACCEPT' }),
    ]);
    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attempt.id]);
    assert.notEqual(done.code, 0);
    assert.match(done.err, /Missing passing check/i);
  } finally {
    cleanup(dir);
  }
});

test('complete finalizes work item and OpenSpec checkbox', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const attempt = JSON.parse(started.out);
    await acceptAttempt(dir, attempt.id);
    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attempt.id]);
    assert.equal(done.code, 0, done.err);
    assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'done');
    assert.equal(getAttempt(dir, attempt.id).state, 'finalized');
    const tasks = fs.readFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), 'utf8');
    assert.match(tasks, /- \[x\] 1\.1 Add parser/);
  } finally {
    cleanup(dir);
  }
});

test('lockout blocks complete', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const attempt = JSON.parse(started.out);
    await acceptAttempt(dir, attempt.id);
    assert.equal((await idefactory(dir, [
      'lockout', '--agent', 'engineer-1', '--reviewer', 'reviewer', '--reason', 'style',
    ])).code, 0);
    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attempt.id]);
    assert.notEqual(done.code, 0);
    assert.match(done.err, /lockout/i);
  } finally {
    cleanup(dir);
  }
});

test('HALT blocks run', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir);
    fs.writeFileSync(path.join(dir, 'HALT'), 'stop\n');
    const result = await idefactory(dir, ['run', '--change', 'demo']);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /HALT/);
  } finally {
    cleanup(dir);
  }
});

test('illegal attempt transition fails', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const attempt = JSON.parse(started.out);
    const bad = await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'accepted',
      '--evidence', JSON.stringify({ reviewerId: 'reviewer-1' }),
    ]);
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /Illegal transition/i);
  } finally {
    cleanup(dir);
  }
});
