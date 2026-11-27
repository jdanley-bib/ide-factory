import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { attemptPath, getAttempt } from '../src/lib/attempt.mjs';
import { classifyTask } from '../src/lib/classify.mjs';
import { redSatisfaction } from '../src/lib/red-exceptions.mjs';
import { readBoundMethod } from '../src/lib/red-method.mjs';
import { renderWorkPacket } from '../src/lib/queue.mjs';
import { resolveGitBinding } from '../src/lib/verification-evidence.mjs';
import { getWorkItem, upsertWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';
import { commitAll, git, nodeCheck, writeJson } from './factory-project.mjs';

const RAW = { rawRegistry: true };
const fakeForge = path.join(repoRoot, 'support/fake-forge.mjs');

function registry(kinds, exit = 0) {
  return {
    schemaVersion: 1,
    checks: Object.fromEntries(kinds.map((kind) => [kind, nodeCheck(`process.exit(${exit})`)])),
  };
}

function taskBlock({ taskType, checks = ['unit'], profile = 'cli', id = '1.1' } = {}) {
  return [
    `- [ ] ${id} Tune the parser setting`,
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

async function seed(dir, { tasks = taskBlock(), kinds = ['unit'], exit = 1, profiles = {} } = {}) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  const configFile = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.governance.policyVersion = 1;
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  if (Object.keys(profiles).length) {
    const file = path.join(dir, '.factory/profiles.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...profiles }, null, 2));
  }
  writeJson(dir, '.factory/checks.json', registry(kinds, exit));
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), tasks);
  const synced = await idefactory(dir, ['sync-tasks', 'demo'], {}, RAW);
  assert.equal(synced.code, 0, synced.err + synced.out);
}

async function startAttempt(dir, { task = '1.1', implementerId = 'engineer-1', implementing = true } = {}) {
  const started = await idefactory(dir, ['attempt', 'start', 'demo', task]);
  assert.equal(started.code, 0, started.err + started.out);
  const { id } = JSON.parse(started.out);
  if (implementing) {
    const moved = await idefactory(dir, [
      'attempt', 'transition', id, 'implementing', '--evidence', JSON.stringify({ implementerId }),
    ]);
    assert.equal(moved.code, 0, moved.err);
  }
  return id;
}

function propose(dir, attemptId, overrides = []) {
  const base = [
    'method', 'propose', attemptId, '--choice', 'no-red', '--reason', 'configuration',
    '--rationale', 'only a config value changes', '--implementer', 'engineer-1', '--kind', 'unit',
  ];
  return idefactory(dir, [...base, ...overrides]);
}

function review(dir, attemptId, verdict = 'ACCEPT', reviewer = 'reviewer-1') {
  return idefactory(dir, [
    'method', 'review', attemptId, '--verdict', verdict, '--reviewer', reviewer, '--note', 'checked the diff',
  ]);
}

function methodFiles(dir) {
  const root = path.join(dir, '.factory/methods');
  return fs.existsSync(root) ? fs.readdirSync(root).filter((name) => name.endsWith('.json')) : [];
}

function attemptBytes(dir, attemptId) {
  return fs.readFileSync(attemptPath(dir, attemptId), 'utf8');
}

async function assertRefused(dir, attemptId, result, pattern) {
  const before = attemptBytes(dir, attemptId);
  const filesBefore = methodFiles(dir);
  const outcome = await result();
  assert.notEqual(outcome.code, 0, outcome.out);
  assert.match(outcome.err, pattern);
  assert.equal(attemptBytes(dir, attemptId), before);
  assert.deepEqual(methodFiles(dir), filesBefore);
}

test('taskTypeSource marks explicit and inferred classes and a legacy item reads as explicit', async () => {
  const explicit = classifyTask({ id: '1.1', title: 'x', factory: { taskType: 'code' } });
  assert.equal(explicit.taskTypeSource, 'explicit');
  const inferredDocs = classifyTask({ id: '1.1', title: 'Update the readme docs', factory: { kind: 'docs' } });
  assert.equal(inferredDocs.taskType, 'lightweight');
  assert.equal(inferredDocs.taskTypeSource, 'inferred');
  const dir = tempProject();
  try {
    await seed(dir);
    const item = getWorkItem(dir, 'demo', '1.1');
    assert.equal(item.factory.taskTypeSource, 'inferred');
    const legacy = getWorkItem(dir, 'demo', '1.1');
    delete legacy.factory.taskTypeSource;
    upsertWorkItem(dir, legacy);
    assert.equal(getWorkItem(dir, 'demo', '1.1').factory.taskTypeSource, undefined);
    const attemptId = await startAttempt(dir);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId), /explicit factory\.taskType/);
  } finally {
    cleanup(dir);
  }
});

test('a proposal records an immutable, digest-bound method with its revision and changed-file count', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    fs.writeFileSync(path.join(dir, 'src-change.txt'), 'x');
    const proposed = await propose(dir, attemptId);
    assert.equal(proposed.code, 0, proposed.err);
    const attempt = getAttempt(dir, attemptId);
    const record = readBoundMethod(dir, attempt);
    assert.equal(record.schemaVersion, 1);
    assert.equal(record.proposer, 'engineer-1');
    assert.equal(record.reason, 'configuration');
    assert.deepEqual(record.kinds, ['unit']);
    assert.equal(record.rationale, 'only a config value changes');
    assert.equal(record.sourceRevision, git(dir, ['rev-parse', 'HEAD']));
    assert.equal(record.changedFiles, 1);
    assert.equal(redSatisfaction(dir, attempt, 'unit'), 'method');

    await assertRefused(dir, attemptId, () => propose(dir, attemptId), /already has a method/);

    const file = path.join(dir, '.factory/methods', `${record.id}.json`);
    const original = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, original.replace('config value', 'other value'));
    assert.equal(readBoundMethod(dir, getAttempt(dir, attemptId)), null);
    assert.equal(redSatisfaction(dir, getAttempt(dir, attemptId), 'unit'), 'missing');
    fs.writeFileSync(file, original);
    assert.ok(readBoundMethod(dir, getAttempt(dir, attemptId)));
    fs.rmSync(file);
    assert.equal(redSatisfaction(dir, getAttempt(dir, attemptId), 'unit'), 'missing');
  } finally {
    cleanup(dir);
  }
});

test('a method record does not dirty the source revision, but a product change does', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    assert.equal((await propose(dir, attemptId)).code, 0);
    assert.equal(methodFiles(dir).length, 1);
    assert.equal(resolveGitBinding(dir).worktreeClean, true);
    fs.writeFileSync(path.join(dir, 'product.txt'), 'changed');
    assert.equal(resolveGitBinding(dir).worktreeClean, false);
  } finally {
    cleanup(dir);
  }
});

test('proposal refusals name the cause and record nothing', async () => {
  const dir = tempProject();
  try {
    await seed(dir, { kinds: ['unit', 'integration'], profiles: { both: { checks: ['unit', 'integration'], humanGate: false } }, tasks: taskBlock({ profile: 'both', checks: ['unit', 'integration'] }) });
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId, ['--reason', 'faster']), /one of: docs-or-text, configuration, behavior-preserving, mechanical, exploratory/);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId, ['--reason', 'behavior-preserving']), /cite at least one existing tracked test/);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId, ['--reason', 'behavior-preserving', '--test-path', 'test/missing.test.mjs']), /does not exist/);
    fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'test/untracked.test.mjs'), '// t');
    await assertRefused(dir, attemptId, () => propose(dir, attemptId, ['--reason', 'behavior-preserving', '--test-path', 'test/untracked.test.mjs']), /not tracked by git/);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId, ['--kind', 'contract']), /not a required test kind/);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId, ['--choice', 'red-first']), /must be no-red/);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId, ['--implementer', 'someone-else']), /must be the attempt implementer/);

    const red = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit', '--red']);
    assert.equal(red.code, 0, red.err + red.out);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId), /failing red is already stored for unit/);
  } finally {
    cleanup(dir);
  }
});

test('a late proposal, an explicit class, and a lightweight item are refused', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    const red = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit', '--red']);
    assert.equal(red.code, 0, red.err + red.out);
    assert.equal((await idefactory(dir, ['attempt', 'transition', attemptId, 'red-confirmed', '--evidence', '{}'])).code, 0);
    await assertRefused(dir, attemptId, () => propose(dir, attemptId), /only before red-confirmed or verifying/);
  } finally {
    cleanup(dir);
  }
  const explicitDir = tempProject();
  try {
    await seed(explicitDir, { tasks: taskBlock({ taskType: 'code' }) });
    commitAll(explicitDir);
    const attemptId = await startAttempt(explicitDir);
    await assertRefused(explicitDir, attemptId, () => propose(explicitDir, attemptId), /explicit factory\.taskType \(code\)/);
  } finally {
    cleanup(explicitDir);
  }
  const lightDir = tempProject();
  try {
    await seed(lightDir, { tasks: taskBlock({ taskType: 'lightweight' }) });
    commitAll(lightDir);
    const attemptId = await startAttempt(lightDir);
    await assertRefused(lightDir, attemptId, () => propose(lightDir, attemptId), /lightweight/);
  } finally {
    cleanup(lightDir);
  }
});

test('a method satisfies only its covered kinds at the gate into verifying', async () => {
  const dir = tempProject();
  try {
    await seed(dir, {
      kinds: ['unit', 'integration'],
      profiles: { both: { checks: ['unit', 'integration'], humanGate: false } },
      tasks: taskBlock({ profile: 'both', checks: ['unit', 'integration'] }),
    });
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    assert.equal((await propose(dir, attemptId)).code, 0);

    const refused = await idefactory(dir, ['attempt', 'transition', attemptId, 'verifying', '--evidence', '{}']);
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /verifying requires a recorded failing CLI red for: integration/);
    assert.doesNotMatch(refused.err, /unit/);

    const red = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'integration', '--red']);
    assert.equal(red.code, 0, red.err + red.out);
    const verifying = await idefactory(dir, ['attempt', 'transition', attemptId, 'verifying', '--evidence', '{}']);
    assert.equal(verifying.code, 0, verifying.err);
    assert.equal(getAttempt(dir, attemptId).evidence.reds?.unit, undefined);
  } finally {
    cleanup(dir);
  }
});

test('the run request asks for verifying once a method covers the only test kind', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    const before = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.match(before.out, /method propose/);
    assert.equal((await propose(dir, attemptId)).code, 0);
    const after = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1', '--new-run']);
    assert.match(after.out, /"nextState": "verifying"/);
    assert.match(after.out, /covered by the recorded no-red method/);
    assert.match(after.out, /Red method:/);
    assert.doesNotMatch(after.out, /exception/i);
  } finally {
    cleanup(dir);
  }
});

async function toAwaitingReview(dir, attemptId) {
  writeJson(dir, '.factory/checks.json', registry(['unit'], 0));
  commitAll(dir);
  const pass = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit']);
  assert.equal(pass.code, 0, pass.err + pass.out);
  const verifying = await idefactory(dir, ['attempt', 'transition', attemptId, 'verifying', '--evidence', '{}']);
  assert.equal(verifying.code, 0, verifying.err);
  const handoff = await idefactory(dir, ['attempt', 'transition', attemptId, 'awaiting-review', '--evidence', '{}']);
  assert.equal(handoff.code, 0, handoff.err);
}

function accept(dir, attemptId) {
  return idefactory(dir, [
    'attempt', 'transition', attemptId, 'accepted', '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict: 'ACCEPT' }),
  ]);
}

test('accepted needs an ACCEPT method review from a reviewer other than the implementer', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    assert.equal((await propose(dir, attemptId)).code, 0);
    await toAwaitingReview(dir, attemptId);

    const noReview = await accept(dir, attemptId);
    assert.notEqual(noReview.code, 0);
    assert.match(noReview.err, /needs a method review/);

    await assertRefused(dir, attemptId, () => review(dir, attemptId, 'ACCEPT', 'engineer-1'), /must differ from the implementer/);
    const rejected = await review(dir, attemptId, 'REJECT');
    assert.equal(rejected.code, 0, rejected.err);
    const afterReject = await accept(dir, attemptId);
    assert.notEqual(afterReject.code, 0);
    assert.match(afterReject.err, /rejected in review: checked the diff/);
    await assertRefused(dir, attemptId, () => review(dir, attemptId, 'ACCEPT'), /already has a method review/);
  } finally {
    cleanup(dir);
  }
});

test('a review needs a method, and policy version 2 needs a verified principal', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    assert.equal((await review(dir, attemptId)).code === 0, false);
    assert.match((await review(dir, attemptId)).err, /no valid no-red method/);
    assert.equal((await propose(dir, attemptId)).code, 0);
    await toAwaitingReview(dir, attemptId);
    const configFile = path.join(dir, '.factory/config.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    config.governance.policyVersion = 2;
    delete config.governance.principalVerifier;
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    await assertRefused(dir, attemptId, () => review(dir, attemptId), /principal/);
  } finally {
    cleanup(dir);
  }
});

test('completion repeats the method review check against an attempt edited to skip it', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    assert.equal((await propose(dir, attemptId)).code, 0);
    await toAwaitingReview(dir, attemptId);
    const file = attemptPath(dir, attemptId);
    const attempt = JSON.parse(fs.readFileSync(file, 'utf8'));
    attempt.state = 'accepted';
    attempt.reviewerId = 'reviewer-1';
    fs.writeFileSync(file, `${JSON.stringify(attempt, null, 2)}\n`);
    commitAll(dir);
    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attemptId]);
    assert.notEqual(done.code, 0);
    assert.match(done.err, /needs a method review/);
    assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'in_progress');
  } finally {
    cleanup(dir);
  }
});

test('a rejected method makes the next attempt red-first and refuses a new proposal', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    commitAll(dir);
    const first = await startAttempt(dir);
    assert.equal((await propose(dir, first)).code, 0);
    await toAwaitingReview(dir, first);
    assert.equal((await review(dir, first, 'REJECT')).code, 0);
    const rejected = await idefactory(dir, [
      'attempt', 'transition', first, 'rejected', '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict: 'REJECT', notes: 'method does not fit' }),
    ]);
    assert.equal(rejected.code, 0, rejected.err);

    const second = await startAttempt(dir);
    assert.notEqual(second, first);
    assert.equal(readBoundMethod(dir, getAttempt(dir, second)), null);
    await assertRefused(dir, second, () => propose(dir, second), /was rejected on attempt/);
    const early = await idefactory(dir, ['attempt', 'transition', second, 'verifying', '--evidence', '{}']);
    assert.notEqual(early.code, 0);
    assert.match(early.err, /verifying requires a recorded failing CLI red for: unit/);
  } finally {
    cleanup(dir);
  }
});

test('the packet, reviewer packet, status, and show state the method and never call it a red or an exception', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    assert.equal((await propose(dir, attemptId)).code, 0);
    const item = getWorkItem(dir, 'demo', '1.1');
    const engineer = renderWorkPacket(dir, item, 'engineer');
    assert.match(engineer, /^Red required for: none$/m);
    assert.match(engineer, /Method no-red for unit/);
    assert.match(engineer, /reason class configuration/);
    assert.match(engineer, /only a config value changes/);
    assert.match(engineer, /method review pending/);
    const reviewer = renderWorkPacket(dir, item, 'reviewer');
    assert.match(reviewer, /idefactory method review/);
    assert.match(reviewer, /changed file\(s\)/);
    for (const text of [engineer, reviewer]) {
      assert.doesNotMatch(text, /No red ran/);
      assert.doesNotMatch(text, /Red exceptions:/);
    }
    const status = await idefactory(dir, ['status']);
    assert.match(status.out, /Red methods:/);
    assert.match(status.out, /Method no-red for unit/);
    assert.doesNotMatch(status.out, /No red ran/);
    const doc = JSON.parse((await idefactory(dir, ['status', '--json'])).out);
    assert.equal(doc.redMethods.length, 1);
    assert.deepEqual(doc.redExceptions, []);
    const shown = await idefactory(dir, ['method', 'show', attemptId]);
    assert.match(shown.out, /Method no-red for unit/);
  } finally {
    cleanup(dir);
  }
});

test('method events record the attempt and omit text', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    assert.equal((await propose(dir, attemptId)).code, 0);
    await toAwaitingReview(dir, attemptId);
    assert.equal((await review(dir, attemptId)).code, 0);
    const events = fs.readFileSync(path.join(dir, '.factory/observability/events.jsonl'), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line));
    const proposed = events.find((event) => event.type === 'method.proposed');
    const reviewed = events.find((event) => event.type === 'method.reviewed');
    assert.equal(proposed.attemptId, attemptId);
    assert.equal(proposed.change, 'demo');
    assert.equal(proposed.task, '1.1');
    assert.equal(reviewed.verdict, 'ACCEPT');
    assert.equal(JSON.stringify(events).includes('config value'), false);
    assert.equal(JSON.stringify(events).includes('checked the diff'), false);
  } finally {
    cleanup(dir);
  }
});

test('method help is documented without changing the global usage', async () => {
  const dir = tempProject();
  try {
    const propose_ = await idefactory(dir, ['help', 'method', 'propose']);
    assert.equal(propose_.code, 0);
    assert.match(propose_.out, /docs-or-text, configuration, behavior-preserving, mechanical, exploratory/);
    const json = JSON.parse((await idefactory(dir, ['help', 'method', 'review', '--json'])).out);
    assert.equal(json.usage.startsWith('idefactory method review'), true);
    assert.equal(JSON.parse((await idefactory(dir, ['help', 'method', 'show', '--json'])).out).effects, 'read-only');
    const global = await idefactory(dir, ['help']);
    assert.doesNotMatch(global.out, /method propose/);
  } finally {
    cleanup(dir);
  }
});

test('no module outside red-method reads the stored method record directly', () => {
  const root = path.join(repoRoot, 'src/lib');
  const offenders = [];
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith('.mjs') || name === 'red-method.mjs') continue;
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    if (/evidence\??\.method(Review)?\b/.test(text)) offenders.push(name);
  }
  assert.deepEqual(offenders, []);
});

test('end to end: an inferred code item completes with a no-red method and no human approval', async () => {
  const dir = tempProject();
  const forgeDir = tempProject();
  const forgeEnv = {
    IDEFACTORY_FORGE: fakeForge,
    IDEFACTORY_FORGE_LOG: path.join(forgeDir, 'forge-argv.log'),
    IDEFACTORY_FORGE_DB: path.join(forgeDir, 'forge-db.json'),
  };
  try {
    await seed(dir);
    commitAll(dir);
    const attemptId = await startAttempt(dir);
    assert.equal((await propose(dir, attemptId)).code, 0);
    const opened = await idefactory(dir, ['pr', 'open', 'demo'], forgeEnv);
    assert.equal(opened.code, 0, opened.err + opened.out);
    await toAwaitingReview(dir, attemptId);
    assert.equal((await review(dir, attemptId)).code, 0);
    const accepted = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'accepted', '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict: 'ACCEPT' }),
    ], forgeEnv);
    assert.equal(accepted.code, 0, accepted.err + accepted.out);
    commitAll(dir);
    const reverified = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit']);
    assert.equal(reverified.code, 0, reverified.err + reverified.out);
    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attemptId]);
    assert.equal(done.code, 0, done.err + done.out);
    assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'done');
    const attempt = getAttempt(dir, attemptId);
    assert.equal(attempt.evidence.reds?.unit, undefined);
    assert.equal(attempt.evidence.red ?? null, null);
    const approvals = path.join(dir, '.factory/approvals');
    assert.equal(fs.existsSync(approvals) ? fs.readdirSync(approvals).filter((name) => name.endsWith('.json')).length : 0, 0);
    assert.equal(fs.existsSync(path.join(dir, '.factory/exceptions/red')) && fs.readdirSync(path.join(dir, '.factory/exceptions/red')).length > 0, false);

    const log = fs.readFileSync(forgeEnv.IDEFACTORY_FORGE_LOG, 'utf8');
    const bodies = log.split('\n').filter(Boolean).map((line) => JSON.parse(line))
      .filter((argv) => argv[0] === 'pr' && argv[1] === 'comment')
      .map((argv) => argv[argv.indexOf('--body') + 1]);
    assert.ok(bodies.some((body) => /Method no-red for unit/.test(body) && /method review ACCEPT/.test(body)), bodies.join('\n'));
    assert.ok(bodies.every((body) => !/No red ran/.test(body)));
  } finally {
    cleanup(dir);
    cleanup(forgeDir);
  }
});
