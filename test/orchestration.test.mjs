import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { getAttempt } from '../src/lib/attempt.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'idefactory-test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'idefactory-test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

/** Init git if needed and commit the full worktree so verifyRun can record a pass. */
function ensureCleanGitCommit(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    git(dir, ['init']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'idefactory-test']);
  }
  git(dir, ['add', '-A']);
  const porcelain = spawnSync('git', ['status', '--porcelain'], {
    cwd: dir,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(porcelain.status, 0, porcelain.stderr || porcelain.stdout);
  if (porcelain.stdout.trim().length > 0) {
    git(dir, ['commit', '-m', 'checkpoint']);
  }
  return git(dir, ['rev-parse', 'HEAD']);
}

function writeCheckRegistry(dir, exitByKind) {
  const checks = {};
  for (const [kind, code] of Object.entries(exitByKind)) {
    checks[kind] = {
      argv: [process.execPath, '-e', `process.exit(${code})`],
      cwdPolicy: 'project',
      timeoutMs: 30_000,
      artifacts: [],
    };
  }
  fs.writeFileSync(
    path.join(dir, '.factory/checks.json'),
    `${JSON.stringify({ schemaVersion: 1, checks }, null, 2)}\n`,
  );
}

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

async function recordRed(dir, attemptId, kinds = { unit: 1 }) {
  writeCheckRegistry(dir, kinds);
  const kind = Object.keys(kinds)[0];
  const result = await idefactory(dir, [
    'verify', 'run', attemptId, '--check', kind, '--red',
  ]);
  assert.equal(result.code, 0, result.err + result.out);
  assert.ok(getAttempt(dir, attemptId).evidence.red, 'verify --red must store red evidence');
}

async function recordPassingChecks(dir, attemptId, kinds = { unit: 0 }) {
  writeCheckRegistry(dir, kinds);
  ensureCleanGitCommit(dir);
  for (const kind of Object.keys(kinds)) {
    const result = await idefactory(dir, [
      'verify', 'run', attemptId, '--check', kind,
    ]);
    assert.equal(result.code, 0, result.err + result.out);
    const record = getAttempt(dir, attemptId).evidence.verification
      .find((entry) => entry.kind === kind);
    assert.equal(record?.passed, true, `verify run must store a pass for ${kind}`);
  }
}

async function advanceToVerifying(dir, attemptId, {
  implementerId = 'engineer-1',
  passChecks = { unit: 0 },
} = {}) {
  await recordRed(dir, attemptId, { unit: 1 });
  assert.equal((await idefactory(dir, [
    'attempt', 'transition', attemptId, 'implementing',
    '--evidence', JSON.stringify({ implementerId }),
  ])).code, 0);
  assert.equal((await idefactory(dir, [
    'attempt', 'transition', attemptId, 'red-confirmed',
    '--evidence', JSON.stringify({}),
  ])).code, 0);
  if (passChecks && Object.keys(passChecks).length > 0) {
    await recordPassingChecks(dir, attemptId, passChecks);
  }
  assert.equal((await idefactory(dir, [
    'attempt', 'transition', attemptId, 'verifying',
    '--evidence', JSON.stringify({}),
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
    // Routing depends on work-item checks/profile and verifying state, not forged evidence.
    await advanceToVerifying(dir, attempt.id, { passChecks: {} });
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

test('attempt transition rejects caller-supplied check results and still accepts reviewer notes', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    const attempt = JSON.parse(started.out);

    async function assertRejectedUnchanged(nextState, evidence) {
      const before = structuredClone(getAttempt(dir, attempt.id));
      const beforeRaw = fs.readFileSync(
        path.join(dir, '.factory/attempts', `${attempt.id}.json`),
        'utf8',
      );
      const result = await idefactory(dir, [
        'attempt', 'transition', attempt.id, nextState,
        '--evidence', JSON.stringify(evidence),
      ]);
      assert.notEqual(result.code, 0, `expected reject for keys ${Object.keys(evidence).join(',')}`);
      assert.match(result.err, /red|verification|security|check result|evidence/i);
      assert.deepEqual(getAttempt(dir, attempt.id), before);
      assert.equal(
        fs.readFileSync(path.join(dir, '.factory/attempts', `${attempt.id}.json`), 'utf8'),
        beforeRaw,
      );
    }

    await assertRejectedUnchanged('implementing', {
      implementerId: 'engineer-1',
      verification: [{ kind: 'unit', command: 'npm test', passed: true }],
    });
    await assertRejectedUnchanged('implementing', {
      implementerId: 'engineer-1',
      security: [{ kind: 'threat-review', command: 'threat-review', passed: true }],
    });
    await assertRejectedUnchanged('implementing', {
      implementerId: 'engineer-1',
      red: { command: 'npm test', passed: false },
    });

    await recordRed(dir, attempt.id, { unit: 1 });
    assert.equal((await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'implementing',
      '--evidence', JSON.stringify({ implementerId: 'engineer-1' }),
    ])).code, 0);

    // Payload red is rejected even when it looks valid and stored red already exists.
    await assertRejectedUnchanged('red-confirmed', {
      red: { command: 'npm test', passed: false, kind: 'unit', exitCode: 1 },
    });

    assert.equal((await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'red-confirmed',
      '--evidence', JSON.stringify({}),
    ])).code, 0);
    await recordPassingChecks(dir, attempt.id, { unit: 0 });
    assert.equal((await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'verifying',
      '--evidence', JSON.stringify({}),
    ])).code, 0);
    assert.equal((await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'awaiting-review',
      '--evidence', JSON.stringify({}),
    ])).code, 0);

    await assertRejectedUnchanged('accepted', {
      reviewerId: 'reviewer-1',
      verdict: 'ACCEPT',
      notes: 'looks good',
      verification: [{ kind: 'unit', passed: true }],
    });

    const accepted = await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'accepted',
      '--evidence', JSON.stringify({
        reviewerId: 'reviewer-1',
        verdict: 'ACCEPT',
        notes: 'reviewer notes only',
      }),
    ]);
    assert.equal(accepted.code, 0, accepted.err);
    const stored = getAttempt(dir, attempt.id);
    assert.equal(stored.state, 'accepted');
    assert.equal(stored.reviewerId, 'reviewer-1');
    assert.equal(stored.evidence.review?.notes, 'reviewer notes only');
    assert.equal(stored.implementerId, 'engineer-1');
    assert.ok(stored.evidence.red);
    assert.equal(stored.evidence.red.issuer, 'cli');
    assert.notEqual(stored.evidence.red.passed, true);
    assert.equal(stored.evidence.verification.length, 1);
    assert.equal(stored.evidence.verification[0].passed, true);
    assert.equal(stored.evidence.verification[0].issuer, 'cli');
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
    await advanceToVerifying(dir, attempt.id, {
      implementerId: 'same-agent',
      passChecks: {},
    });
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
    await advanceToVerifying(dir, attempt.id, { passChecks: {} });
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
