import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { attemptPath, getAttempt } from '../src/lib/attempt.mjs';
import {
  bindRedException,
  exceptionFilePath,
  redSatisfaction,
  reuseRed,
  waiveRed,
  WAIVER_WARNING_SENTENCE,
} from '../src/lib/red-exceptions.mjs';
import { renderWorkPacket } from '../src/lib/queue.mjs';
import { resolveGitBinding } from '../src/lib/verification-evidence.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

function writeRegistry(dir, exitCode) {
  fs.writeFileSync(
    path.join(dir, '.factory/checks.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      checks: {
        unit: {
          argv: [process.execPath, '-e', `process.exit(${exitCode})`],
          cwdPolicy: 'project',
          timeoutMs: 30_000,
          artifacts: [],
        },
      },
    }, null, 2)}\n`,
  );
}

function ensureCleanGitCommit(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    git(dir, ['init']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'idefactory-test']);
  }
  const ignore = path.join(dir, '.gitignore');
  const lines = [
    '.factory/attempts/*',
    '!.factory/attempts/.gitkeep',
    '.factory/work/',
    '.factory/ledger.jsonl',
    '.factory/orchestration/*',
    '!.factory/orchestration/.gitkeep',
  ];
  fs.writeFileSync(ignore, `${lines.join('\n')}\n`);
  git(dir, ['add', '-A']);
  const porcelain = spawnSync('git', ['status', '--porcelain', '--', '.', ':!.factory/exceptions'], {
    cwd: dir,
    encoding: 'utf8',
    shell: false,
  });
  if (porcelain.stdout.trim().length > 0) git(dir, ['commit', '-m', 'checkpoint']);
  return git(dir, ['rev-parse', 'HEAD']);
}

async function recordPass(dir, attemptId) {
  writeRegistry(dir, 0);
  ensureCleanGitCommit(dir);
  const result = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit']);
  assert.equal(result.code, 0, result.err + result.out);
}

async function toImplementing(dir, attemptId, implementerId = 'engineer-1') {
  const result = await idefactory(dir, [
    'attempt', 'transition', attemptId, 'implementing',
    '--evidence', JSON.stringify({ implementerId }),
  ]);
  assert.equal(result.code, 0, result.err);
}

function transition(dir, attemptId, state, evidence = {}) {
  return idefactory(dir, [
    'attempt', 'transition', attemptId, state, '--evidence', JSON.stringify(evidence),
  ]);
}

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

function setPolicyVersion(dir, version) {
  const configPath = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.governance.policyVersion = version;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function seedAttempt(dir, checks = ['unit']) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  setPolicyVersion(dir, 1);
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'openspec/changes/demo/tasks.md'),
    [
      '- [ ] 1.1 Add parser',
      '  factory:',
      '    kind: general',
      `    checks: [${checks.join(', ')}]`,
      '    verificationProfile: cli',
      '    roles: [engineer, reviewer, scribe]',
      '',
    ].join('\n'),
  );
  assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
  const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
  assert.equal(started.code, 0, started.err);
  return JSON.parse(started.out);
}

function exceptionRecord(attempt, overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'exc-1',
    type: 'waiver',
    change: attempt.change,
    task: attempt.taskId,
    attemptId: attempt.id,
    kind: 'unit',
    approver: 'human-1',
    reason: 'test exception',
    issuance: new Date().toISOString(),
    policyVersion: 1,
    sourceRevision: 'abc123',
    acknowledgedNotStuck: false,
    ...overrides,
  };
}

function writeCliRed(dir, attemptId, kind = 'unit') {
  const file = attemptPath(dir, attemptId);
  const attempt = JSON.parse(fs.readFileSync(file, 'utf8'));
  attempt.evidence.reds = {
    ...(attempt.evidence.reds || {}),
    [kind]: {
      kind,
      issuer: 'cli',
      exitCode: 1,
      passed: false,
      attemptId,
    },
  };
  fs.writeFileSync(file, `${JSON.stringify(attempt, null, 2)}\n`);
}

test('redSatisfaction is cli for a stored failing CLI red and missing for none', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    assert.equal(redSatisfaction(dir, getAttempt(dir, started.id), 'unit'), 'missing');
    writeCliRed(dir, started.id);
    assert.equal(redSatisfaction(dir, getAttempt(dir, started.id), 'unit'), 'cli');
    assert.equal(redSatisfaction(dir, getAttempt(dir, started.id), 'integration'), 'missing');
  } finally {
    cleanup(dir);
  }
});

test('a bound waiver or reuse exception satisfies red for its kind only', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    const attempt = getAttempt(dir, started.id);
    bindRedException(dir, attempt.id, exceptionRecord(attempt, { type: 'waiver' }));
    const bound = getAttempt(dir, attempt.id);
    assert.equal(redSatisfaction(dir, bound, 'unit'), 'waiver');
    assert.equal(redSatisfaction(dir, bound, 'integration'), 'missing');
    assert.equal(bound.evidence.redExceptions.unit.type, 'waiver');
    assert.match(bound.evidence.redExceptions.unit.digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(bound.evidence.reds ?? null, null, 'exception must not be stored as a CLI red');
    assert.equal(fs.existsSync(exceptionFilePath(dir, 'exc-1')), true);

    const second = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const next = getAttempt(dir, JSON.parse(second.out).id);
    bindRedException(dir, next.id, exceptionRecord(next, {
      id: 'exc-2',
      type: 'reuse',
      source: { attemptId: attempt.id },
    }));
    assert.equal(redSatisfaction(dir, getAttempt(dir, next.id), 'unit'), 'reuse');
  } finally {
    cleanup(dir);
  }
});

test('an edited, deleted, or other-attempt exception file does not satisfy red', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    const attempt = getAttempt(dir, started.id);
    bindRedException(dir, attempt.id, exceptionRecord(attempt));
    const file = exceptionFilePath(dir, 'exc-1');
    const original = fs.readFileSync(file, 'utf8');

    fs.writeFileSync(file, original.replace('test exception', 'changed reason'));
    assert.equal(redSatisfaction(dir, getAttempt(dir, attempt.id), 'unit'), 'missing');

    fs.writeFileSync(file, original);
    assert.equal(redSatisfaction(dir, getAttempt(dir, attempt.id), 'unit'), 'waiver');

    const second = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const other = getAttempt(dir, JSON.parse(second.out).id);
    const pointer = getAttempt(dir, attempt.id).evidence.redExceptions;
    const otherFile = attemptPath(dir, other.id);
    const otherStored = JSON.parse(fs.readFileSync(otherFile, 'utf8'));
    otherStored.evidence.redExceptions = pointer;
    fs.writeFileSync(otherFile, `${JSON.stringify(otherStored, null, 2)}\n`);
    assert.equal(redSatisfaction(dir, getAttempt(dir, other.id), 'unit'), 'missing');

    fs.rmSync(file);
    assert.equal(redSatisfaction(dir, getAttempt(dir, attempt.id), 'unit'), 'missing');
  } finally {
    cleanup(dir);
  }
});

test('a second exception for the same attempt and kind is refused and keeps the first', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    const attempt = getAttempt(dir, started.id);
    bindRedException(dir, attempt.id, exceptionRecord(attempt));
    const before = fs.readFileSync(exceptionFilePath(dir, 'exc-1'), 'utf8');
    assert.throws(
      () => bindRedException(dir, attempt.id, exceptionRecord(attempt, { id: 'exc-2' })),
      /already has an exception/,
    );
    assert.equal(fs.existsSync(exceptionFilePath(dir, 'exc-2')), false);
    assert.equal(fs.readFileSync(exceptionFilePath(dir, 'exc-1'), 'utf8'), before);
    assert.throws(
      () => bindRedException(dir, attempt.id, exceptionRecord(attempt, { type: 'bogus', kind: 'integration', id: 'exc-3' })),
      /type/,
    );
  } finally {
    cleanup(dir);
  }
});

test('uncommitted exception files stay run-state but product changes do not', () => {
  const dir = tempProject();
  try {
    git(dir, ['init']);
    fs.writeFileSync(path.join(dir, 'README.md'), '# t\n');
    fs.mkdirSync(path.join(dir, '.factory'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.factory/config.json'), '{}\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-m', 'init']);
    fs.mkdirSync(path.join(dir, '.factory/exceptions/red'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.factory/exceptions/red/x.json'), '{}\n');
    assert.equal(resolveGitBinding(dir).worktreeClean, true);
    fs.writeFileSync(path.join(dir, 'product.js'), 'x\n');
    assert.equal(resolveGitBinding(dir).worktreeClean, false);
  } finally {
    cleanup(dir);
  }
});

test('verifying accepts a valid exception and rejects a kind with neither red nor exception', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    await toImplementing(dir, started.id);
    await recordPass(dir, started.id);

    const refused = await transition(dir, started.id, 'verifying');
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /verifying requires a recorded failing CLI red for: unit/);
    assert.equal(getAttempt(dir, started.id).state, 'implementing');

    bindRedException(dir, started.id, exceptionRecord(getAttempt(dir, started.id)));
    const ok = await transition(dir, started.id, 'verifying');
    assert.equal(ok.code, 0, ok.err);
    const stored = getAttempt(dir, started.id);
    assert.equal(stored.state, 'verifying');
    assert.equal(stored.evidence.reds ?? null, null);
  } finally {
    cleanup(dir);
  }
});

test('verifying rejects an altered exception', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    await toImplementing(dir, started.id);
    await recordPass(dir, started.id);
    bindRedException(dir, started.id, exceptionRecord(getAttempt(dir, started.id)));
    const file = exceptionFilePath(dir, 'exc-1');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('test exception', 'edited'));
    const refused = await transition(dir, started.id, 'verifying');
    assert.notEqual(refused.code, 0);
    assert.equal(getAttempt(dir, started.id).state, 'implementing');
  } finally {
    cleanup(dir);
  }
});

test('red-confirmed still needs a genuine CLI red', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    await toImplementing(dir, started.id);
    bindRedException(dir, started.id, exceptionRecord(getAttempt(dir, started.id)));
    const refused = await transition(dir, started.id, 'red-confirmed');
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /red-confirmed requires stored evidence\.red/);
    assert.equal(getAttempt(dir, started.id).state, 'implementing');
  } finally {
    cleanup(dir);
  }
});

test('an attempt transition rejects a caller-supplied exception object', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    await toImplementing(dir, started.id);
    await recordPass(dir, started.id);
    const refused = await transition(dir, started.id, 'verifying', {
      redExceptions: { unit: { id: 'x', type: 'waiver', digest: 'sha256:0' } },
    });
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /caller-supplied/);
    const stored = getAttempt(dir, started.id);
    assert.equal(stored.state, 'implementing');
    assert.equal(stored.evidence.redExceptions ?? null, null);
  } finally {
    cleanup(dir);
  }
});

async function acceptWithException(dir, attemptId) {
  await toImplementing(dir, attemptId);
  await recordPass(dir, attemptId);
  bindRedException(dir, attemptId, exceptionRecord(getAttempt(dir, attemptId)));
  assert.equal((await transition(dir, attemptId, 'verifying')).code, 0);
  assert.equal((await transition(dir, attemptId, 'awaiting-review')).code, 0);
  const accepted = await transition(dir, attemptId, 'accepted', {
    reviewerId: 'reviewer-1',
    verdict: 'ACCEPT',
  });
  assert.equal(accepted.code, 0, accepted.err);
}

test('complete accepts a valid exception in place of a CLI red', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    await acceptWithException(dir, started.id);
    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', started.id]);
    assert.equal(done.code, 0, done.err + done.out);
    const stored = getAttempt(dir, started.id);
    assert.equal(stored.state, 'finalized');
    assert.equal(stored.evidence.reds ?? null, null);
  } finally {
    cleanup(dir);
  }
});

test('complete fails when the only red is an altered exception', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    await acceptWithException(dir, started.id);
    const file = exceptionFilePath(dir, 'exc-1');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('test exception', 'edited'));
    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', started.id]);
    assert.notEqual(done.code, 0);
    assert.match(done.err, /complete requires a recorded failing CLI red or red exception for: unit/);
    assert.notEqual(getAttempt(dir, started.id).state, 'finalized');
  } finally {
    cleanup(dir);
  }
});

test('complete still rejects a code attempt with neither a red nor an exception', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    await acceptWithException(dir, started.id);
    const file = attemptPath(dir, started.id);
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete stored.evidence.redExceptions;
    fs.writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`);
    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', started.id]);
    assert.notEqual(done.code, 0);
    assert.match(done.err, /complete requires a recorded failing CLI red/);
  } finally {
    cleanup(dir);
  }
});

const FLAG_REGISTRY = {
  schemaVersion: 1,
  checks: {
    unit: {
      argv: [process.execPath, '-e', "process.exit(require('fs').existsSync('fixed.flag') ? 0 : 1)"],
      cwdPolicy: 'project',
      timeoutMs: 30_000,
      artifacts: [],
    },
  },
};

function writeFlagRegistry(dir) {
  fs.writeFileSync(path.join(dir, '.factory/checks.json'), `${JSON.stringify(FLAG_REGISTRY, null, 2)}\n`);
}

/** Attempt A: genuine CLI red, then rejected by a reviewer. */
async function rejectedSource(dir) {
  const first = await seedAttempt(dir);
  writeFlagRegistry(dir);
  ensureCleanGitCommit(dir);
  await toImplementing(dir, first.id, 'engineer-1');
  const red = await idefactory(dir, ['verify', 'run', first.id, '--check', 'unit', '--red']);
  assert.equal(red.code, 0, red.err + red.out);
  fs.writeFileSync(path.join(dir, 'fixed.flag'), 'fixed\n');
  ensureCleanGitCommit(dir);
  const pass = await idefactory(dir, ['verify', 'run', first.id, '--check', 'unit']);
  assert.equal(pass.code, 0, pass.err + pass.out);
  assert.equal((await transition(dir, first.id, 'verifying')).code, 0);
  assert.equal((await transition(dir, first.id, 'awaiting-review')).code, 0);
  const rejected = await transition(dir, first.id, 'rejected', {
    reviewerId: 'reviewer-1',
    notes: 'attestation recorded on a dirty workspace',
  });
  assert.equal(rejected.code, 0, rejected.err);
  return getAttempt(dir, first.id);
}

/** Attempt B: replacement that is already green on a clean HEAD. */
async function greenTarget(dir, { pass = true } = {}) {
  const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
  assert.equal(started.code, 0, started.err);
  const target = JSON.parse(started.out);
  await toImplementing(dir, target.id, 'engineer-2');
  fs.writeFileSync(path.join(dir, 'fixed.flag'), 'fixed\n');
  ensureCleanGitCommit(dir);
  if (pass) {
    const result = await idefactory(dir, ['verify', 'run', target.id, '--check', 'unit']);
    assert.equal(result.code, 0, result.err + result.out);
  }
  return getAttempt(dir, target.id);
}

function reuseOptions(source, target, overrides = {}) {
  return {
    targetAttemptId: target.id,
    sourceAttemptId: source.id,
    kinds: ['unit'],
    approver: 'human-1',
    reason: 'dirty-workspace rejection only',
    ...overrides,
  };
}

function fileBytes(file) {
  return fs.readFileSync(file, 'utf8');
}

test('eligible reuse records one exception and leaves the source attempt unchanged', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    const sourceBefore = fileBytes(attemptPath(dir, source.id));
    const result = reuseRed(dir, reuseOptions(source, target));
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].type, 'reuse');
    const stored = getAttempt(dir, target.id);
    assert.equal(redSatisfaction(dir, stored, 'unit'), 'reuse');
    assert.equal(stored.evidence.reds ?? null, null);
    assert.equal(fileBytes(attemptPath(dir, source.id)), sourceBefore);
  } finally {
    cleanup(dir);
  }
});

async function assertReuseRefused(dir, source, target, options, pattern) {
  const targetBefore = fileBytes(attemptPath(dir, target.id));
  assert.throws(() => reuseRed(dir, options), pattern);
  assert.equal(fileBytes(attemptPath(dir, target.id)), targetBefore);
  const exceptionsDir = path.join(dir, '.factory/exceptions/red');
  assert.equal(fs.existsSync(exceptionsDir) ? fs.readdirSync(exceptionsDir).length : 0, 0);
}

test('reuse refuses a source that is not rejected', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    const file = attemptPath(dir, source.id);
    const edited = JSON.parse(fileBytes(file));
    edited.state = 'verifying';
    fs.writeFileSync(file, `${JSON.stringify(edited, null, 2)}\n`);
    await assertReuseRefused(dir, source, target, reuseOptions(source, target), /rejected/);
  } finally {
    cleanup(dir);
  }
});

test('reuse refuses a source with no genuine red for the kind', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    const file = attemptPath(dir, source.id);
    const edited = JSON.parse(fileBytes(file));
    delete edited.evidence.reds;
    fs.writeFileSync(file, `${JSON.stringify(edited, null, 2)}\n`);
    await assertReuseRefused(dir, source, target, reuseOptions(source, target), /failing CLI red/);

    const forged = JSON.parse(fileBytes(file));
    forged.evidence.reds = { unit: { kind: 'unit', issuer: 'import', exitCode: 1, attemptId: source.id } };
    fs.writeFileSync(file, `${JSON.stringify(forged, null, 2)}\n`);
    await assertReuseRefused(dir, source, target, reuseOptions(source, target), /failing CLI red/);
  } finally {
    cleanup(dir);
  }
});

test('reuse refuses a different task, a lightweight target, and a target already verifying', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);

    const targetFile = attemptPath(dir, target.id);
    const original = fileBytes(targetFile);
    const other = JSON.parse(original);
    other.taskId = '9.9';
    fs.writeFileSync(targetFile, `${JSON.stringify(other, null, 2)}\n`);
    await assertReuseRefused(dir, source, getAttempt(dir, target.id), reuseOptions(source, target), /same change and task/);
    fs.writeFileSync(targetFile, original);

    const verifying = JSON.parse(original);
    verifying.state = 'verifying';
    fs.writeFileSync(targetFile, `${JSON.stringify(verifying, null, 2)}\n`);
    await assertReuseRefused(dir, source, getAttempt(dir, target.id), reuseOptions(source, target), /before verifying/);
    fs.writeFileSync(targetFile, original);

    const itemFile = path.join(dir, '.factory/work/items/demo--1.1.json');
    const item = JSON.parse(fileBytes(itemFile));
    item.factory.taskType = 'lightweight';
    fs.writeFileSync(itemFile, `${JSON.stringify(item, null, 2)}\n`);
    await assertReuseRefused(dir, source, target, reuseOptions(source, target), /lightweight/);
  } finally {
    cleanup(dir);
  }
});

test('reuse refuses a kind the work item does not require', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    await assertReuseRefused(
      dir,
      source,
      target,
      reuseOptions(source, target, { kinds: ['integration'] }),
      /required test kind/,
    );
  } finally {
    cleanup(dir);
  }
});

test('reuse refuses a target that is not green on the current clean HEAD', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const notGreen = await greenTarget(dir, { pass: false });
    await assertReuseRefused(dir, source, notGreen, reuseOptions(source, notGreen), /passing CLI verification/);
  } finally {
    cleanup(dir);
  }
});

test('reuse refuses a stale pass after HEAD moves', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    fs.writeFileSync(path.join(dir, 'later.txt'), 'later\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-m', 'move head']);
    await assertReuseRefused(dir, source, target, reuseOptions(source, target), /passing CLI verification/);
  } finally {
    cleanup(dir);
  }
});

test('reuse refuses when the registered command changed since the red', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    const registry = JSON.parse(fileBytes(path.join(dir, '.factory/checks.json')));
    registry.checks.unit.argv = [process.execPath, '-e', 'process.exit(0)'];
    fs.writeFileSync(path.join(dir, '.factory/checks.json'), `${JSON.stringify(registry, null, 2)}\n`);
    await assertReuseRefused(dir, source, target, reuseOptions(source, target), /command digest/);
  } finally {
    cleanup(dir);
  }
});

test('reuse refuses a dirty worktree', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    fs.writeFileSync(path.join(dir, 'product.js'), 'dirty\n');
    await assertReuseRefused(dir, source, target, reuseOptions(source, target), /clean worktree/);
  } finally {
    cleanup(dir);
  }
});

test('reuse refuses an unknown or identical attempt', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    assert.throws(() => reuseRed(dir, reuseOptions(source, target, { sourceAttemptId: 'nope' })), /not found/);
    assert.throws(() => reuseRed(dir, reuseOptions(source, target, { sourceAttemptId: target.id })), /different/);
  } finally {
    cleanup(dir);
  }
});

test('reuse provenance names the source attempt and its red without claiming a run', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    const { files } = reuseRed(dir, reuseOptions(source, target));
    const record = JSON.parse(fileBytes(files[0]));
    const red = source.evidence.reds.unit;
    assert.equal(record.type, 'reuse');
    assert.equal(record.attemptId, target.id);
    assert.equal(record.change, 'demo');
    assert.equal(record.task, '1.1');
    assert.equal(record.kind, 'unit');
    assert.equal(record.approver, 'human-1');
    assert.equal(record.reason, 'dirty-workspace rejection only');
    assert.equal(record.policyVersion, 1);
    assert.match(record.issuance, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(record.sourceRevision, git(dir, ['rev-parse', 'HEAD']));
    assert.equal(record.source.attemptId, source.id);
    assert.equal(record.source.commandDigest, red.commandDigest);
    assert.equal(record.source.logDigest, red.logDigest);
    assert.equal(record.source.sourceRevision, red.sourceRevision);
    assert.equal(record.source.startedAt, red.startedAt);
    assert.equal(record.source.finishedAt, red.finishedAt);
    assert.match(record.source.recordDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal('exitCode' in record, false);
    assert.equal('issuer' in record, false);
    assert.equal(getAttempt(dir, target.id).evidence.reds ?? null, null);
  } finally {
    cleanup(dir);
  }
});

async function stuckAttempt(dir) {
  const started = await seedAttempt(dir);
  writeRegistry(dir, 0);
  ensureCleanGitCommit(dir);
  await toImplementing(dir, started.id);
  const vacuous = await idefactory(dir, ['verify', 'run', started.id, '--check', 'unit', '--red']);
  assert.notEqual(vacuous.code, 0);
  assert.match(vacuous.err, /vacuous-red/);
  return getAttempt(dir, started.id);
}

function waiveOptions(attempt, overrides = {}) {
  return {
    targetAttemptId: attempt.id,
    kinds: ['unit'],
    approver: 'human-1',
    reason: 'implementation already satisfies the requirement',
    ...overrides,
  };
}

test('waive after a recorded vacuous-red writes a waiver that states no red exists', async () => {
  const dir = tempProject();
  try {
    const attempt = await stuckAttempt(dir);
    const result = waiveRed(dir, waiveOptions(attempt));
    assert.equal(result.records.length, 1);
    const record = JSON.parse(fs.readFileSync(result.files[0], 'utf8'));
    assert.equal(record.type, 'waiver');
    assert.equal(record.kind, 'unit');
    assert.equal(record.attemptId, attempt.id);
    assert.equal(record.noRedExists, true);
    assert.equal(record.acknowledgedNotStuck, false);
    assert.equal(record.approver, 'human-1');
    assert.equal(record.reason, 'implementation already satisfies the requirement');
    assert.equal('source' in record, false);
    const stored = getAttempt(dir, attempt.id);
    assert.equal(redSatisfaction(dir, stored, 'unit'), 'waiver');
    assert.equal(stored.evidence.reds ?? null, null);
  } finally {
    cleanup(dir);
  }
});

test('waive refuses a missing reason and records nothing', async () => {
  const dir = tempProject();
  try {
    const attempt = await stuckAttempt(dir);
    const before = fileBytes(attemptPath(dir, attempt.id));
    for (const reason of ['', '   ', undefined]) {
      assert.throws(() => waiveRed(dir, waiveOptions(attempt, { reason })), /reason is required/);
    }
    assert.equal(fileBytes(attemptPath(dir, attempt.id)), before);
    assert.equal(fs.existsSync(path.join(dir, '.factory/exceptions/red')), false);
  } finally {
    cleanup(dir);
  }
});

test('waive before a stuck signal is refused with the warning unless acknowledged', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    ensureCleanGitCommit(dir);
    await toImplementing(dir, started.id);
    const attempt = getAttempt(dir, started.id);
    const before = fileBytes(attemptPath(dir, attempt.id));
    assert.throws(() => waiveRed(dir, waiveOptions(attempt)), (error) => {
      assert.ok(error.message.includes(WAIVER_WARNING_SENTENCE));
      assert.match(error.message, /--acknowledge-not-stuck/);
      assert.match(error.message, /red reuse/);
      return true;
    });
    assert.equal(fileBytes(attemptPath(dir, attempt.id)), before);
    assert.equal(fs.existsSync(path.join(dir, '.factory/exceptions/red')), false);

    const result = waiveRed(dir, waiveOptions(attempt, { acknowledgeNotStuck: true }));
    const record = JSON.parse(fs.readFileSync(result.files[0], 'utf8'));
    assert.equal(record.acknowledgedNotStuck, true);
    assert.equal(redSatisfaction(dir, getAttempt(dir, attempt.id), 'unit'), 'waiver');
  } finally {
    cleanup(dir);
  }
});

function setVerifier(dir) {
  const configPath = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.governance.policyVersion = 2;
  config.governance.principalVerifier = {
    provider: 'local',
    timeoutMs: 5000,
    argv: [
      process.execPath,
      '-e',
      "if (process.env.FACTORY_PRINCIPAL_SUBJECT !== 'human-1') process.exit(1); console.log(JSON.stringify({provider: process.env.FACTORY_PRINCIPAL_PROVIDER, subject: process.env.FACTORY_PRINCIPAL_SUBJECT, issuer: 'test'}))",
    ],
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function noExceptionFiles(dir) {
  const exceptionsPath = path.join(dir, '.factory/exceptions/red');
  return !fs.existsSync(exceptionsPath) || fs.readdirSync(exceptionsPath).length === 0;
}

test('waive refuses an approver equal to the implementer and an empty approver', async () => {
  const dir = tempProject();
  try {
    const attempt = await stuckAttempt(dir);
    assert.equal(attempt.implementerId, 'engineer-1');
    const before = fileBytes(attemptPath(dir, attempt.id));
    assert.throws(
      () => waiveRed(dir, waiveOptions(attempt, { approver: 'engineer-1' })),
      /differ from the implementer/,
    );
    for (const approver of ['', '  ', undefined]) {
      assert.throws(() => waiveRed(dir, waiveOptions(attempt, { approver })), /approver is required/);
    }
    assert.equal(fileBytes(attemptPath(dir, attempt.id)), before);
    assert.equal(noExceptionFiles(dir), true);
  } finally {
    cleanup(dir);
  }
});

test('reuse refuses an approver equal to the implementer', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    assert.equal(target.implementerId, 'engineer-2');
    await assertReuseRefused(
      dir,
      source,
      target,
      reuseOptions(source, target, { approver: 'engineer-2' }),
      /differ from the implementer/,
    );
    await assertReuseRefused(
      dir,
      source,
      target,
      reuseOptions(source, target, { reason: ' ' }),
      /reason is required/,
    );
  } finally {
    cleanup(dir);
  }
});

test('policy version 2 requires a verified principal that equals the approver', async () => {
  const dir = tempProject();
  try {
    const attempt = await stuckAttempt(dir);
    setPolicyVersion(dir, 2);
    assert.throws(() => waiveRed(dir, waiveOptions(attempt)), /principal/);
    assert.equal(noExceptionFiles(dir), true);

    setVerifier(dir);
    assert.throws(() => waiveRed(dir, waiveOptions(attempt)), /principal/);
    assert.throws(
      () => waiveRed(dir, waiveOptions(attempt, {
        approver: 'human-2',
        principalProvider: 'local',
        principalSubject: 'human-1',
      })),
      /approver must equal the verified principal/,
    );
    assert.throws(
      () => waiveRed(dir, waiveOptions(attempt, {
        approver: 'human-2',
        principalProvider: 'local',
        principalSubject: 'human-2',
      })),
      /principal/,
    );
    assert.equal(noExceptionFiles(dir), true);

    const ok = waiveRed(dir, waiveOptions(attempt, {
      principalProvider: 'local',
      principalSubject: 'human-1',
    }));
    const record = JSON.parse(fs.readFileSync(ok.files[0], 'utf8'));
    assert.equal(record.policyVersion, 2);
    assert.equal(record.principal.subject, 'human-1');
    assert.equal(record.principal.provider, 'local');
    assert.equal(record.principal.issuer, 'test');
  } finally {
    cleanup(dir);
  }
});

test('a second exception for one kind fails and leaves the first file unchanged', async () => {
  const dir = tempProject();
  try {
    const attempt = await stuckAttempt(dir);
    const first = waiveRed(dir, waiveOptions(attempt));
    const before = fileBytes(first.files[0]);
    const attemptBefore = fileBytes(attemptPath(dir, attempt.id));
    assert.throws(() => waiveRed(dir, waiveOptions(attempt)), /already has an exception for unit/);
    assert.equal(fileBytes(first.files[0]), before);
    assert.equal(fileBytes(attemptPath(dir, attempt.id)), attemptBefore);
    assert.equal(fs.readdirSync(path.join(dir, '.factory/exceptions/red')).length, 1);
  } finally {
    cleanup(dir);
  }
});

test('an exception on one attempt does not satisfy a later attempt for the same task', async () => {
  const dir = tempProject();
  try {
    const attempt = await stuckAttempt(dir);
    waiveRed(dir, waiveOptions(attempt));
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const later = getAttempt(dir, JSON.parse(started.out).id);
    assert.equal(redSatisfaction(dir, later, 'unit'), 'missing');
  } finally {
    cleanup(dir);
  }
});

function snapshotTree(root) {
  const out = {};
  if (!fs.existsSync(root)) return out;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(root, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(root);
  return out;
}

test('exceptions do not edit run sessions, the work item class, or the rejected source', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    const orchestrationBefore = snapshotTree(path.join(dir, '.factory/orchestration'));
    const itemFile = path.join(dir, '.factory/work/items/demo--1.1.json');
    const itemBefore = JSON.parse(fileBytes(itemFile));
    const sourceBefore = fileBytes(attemptPath(dir, source.id));
    reuseRed(dir, reuseOptions(source, target));
    assert.deepEqual(snapshotTree(path.join(dir, '.factory/orchestration')), orchestrationBefore);
    const itemAfter = JSON.parse(fileBytes(itemFile));
    assert.equal(itemAfter.factory.taskType, itemBefore.factory.taskType);
    assert.deepEqual(itemAfter.factory, itemBefore.factory);
    assert.equal(fileBytes(attemptPath(dir, source.id)), sourceBefore);
  } finally {
    cleanup(dir);
  }
});

function cliReuseArgs(source, target, extra = []) {
  return [
    'red', 'reuse', target.id,
    '--from', source.id,
    '--kind', 'unit',
    '--note', 'dirty-workspace rejection only',
    '--approver', 'human-1',
    ...extra,
  ];
}

test('red reuse CLI records a reuse exception and prints one JSON result', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    const result = await idefactory(dir, cliReuseArgs(source, target));
    assert.equal(result.code, 0, result.err + result.out);
    const body = JSON.parse(result.out);
    assert.equal(body.attemptId, target.id);
    assert.equal(body.exceptions.length, 1);
    assert.equal(body.exceptions[0].type, 'reuse');
    assert.equal(body.exceptions[0].kind, 'unit');
    assert.match(body.note, /--new-run/);
    assert.equal(redSatisfaction(dir, getAttempt(dir, target.id), 'unit'), 'reuse');
  } finally {
    cleanup(dir);
  }
});

test('red reuse CLI requires --from, --kind, --note, and --approver', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    const missing = [
      ['red', 'reuse', target.id, '--kind', 'unit', '--note', 'n', '--approver', 'human-1'],
      ['red', 'reuse', target.id, '--from', source.id, '--note', 'n', '--approver', 'human-1'],
      ['red', 'reuse', target.id, '--from', source.id, '--kind', 'unit', '--approver', 'human-1'],
      ['red', 'reuse', target.id, '--from', source.id, '--kind', 'unit', '--note', 'n'],
      ['red', 'reuse'],
    ];
    for (const args of missing) {
      const result = await idefactory(dir, args);
      assert.notEqual(result.code, 0, args.join(' '));
      assert.match(result.err, /Usage: idefactory red reuse/);
    }
    assert.equal(noExceptionFiles(dir), true);
  } finally {
    cleanup(dir);
  }
});

test('red waive CLI refuses before a stuck signal and accepts the acknowledgment flag', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir, ['unit', 'integration']);
    ensureCleanGitCommit(dir);
    await toImplementing(dir, started.id);
    const args = [
      'red', 'waive', started.id,
      '--kind', 'unit', '--kind', 'integration',
      '--note', 'already satisfied', '--approver', 'human-1',
    ];
    const refused = await idefactory(dir, args);
    assert.notEqual(refused.code, 0);
    assert.ok(refused.err.includes(WAIVER_WARNING_SENTENCE));
    assert.match(refused.err, /unit, integration/);
    assert.equal(noExceptionFiles(dir), true);

    const ok = await idefactory(dir, [...args, '--acknowledge-not-stuck']);
    assert.equal(ok.code, 0, ok.err + ok.out);
    const body = JSON.parse(ok.out);
    assert.deepEqual(body.exceptions.map((entry) => entry.kind).sort(), ['integration', 'unit']);
    assert.equal(body.exceptions.every((entry) => entry.acknowledgedNotStuck === true), true);
    const stored = getAttempt(dir, started.id);
    assert.equal(redSatisfaction(dir, stored, 'unit'), 'waiver');
    assert.equal(redSatisfaction(dir, stored, 'integration'), 'waiver');
  } finally {
    cleanup(dir);
  }
});

test('red waive CLI after a stuck signal needs no flag and requires a note', async () => {
  const dir = tempProject();
  try {
    const attempt = await stuckAttempt(dir);
    const noNote = await idefactory(dir, ['red', 'waive', attempt.id, '--kind', 'unit', '--approver', 'human-1']);
    assert.notEqual(noNote.code, 0);
    assert.match(noNote.err, /Usage: idefactory red waive/);
    const ok = await idefactory(dir, [
      'red', 'waive', attempt.id, '--kind', 'unit', '--note', 'n', '--approver', 'human-1',
    ]);
    assert.equal(ok.code, 0, ok.err + ok.out);
    assert.equal(JSON.parse(ok.out).exceptions[0].acknowledgedNotStuck, false);
  } finally {
    cleanup(dir);
  }
});

test('usage text names red reuse and red waive', async () => {
  const dir = tempProject();
  try {
    const result = await idefactory(dir, ['help']);
    assert.equal(result.code, 0);
    assert.match(result.out, /idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind>/);
    assert.match(result.out, /idefactory red waive <targetAttemptId> --kind <kind>/);
    assert.match(result.out, /--acknowledge-not-stuck/);
  } finally {
    cleanup(dir);
  }
});

test('red reuse and red waive refuse while HALT exists', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    fs.writeFileSync(path.join(dir, 'HALT'), 'stop\n');
    const reuse = await idefactory(dir, cliReuseArgs(source, target));
    assert.notEqual(reuse.code, 0);
    assert.match(reuse.err, /HALT/);
    const waive = await idefactory(dir, [
      'red', 'waive', target.id, '--kind', 'unit', '--note', 'n', '--approver', 'human-1',
      '--acknowledge-not-stuck',
    ]);
    assert.notEqual(waive.code, 0);
    assert.match(waive.err, /HALT/);
    assert.equal(noExceptionFiles(dir), true);
  } finally {
    cleanup(dir);
  }
});

function readEvents(dir) {
  const file = path.join(dir, '.factory/observability/events.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('recording an exception appends one event that omits the reason', async () => {
  const dir = tempProject();
  try {
    const attempt = await stuckAttempt(dir);
    const before = readEvents(dir).filter((event) => event.type === 'red-exception.recorded');
    assert.equal(before.length, 0);
    const reason = 'secret-looking reason text';
    const ok = await idefactory(dir, [
      'red', 'waive', attempt.id, '--kind', 'unit', '--note', reason, '--approver', 'human-1',
    ]);
    assert.equal(ok.code, 0, ok.err + ok.out);
    const exceptionId = JSON.parse(ok.out).exceptions[0].id;
    const events = readEvents(dir).filter((event) => event.type === 'red-exception.recorded');
    assert.equal(events.length, 1);
    assert.equal(events[0].exceptionType, 'waiver');
    assert.equal(events[0].id, exceptionId);
    assert.equal(events[0].attemptId, attempt.id);
    assert.equal(events[0].change, 'demo');
    assert.equal(events[0].task, '1.1');
    assert.match(events[0].time, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(JSON.stringify(events[0]).includes(reason), false);
    assert.equal(
      fs.readFileSync(path.join(dir, '.factory/observability/events.jsonl'), 'utf8').includes(reason),
      false,
    );
  } finally {
    cleanup(dir);
  }
});

test('reuse appends a reuse event per kind', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    const ok = await idefactory(dir, cliReuseArgs(source, target));
    assert.equal(ok.code, 0, ok.err + ok.out);
    const events = readEvents(dir).filter((event) => event.type === 'red-exception.recorded');
    assert.equal(events.length, 1);
    assert.equal(events[0].exceptionType, 'reuse');
    assert.equal(events[0].attemptId, target.id);
  } finally {
    cleanup(dir);
  }
});

test('an event-log failure leaves the exception in place and warns', async () => {
  const dir = tempProject();
  try {
    const attempt = await stuckAttempt(dir);
    const eventFile = path.join(dir, '.factory/observability/events.jsonl');
    fs.rmSync(eventFile, { force: true });
    fs.mkdirSync(eventFile, { recursive: true });
    const ok = await idefactory(dir, [
      'red', 'waive', attempt.id, '--kind', 'unit', '--note', 'n', '--approver', 'human-1',
    ]);
    assert.equal(ok.code, 0, ok.err + ok.out);
    assert.match(ok.err, /event-log warning/);
    assert.equal(redSatisfaction(dir, getAttempt(dir, attempt.id), 'unit'), 'waiver');
  } finally {
    cleanup(dir);
  }
});

function parseRequest(out) {
  const match = out.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(match, `orchestration request must include a json block: ${out}`);
  return JSON.parse(match[1]);
}

test('run asks for verifying when every required kind has a red or an exception', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    await toImplementing(dir, started.id);
    const redRequest = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(redRequest.code, 2, redRequest.err + redRequest.out);
    assert.equal(parseRequest(redRequest.out).nextState, 'red-confirmed');

    bindRedException(dir, started.id, exceptionRecord(getAttempt(dir, started.id)));
    const proceed = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1', '--new-run']);
    assert.equal(proceed.code, 2, proceed.err + proceed.out);
    const request = parseRequest(proceed.out);
    assert.equal(request.state, 'implementing');
    assert.equal(request.nextState, 'verifying');
    assert.doesNotMatch(proceed.out, /Write a failing test/);
  } finally {
    cleanup(dir);
  }
});

test('run keeps the red request when one required kind is still missing', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir, ['unit', 'integration']);
    await toImplementing(dir, started.id);
    bindRedException(dir, started.id, exceptionRecord(getAttempt(dir, started.id)));
    const result = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(result.code, 2, result.err + result.out);
    assert.equal(parseRequest(result.out).nextState, 'red-confirmed');
  } finally {
    cleanup(dir);
  }
});

test('a closed vacuous-red session stays closed after a waiver until --new-run', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    writeRegistry(dir, 0);
    ensureCleanGitCommit(dir);
    const first = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(first.code, 2, first.err + first.out);
    await toImplementing(dir, started.id);
    const vacuous = await idefactory(dir, ['verify', 'run', started.id, '--check', 'unit', '--red']);
    assert.notEqual(vacuous.code, 0);

    const waived = await idefactory(dir, [
      'red', 'waive', started.id, '--kind', 'unit', '--note', 'n', '--approver', 'human-1',
    ]);
    assert.equal(waived.code, 0, waived.err + waived.out);

    const stillClosed = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(stillClosed.code, 0, stillClosed.err + stillClosed.out);
    assert.match(stillClosed.out, /vacuous-red/);
    assert.doesNotMatch(stillClosed.out, /Orchestration request/);

    const reopened = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1', '--new-run']);
    assert.equal(reopened.code, 2, reopened.err + reopened.out);
    assert.equal(parseRequest(reopened.out).nextState, 'verifying');
  } finally {
    cleanup(dir);
  }
});

test('status JSON and text name each exception and say no red ran', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    ensureCleanGitCommit(dir);
    await toImplementing(dir, started.id);
    const quiet = await idefactory(dir, ['status', '--json']);
    assert.deepEqual(JSON.parse(quiet.out).redExceptions, []);
    assert.doesNotMatch((await idefactory(dir, ['status'])).out, /No red ran/);

    waiveRed(dir, waiveOptions(getAttempt(dir, started.id), {
      acknowledgeNotStuck: true,
      reason: 'already satisfied by the clean build',
    }));
    const json = JSON.parse((await idefactory(dir, ['status', '--json'])).out);
    assert.equal(json.redExceptions.length, 1);
    const entry = json.redExceptions[0];
    assert.equal(entry.attemptId, started.id);
    assert.equal(entry.type, 'waiver');
    assert.equal(entry.kind, 'unit');
    assert.equal(entry.approver, 'human-1');
    assert.equal(entry.reason, 'already satisfied by the clean build');
    assert.equal(entry.noRedRan, true);
    assert.equal(entry.acknowledgedNotStuck, true);

    const text = (await idefactory(dir, ['status'])).out;
    assert.match(text, /No red ran for unit on attempt/);
    assert.match(text, /waiver by human-1: already satisfied by the clean build/);
    assert.match(text, /acknowledged before the system was stuck/);
  } finally {
    cleanup(dir);
  }
});

test('status marks a reuse exception with its source attempt', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    reuseRed(dir, reuseOptions(source, target));
    const json = JSON.parse((await idefactory(dir, ['status', '--json'])).out);
    const entry = json.redExceptions.find((row) => row.attemptId === target.id);
    assert.equal(entry.type, 'reuse');
    assert.equal(entry.sourceAttemptId, source.id);
    assert.equal(entry.noRedRan, true);
    assert.equal('acknowledgedNotStuck' in entry, false);
    assert.match((await idefactory(dir, ['status'])).out, new RegExp(`reuse of attempt ${source.id} red by human-1`));
  } finally {
    cleanup(dir);
  }
});

test('the reviewer packet names the exception and the implementer packet does not need it', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    ensureCleanGitCommit(dir);
    await toImplementing(dir, started.id);
    const item = () => getWorkItem(dir, 'demo', '1.1');
    assert.doesNotMatch(renderWorkPacket(dir, item(), 'reviewer'), /Red exceptions/);

    waiveRed(dir, waiveOptions(getAttempt(dir, started.id), { acknowledgeNotStuck: true }));
    const reviewer = renderWorkPacket(dir, item(), 'reviewer');
    assert.match(reviewer, /Red exceptions/);
    assert.match(reviewer, /No red ran for unit on attempt/);
    assert.match(reviewer, /waiver by human-1: implementation already satisfies the requirement/);
    const security = renderWorkPacket(dir, item(), 'security-reviewer');
    assert.match(security, /No red ran for unit/);
    assert.doesNotMatch(renderWorkPacket(dir, item(), 'engineer'), /Red exceptions/);
  } finally {
    cleanup(dir);
  }
});

test('the reviewer orchestration request names the exception', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    await toImplementing(dir, started.id);
    await recordPass(dir, started.id);
    bindRedException(dir, started.id, exceptionRecord(getAttempt(dir, started.id)));
    assert.equal((await transition(dir, started.id, 'verifying')).code, 0);
    const result = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(result.code, 2, result.err + result.out);
    assert.match(result.out, /^Role: reviewer$/m);
    assert.match(result.out, /No red ran for unit on attempt/);
  } finally {
    cleanup(dir);
  }
});

test('the verdict comment names the exception when the attempt has one', async () => {
  const dir = tempProject();
  const change = 'demo-red-exception-comment';
  const attemptId = 'cccccccc-dddd-4eee-8fff-000000000001';
  const logPath = path.join(dir, 'forge-argv.log');
  const dbPath = path.join(dir, 'forge-db.json');
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    ensureCleanGitCommit(dir);
    const forgeEnv = {
      IDEFACTORY_FORGE: path.join(repoRoot, 'support/fake-forge.mjs'),
      IDEFACTORY_FORGE_LOG: logPath,
      IDEFACTORY_FORGE_DB: dbPath,
    };
    const opened = await idefactory(dir, ['pr', 'open', change], forgeEnv);
    assert.equal(opened.code, 0, opened.err || opened.out);
    fs.mkdirSync(path.join(dir, '.factory/attempts'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.factory/attempts', `${attemptId}.json`),
      `${JSON.stringify({
        id: attemptId,
        change,
        taskId: '1.1',
        state: 'awaiting-review',
        implementerRole: 'engineer',
        implementerId: 'engineer-1',
        reviewerId: null,
        modelProfile: 'coding-standard',
        evidence: { red: null, verification: [], security: [], review: null, changedFiles: [], baseRev: null },
        history: [],
        createdAt: '2026-10-27T00:00:00.000Z',
        updatedAt: '2026-10-27T00:00:00.000Z',
      }, null, 2)}\n`,
    );
    bindRedException(dir, attemptId, exceptionRecord(getAttempt(dir, attemptId)));
    const accepted = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'accepted',
      '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict: 'ACCEPT' }),
    ], forgeEnv);
    assert.equal(accepted.code, 0, accepted.err || accepted.out);
    const bodies = fs.readFileSync(logPath, 'utf8')
      .split('\n').filter(Boolean).map((line) => JSON.parse(line))
      .filter((argv) => argv[0] === 'pr' && argv[1] === 'comment')
      .map((argv) => argv[argv.indexOf('--body') + 1]);
    assert.equal(bodies.length, 1);
    assert.match(bodies[0], /Verdict: ACCEPT/);
    assert.match(bodies[0], /No red ran for unit on attempt/);
    assert.match(bodies[0], /waiver by human-1: test exception/);
  } finally {
    cleanup(dir);
  }
});

test('every shipped copy of the build skills documents the red exception commands', () => {
  for (const dir of ['templates', '.cursor', '.claude', '.cline', '.github', '.agents']) {
    for (const name of ['factory-build', 'factory-tdd', 'factory-verify']) {
      const skill = fs.readFileSync(path.join(repoRoot, dir, 'skills', name, 'SKILL.md'), 'utf8');
      const label = `${dir}/${name}`;
      assert.match(skill, /idefactory red reuse/, label);
      assert.match(skill, /idefactory red waive/, label);
      assert.match(skill, /ask the human first/i, label);
      assert.ok(skill.includes(WAIVER_WARNING_SENTENCE), `${label} warning sentence`);
      assert.match(skill, /--acknowledge-not-stuck/, label);
      assert.match(skill, /only after the human acknowledges/i, label);
      assert.match(skill, /vacuous-red/, label);
    }
  }
});

test('README and governance document the red exception commands and the stuck-first advice', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const governance = fs.readFileSync(path.join(repoRoot, 'templates/factory/governance.md'), 'utf8');
  for (const [label, text] of [['README', readme], ['governance', governance]]) {
    assert.match(text, /idefactory red reuse/, label);
    assert.match(text, /idefactory red waive/, label);
    assert.match(text, /--acknowledge-not-stuck/, label);
    assert.ok(text.includes(WAIVER_WARNING_SENTENCE), `${label} warning sentence`);
  }
  assert.match(readme, /\| `idefactory red reuse` \/ `waive` \|/);
});

test('help lists red reuse and red waive', async () => {
  const dir = tempProject();
  try {
    const help = await idefactory(dir, ['--help']);
    assert.match(help.out, /idefactory red reuse/);
    assert.match(help.out, /idefactory red waive/);
    assert.match(help.out, /--acknowledge-not-stuck/);
  } finally {
    cleanup(dir);
  }
});

async function finishThroughReview(dir, attemptId) {
  const pass = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit']);
  assert.equal(pass.code, 0, pass.err + pass.out);
  assert.equal((await transition(dir, attemptId, 'verifying')).code, 0);
  assert.equal((await transition(dir, attemptId, 'awaiting-review')).code, 0);
  const accepted = await transition(dir, attemptId, 'accepted', {
    reviewerId: 'reviewer-2',
    verdict: 'ACCEPT',
  });
  assert.equal(accepted.code, 0, accepted.err);
  const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attemptId]);
  assert.equal(done.code, 0, done.err + done.out);
  const stored = getAttempt(dir, attemptId);
  assert.equal(stored.state, 'finalized');
  assert.equal(stored.evidence.reds ?? null, null, 'no CLI red may be claimed on the replacement');
  return stored;
}

test('issue 27: a verification-only retry completes through red reuse with no new red', async () => {
  const dir = tempProject();
  try {
    const source = await rejectedSource(dir);
    const target = await greenTarget(dir);
    const vacuous = await idefactory(dir, ['verify', 'run', target.id, '--check', 'unit', '--red']);
    assert.notEqual(vacuous.code, 0);
    assert.match(vacuous.err, /vacuous-red/);
    const blocked = await transition(dir, target.id, 'verifying');
    assert.notEqual(blocked.code, 0);

    const sourceBefore = fileBytes(attemptPath(dir, source.id));
    const reused = await idefactory(dir, [
      'red', 'reuse', target.id, '--from', source.id, '--kind', 'unit',
      '--note', 'rejected only for dirty-workspace verification', '--approver', 'human-1',
    ]);
    assert.equal(reused.code, 0, reused.err + reused.out);
    assert.equal(JSON.parse(reused.out).exceptions[0].type, 'reuse');
    assert.equal(fileBytes(attemptPath(dir, source.id)), sourceBefore);
    assert.equal(getWorkItem(dir, 'demo', '1.1').factory.taskType, 'code');

    const stored = await finishThroughReview(dir, target.id);
    assert.equal(stored.evidence.redExceptions.unit.type, 'reuse');
    assert.equal(getAttempt(dir, source.id).state, 'rejected');
    assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'done');
  } finally {
    cleanup(dir);
  }
});

test('issue 27: a stuck attempt completes through red waive after vacuous-red', async () => {
  const dir = tempProject();
  try {
    const attempt = await stuckAttempt(dir);
    const waived = await idefactory(dir, [
      'red', 'waive', attempt.id, '--kind', 'unit',
      '--note', 'implementation already satisfies the requirement', '--approver', 'human-1',
    ]);
    assert.equal(waived.code, 0, waived.err + waived.out);
    const row = JSON.parse(waived.out).exceptions[0];
    assert.equal(row.type, 'waiver');
    assert.equal(row.acknowledgedNotStuck, false);
    const stored = await finishThroughReview(dir, attempt.id);
    assert.equal(stored.evidence.redExceptions.unit.type, 'waiver');
  } finally {
    cleanup(dir);
  }
});

test('issue 27: an early waiver is refused with the warning until the human acknowledges it', async () => {
  const dir = tempProject();
  try {
    const started = await seedAttempt(dir);
    writeRegistry(dir, 0);
    ensureCleanGitCommit(dir);
    await toImplementing(dir, started.id);
    const args = [
      'red', 'waive', started.id, '--kind', 'unit',
      '--note', 'human knows the red cannot be reproduced', '--approver', 'human-1',
    ];
    const refused = await idefactory(dir, args);
    assert.notEqual(refused.code, 0);
    assert.ok(refused.err.includes(WAIVER_WARNING_SENTENCE), refused.err);
    assert.match(refused.err, /--acknowledge-not-stuck/);
    assert.equal(getAttempt(dir, started.id).evidence.redExceptions ?? null, null);

    const accepted = await idefactory(dir, [...args, '--acknowledge-not-stuck']);
    assert.equal(accepted.code, 0, accepted.err + accepted.out);
    assert.equal(JSON.parse(accepted.out).exceptions[0].acknowledgedNotStuck, true);
    const stored = await finishThroughReview(dir, started.id);
    assert.equal(stored.evidence.redExceptions.unit.type, 'waiver');
  } finally {
    cleanup(dir);
  }
});
