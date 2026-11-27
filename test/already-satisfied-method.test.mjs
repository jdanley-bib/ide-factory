import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { getAttempt } from '../src/lib/attempt.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
import { readBoundMethod, assertMethodAccepted, describeAttemptMethod, describeCoverage } from '../src/lib/red-method.mjs';
import { commandDigest, resolveGitBinding } from '../src/lib/verification-evidence.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { commitAll, git, nodeCheck, writeJson } from './factory-project.mjs';

const FORBIDDEN_CLAIMS = /red ran/i;

function registry(kinds, exit = 0) {
  return {
    schemaVersion: 1,
    checks: Object.fromEntries(kinds.map((kind) => [kind, nodeCheck(`process.exit(${exit})`)])),
  };
}

function taskBlock({ taskType, checks = ['unit'], profile = 'cli' } = {}) {
  return [
    '- [ ] 1.1 Tune the parser setting',
    '  factory:',
    '    kind: general',
    '    dependencies: []',
    ...(taskType ? [`    taskType: ${taskType}`] : []),
    `    checks: [${checks.join(', ')}]`,
    `    verificationProfile: ${profile}`,
    '    roles: [engineer, reviewer, scribe]',
    '',
  ].join('\n');
}

async function seed(dir, { tasks = taskBlock(), kinds = ['unit'], profiles = {}, commit = true } = {}) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  const configFile = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.governance.policyVersion = 1;
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  if (Object.keys(profiles).length) {
    const file = path.join(dir, '.factory/profiles.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...profiles }, null, 2));
  }
  writeJson(dir, '.factory/checks.json', registry(kinds, 0));
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), tasks);
  const synced = await idefactory(dir, ['sync-tasks', 'demo'], {}, { rawRegistry: true });
  assert.equal(synced.code, 0, synced.err + synced.out);
  if (commit) commitAll(dir);
}

async function startAttempt(dir) {
  const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
  assert.equal(started.code, 0, started.err + started.out);
  const { id } = JSON.parse(started.out);
  const moved = await idefactory(dir, [
    'attempt', 'transition', id, 'implementing', '--evidence', JSON.stringify({ implementerId: 'engineer-1' }),
  ]);
  assert.equal(moved.code, 0, moved.err);
  return id;
}

async function vacuousRed(dir, attemptId, kind = 'unit') {
  const red = await idefactory(dir, ['verify', 'run', attemptId, '--check', kind, '--red']);
  assert.notEqual(red.code, 0, red.out);
  assert.match(red.err, /vacuous-red/);
  return red;
}

function propose(dir, attemptId, { kinds = ['unit'], testPaths = ['test/new.test.mjs'], extra = [] } = {}) {
  const args = [
    'method', 'propose', attemptId, '--choice', 'no-red', '--reason', 'already-satisfied',
    '--rationale', 'the behavior already exists', '--implementer', 'engineer-1',
  ];
  for (const kind of kinds) args.push('--kind', kind);
  for (const testPath of testPaths) args.push('--test-path', testPath);
  return idefactory(dir, [...args, ...extra]);
}

function methodFiles(dir) {
  const root = path.join(dir, '.factory/methods');
  return fs.existsSync(root) ? fs.readdirSync(root).sort() : [];
}

async function assertRefused(dir, attemptId, result, pattern) {
  const attemptFile = path.join(dir, '.factory/attempts', `${attemptId}.json`);
  const before = fs.readFileSync(attemptFile, 'utf8');
  const filesBefore = methodFiles(dir);
  const outcome = await result();
  assert.notEqual(outcome.code, 0, outcome.out);
  assert.match(outcome.err, pattern);
  assert.equal(fs.readFileSync(attemptFile, 'utf8'), before);
  assert.deepEqual(methodFiles(dir), filesBefore);
}

function writeTestFile(dir, rel = 'test/new.test.mjs') {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), "import { test } from 'node:test';\ntest('covers it', () => {});\n");
}

test('an already-satisfied method records the observed passes, the start revision, and the changed paths', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir);
    const head = git(dir, ['rev-parse', 'HEAD']);
    await vacuousRed(dir, attemptId);
    writeTestFile(dir);
    const proposed = await propose(dir, attemptId);
    assert.equal(proposed.code, 0, proposed.err + proposed.out);

    const record = readBoundMethod(dir, getAttempt(dir, attemptId));
    assert.equal(record.reason, 'already-satisfied');
    assert.equal(record.startRevision, head);
    assert.deepEqual(record.testPaths, ['test/new.test.mjs']);
    assert.deepEqual(record.changedPaths, { count: 1, paths: ['test/new.test.mjs'] });
    const pass = record.observedPass.unit;
    assert.equal(pass.commandDigest, commandDigest(registry(['unit']).checks.unit.argv));
    assert.equal(pass.sourceRevision, head);
    assert.match(pass.logDigest, /^sha256:/);
    assert.ok(pass.recordedAt);
    assert.equal(JSON.stringify(record).includes('stdout'), false);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId), /already has a method/);
  } finally {
    cleanup(dir);
  }
});

test('an already-satisfied proposal without a vacuous red names the kind and records nothing', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir);
    writeTestFile(dir);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId), /no observed pass for: unit/);
  } finally {
    cleanup(dir);
  }
});

test('a registered command changed after the vacuous run refuses the proposal', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir);
    await vacuousRed(dir, attemptId);
    writeJson(dir, '.factory/checks.json', {
      schemaVersion: 1,
      checks: { unit: nodeCheck('process.exit(0); // changed') },
    });
    writeTestFile(dir);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId), /no observed pass for: unit/);
  } finally {
    cleanup(dir);
  }
});

test('a partly covered proposal names the kind without a pass', async () => {
  const dir = tempProject();
  try {
    await seed(dir, {
      kinds: ['unit', 'integration'],
      profiles: { both: { checks: ['unit', 'integration'], humanGate: false } },
      tasks: taskBlock({ profile: 'both', checks: ['unit', 'integration'] }),
    });
    const attemptId = await startAttempt(dir);
    await vacuousRed(dir, attemptId, 'unit');
    writeTestFile(dir);
    await assertRefused(
      dir,
      attemptId,
      () => propose(dir, attemptId, { kinds: ['unit', 'integration'] }),
      /no observed pass for: integration/,
    );
  } finally {
    cleanup(dir);
  }
});

test('a production edit outside the cited tests refuses the proposal and names the file', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir);
    await vacuousRed(dir, attemptId);
    writeTestFile(dir);
    fs.mkdirSync(path.join(dir, 'src/lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/lib/x.mjs'), 'export const x = 1;\n');
    await assertRefused(dir, attemptId, () => propose(dir, attemptId), /outside them: src\/lib\/x\.mjs/);
  } finally {
    cleanup(dir);
  }
});

test('a deleted tracked file and an untracked file both count against the claim', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/old.mjs'), 'export {};\n');
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    await vacuousRed(dir, attemptId);
    writeTestFile(dir);
    fs.rmSync(path.join(dir, 'src/old.mjs'));
    await assertRefused(dir, attemptId, () => propose(dir, attemptId), /outside them: src\/old\.mjs/);
  } finally {
    cleanup(dir);
  }
});

test('a cited directory covers its files and the record stores 50 paths and the total', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir);
    await vacuousRed(dir, attemptId);
    for (let index = 0; index < 60; index += 1) writeTestFile(dir, `test/many/case-${String(index).padStart(2, '0')}.test.mjs`);
    const proposed = await propose(dir, attemptId, { testPaths: ['test/many'] });
    assert.equal(proposed.code, 0, proposed.err + proposed.out);
    const record = readBoundMethod(dir, getAttempt(dir, attemptId));
    assert.equal(record.changedPaths.count, 60);
    assert.equal(record.changedPaths.paths.length, 50);
  } finally {
    cleanup(dir);
  }
});

test('a proposal without a test path is refused', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir);
    await vacuousRed(dir, attemptId);
    await assertRefused(
      dir,
      attemptId,
      () => propose(dir, attemptId, { testPaths: [] }),
      /must cite at least one existing test/,
    );
  } finally {
    cleanup(dir);
  }
});

test('an attempt started without a commit refuses the proposal with a missing start revision', async () => {
  const dir = tempProject();
  try {
    await seed(dir, { commit: false });
    const attemptId = await startAttempt(dir);
    assert.equal(getAttempt(dir, attemptId).startRevision, null);
    writeTestFile(dir);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId), /has no start revision/);
  } finally {
    cleanup(dir);
  }
});

test('an explicit task class does not block an already-satisfied proposal', async () => {
  const dir = tempProject();
  try {
    await seed(dir, { tasks: taskBlock({ taskType: 'code' }) });
    const attemptId = await startAttempt(dir);
    await vacuousRed(dir, attemptId);
    writeTestFile(dir);
    const proposed = await propose(dir, attemptId);
    assert.equal(proposed.code, 0, proposed.err + proposed.out);
  } finally {
    cleanup(dir);
  }
});

test('an explicit task class still refuses the other reason classes', async () => {
  const dir = tempProject();
  try {
    await seed(dir, { tasks: taskBlock({ taskType: 'code' }) });
    const attemptId = await startAttempt(dir);
    const refused = await idefactory(dir, [
      'method', 'propose', attemptId, '--choice', 'no-red', '--reason', 'configuration',
      '--rationale', 'config only', '--implementer', 'engineer-1', '--kind', 'unit',
    ]);
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /explicit factory\.taskType/);
  } finally {
    cleanup(dir);
  }
});

test('acceptance rechecks the diff and refuses a production edit made after the proposal', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir);
    await vacuousRed(dir, attemptId);
    writeTestFile(dir);
    assert.equal((await propose(dir, attemptId)).code, 0);
    assert.equal((await idefactory(dir, ['attempt', 'transition', attemptId, 'verifying', '--evidence', '{}'])).code, 0);
    commitAll(dir);
    const passed = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit']);
    assert.equal(passed.code, 0, passed.err + passed.out);
    const handoff = await idefactory(dir, ['attempt', 'transition', attemptId, 'awaiting-review', '--evidence', '{}']);
    assert.equal(handoff.code, 0, handoff.err);
    const reviewed = await idefactory(dir, [
      'method', 'review', attemptId, '--verdict', 'ACCEPT', '--reviewer', 'reviewer-1', '--note', 'the tests cover it',
    ]);
    assert.equal(reviewed.code, 0, reviewed.err + reviewed.out);

    const attempt = getAttempt(dir, attemptId);
    assert.doesNotThrow(() => assertMethodAccepted(dir, attempt));
    fs.mkdirSync(path.join(dir, 'src/lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/lib/late.mjs'), 'export {};\n');
    assert.throws(() => assertMethodAccepted(dir, attempt), /already-satisfied no longer holds.*src\/lib\/late\.mjs/);
  } finally {
    cleanup(dir);
  }
});

test('the packet coverage lines show the passes and the diff check without claiming a red', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir);
    await vacuousRed(dir, attemptId);
    writeTestFile(dir);
    assert.equal((await propose(dir, attemptId)).code, 0);
    const row = describeAttemptMethod(dir, getAttempt(dir, attemptId));
    const lines = describeCoverage(row).join('\n');
    assert.match(lines, /Observed passes: unit \(log sha256:/);
    assert.match(lines, /Cited test paths: test\/new\.test\.mjs/);
    assert.match(lines, /reject the method if they do not/);
    assert.doesNotMatch(lines, FORBIDDEN_CLAIMS);
    assert.deepEqual(describeCoverage({ reason: 'configuration' }), []);
    assert.ok(resolveGitBinding(dir).sourceRevision);
  } finally {
    cleanup(dir);
  }
});

async function toReviewedMethod(dir, attemptId) {
  commitAll(dir);
  const passed = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit']);
  assert.equal(passed.code, 0, passed.err + passed.out);
  const verifying = await idefactory(dir, ['attempt', 'transition', attemptId, 'verifying', '--evidence', '{}']);
  assert.equal(verifying.code, 0, verifying.err);
  const handoff = await idefactory(dir, ['attempt', 'transition', attemptId, 'awaiting-review', '--evidence', '{}']);
  assert.equal(handoff.code, 0, handoff.err);
  const reviewed = await idefactory(dir, [
    'method', 'review', attemptId, '--verdict', 'ACCEPT', '--reviewer', 'reviewer-1', '--note', 'the tests cover it',
  ]);
  assert.equal(reviewed.code, 0, reviewed.err + reviewed.out);
}

function writeLateProductionFile(dir) {
  fs.mkdirSync(path.join(dir, 'src/lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/lib/late.mjs'), 'export {};\n');
}

test('a stored failing red refuses an already-satisfied proposal even for an explicit code item', async () => {
  const dir = tempProject();
  try {
    await seed(dir, { tasks: taskBlock({ taskType: 'code' }) });
    writeJson(dir, '.factory/checks.json', { schemaVersion: 1, checks: { unit: nodeCheck('process.exit(1)') } });
    const attemptId = await startAttempt(dir);
    const red = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit', '--red']);
    assert.equal(red.code, 0, red.err + red.out);
    writeTestFile(dir);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId), /a failing red is already stored for unit/);
  } finally {
    cleanup(dir);
  }
});

test('a prior method rejection refuses an already-satisfied proposal on the next attempt', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const first = await startAttempt(dir);
    await vacuousRed(dir, first);
    writeTestFile(dir);
    assert.equal((await propose(dir, first)).code, 0);
    await toReviewedMethodRejected(dir, first);

    const second = await startAttempt(dir);
    await vacuousRed(dir, second);
    await assertRefused(dir, second, () => propose(dir, second), /was rejected on attempt/);
  } finally {
    cleanup(dir);
  }
});

async function toReviewedMethodRejected(dir, attemptId) {
  commitAll(dir);
  const passed = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit']);
  assert.equal(passed.code, 0, passed.err + passed.out);
  assert.equal((await idefactory(dir, ['attempt', 'transition', attemptId, 'verifying', '--evidence', '{}'])).code, 0);
  assert.equal((await idefactory(dir, ['attempt', 'transition', attemptId, 'awaiting-review', '--evidence', '{}'])).code, 0);
  const reviewed = await idefactory(dir, [
    'method', 'review', attemptId, '--verdict', 'REJECT', '--reviewer', 'reviewer-1', '--note', 'method does not fit',
  ]);
  assert.equal(reviewed.code, 0, reviewed.err + reviewed.out);
  const rejected = await idefactory(dir, [
    'attempt', 'transition', attemptId, 'rejected', '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict: 'REJECT', notes: 'method does not fit' }),
  ]);
  assert.equal(rejected.code, 0, rejected.err);
}

test('the CLI accepted transition refuses a production edit made after the proposal', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir);
    await vacuousRed(dir, attemptId);
    writeTestFile(dir);
    assert.equal((await propose(dir, attemptId)).code, 0);
    await toReviewedMethod(dir, attemptId);
    writeLateProductionFile(dir);
    const accepted = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'accepted', '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict: 'ACCEPT' }),
    ]);
    assert.notEqual(accepted.code, 0, accepted.out);
    assert.match(accepted.err, /already-satisfied no longer holds.*src\/lib\/late\.mjs/);
    assert.equal(getAttempt(dir, attemptId).state, 'awaiting-review');
  } finally {
    cleanup(dir);
  }
});

test('complete refuses an already-satisfied attempt whose production file changed after the proposal', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await startAttempt(dir);
    await vacuousRed(dir, attemptId);
    writeTestFile(dir);
    assert.equal((await propose(dir, attemptId)).code, 0);
    await toReviewedMethod(dir, attemptId);
    const accepted = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'accepted', '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict: 'ACCEPT' }),
    ]);
    assert.equal(accepted.code, 0, accepted.err + accepted.out);
    writeLateProductionFile(dir);
    commitAll(dir);
    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attemptId]);
    assert.notEqual(done.code, 0, done.out);
    assert.match(done.err, /already-satisfied no longer holds.*src\/lib\/late\.mjs/);
    assert.notEqual(getWorkItem(dir, 'demo', '1.1').status, 'done');
  } finally {
    cleanup(dir);
  }
});
