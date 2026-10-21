import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { getAttempt } from '../src/lib/attempt.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

async function seedChange(dir, tasksBody) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'openspec/changes/demo/tasks.md'),
    tasksBody || [
      '- [ ] 1.1 Add parser',
      '  factory:',
      '    kind: general',
      '    checks: [unit]',
      '    verificationProfile: frontend-low',
      '    roles: [engineer, reviewer, scribe]',
      '',
    ].join('\n'),
  );
  assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
}

async function advanceToVerifying(dir, attemptId, {
  implementerId = 'engineer-1',
  verification = [{ kind: 'unit', command: 'npm test', passed: true }],
} = {}) {
  assert.equal((await idefactory(dir, [
    'attempt', 'transition', attemptId, 'implementing',
    '--evidence', JSON.stringify({ implementerId }),
  ])).code, 0);
  assert.equal((await idefactory(dir, [
    'attempt', 'transition', attemptId, 'red-confirmed',
    '--evidence', JSON.stringify({ red: { command: 'npm test', passed: false } }),
  ])).code, 0);
  assert.equal((await idefactory(dir, [
    'attempt', 'transition', attemptId, 'verifying',
    '--evidence', JSON.stringify({ verification }),
  ])).code, 0);
}

async function acceptAttempt(dir, attemptId) {
  await advanceToVerifying(dir, attemptId);
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

function parseOrchestrationJson(out) {
  const match = out.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(match, 'orchestration request must include a json block');
  return JSON.parse(match[1]);
}

test('run emits one-role orchestration request without launching a model', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir);
    const result = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(result.code, 2, result.err + result.out);
    assert.match(result.out, /Orchestration request/);
    assert.match(result.out, /^Role: engineer$/m);
    assert.match(result.out, /\.factory\/agents\/engineer\/charter\.md/);
    assert.match(result.out, /\.factory\/agents\/engineer\/history\.md/);
    assert.doesNotMatch(result.out, /\.factory\/agents\/reviewer\/charter\.md/);
    assert.doesNotMatch(result.out, /\.factory\/agents\/scribe\/charter\.md/);
    assert.doesNotMatch(result.out, /\.factory\/agents\/lead\/charter\.md/);
    const request = parseOrchestrationJson(result.out);
    assert.equal(request.action, 'agent-step');
    assert.equal(request.role, 'engineer');
    assert.ok(request.modelProfile);
    assert.equal(Object.keys(request).filter((key) => key === 'role').length, 1);
  } finally {
    cleanup(dir);
  }
});

test('security-sensitive verification routes to security-reviewer', async () => {
  const dir = tempProject();
  try {
    // Runtime routes on securityProfile or security-patterned checks (e.g. threat-review),
    // not on verificationProfile alone — see threat notes for this attempt.
    await seedChange(dir, [
      '- [ ] 1.1 Add parser',
      '  factory:',
      '    kind: general',
      '    checks: [unit, threat-review]',
      '    verificationProfile: security-sensitive',
      '    roles: [engineer, security-reviewer, reviewer, scribe]',
      '',
    ].join('\n'));
    const item = getWorkItem(dir, 'demo', '1.1');
    assert.ok(
      (item.factory?.checks || []).includes('threat-review')
        || item.factory?.securityProfile === 'security-sensitive',
      'fixture must trigger the security-reviewer stage via check or securityProfile',
    );
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    const attempt = JSON.parse(started.out);
    await advanceToVerifying(dir, attempt.id, {
      verification: [
        { kind: 'unit', command: 'npm test', passed: true },
        { kind: 'threat-review', command: 'threat-review', passed: true },
      ],
    });
    const result = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(result.code, 2, result.err + result.out);
    assert.match(result.out, /^Role: security-reviewer$/m);
    assert.match(result.out, /\.factory\/agents\/security-reviewer\/charter\.md/);
    assert.doesNotMatch(result.out, /\.factory\/agents\/reviewer\/charter\.md/);
    const request = parseOrchestrationJson(result.out);
    assert.equal(request.role, 'security-reviewer');
    assert.equal(request.state, 'verifying');
    assert.equal(request.nextState, 'security-checking');
    assert.equal(request.verificationProfile, 'security-sensitive');
  } finally {
    cleanup(dir);
  }
});

test('illegal attempt transition from assigned to accepted fails', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const attempt = JSON.parse(started.out);
    assert.equal(attempt.state, 'assigned');
    const bad = await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'accepted',
      '--evidence', JSON.stringify({ reviewerId: 'reviewer-1' }),
    ]);
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /Illegal transition/i);
    assert.equal(getAttempt(dir, attempt.id).state, 'assigned');
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
    await advanceToVerifying(dir, attempt.id, { implementerId: 'same-agent' });
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
    await advanceToVerifying(dir, attempt.id, { verification: [] });
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
    assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'in_progress');
    assert.notEqual(getAttempt(dir, attempt.id).state, 'finalized');
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

test('HALT blocks run, attempt mutations, and complete without agent requests', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    const attempt = JSON.parse(started.out);
    await acceptAttempt(dir, attempt.id);

    fs.writeFileSync(path.join(dir, 'HALT'), 'stop\n');

    const haltedRun = await idefactory(dir, ['run', '--change', 'demo']);
    assert.notEqual(haltedRun.code, 0);
    assert.match(haltedRun.err, /HALT/);
    assert.doesNotMatch(haltedRun.out, /Orchestration request/);
    assert.doesNotMatch(haltedRun.out, /"action": "agent-step"/);

    const haltedTransition = await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'finalized',
      '--evidence', JSON.stringify({ completed: true }),
    ]);
    assert.notEqual(haltedTransition.code, 0);
    assert.match(haltedTransition.err, /HALT/);

    const haltedComplete = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attempt.id]);
    assert.notEqual(haltedComplete.code, 0);
    assert.match(haltedComplete.err, /HALT/);
    assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'in_progress');
    assert.equal(getAttempt(dir, attempt.id).state, 'accepted');
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
