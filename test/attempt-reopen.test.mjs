import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { attemptPath, getAttempt } from '../src/lib/attempt.mjs';
import { renderWorkPacket } from '../src/lib/queue.mjs';
import { redSatisfaction } from '../src/lib/red-exceptions.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';
import { commitAll, nodeCheck, writeJson } from './factory-project.mjs';

const RAW = { rawRegistry: true };
const fakeForge = path.join(repoRoot, 'support/fake-forge.mjs');
const KINDS = ['unit', 'integration', 'contract'];
const REASON = 'profile added contract after acceptance';

function registry(exit) {
  return {
    schemaVersion: 1,
    checks: Object.fromEntries(KINDS.map((kind) => [kind, nodeCheck(`process.exit(${exit})`)])),
  };
}

function forgeEnvFor(forgeDir) {
  return {
    IDEFACTORY_FORGE: fakeForge,
    IDEFACTORY_FORGE_LOG: path.join(forgeDir, 'forge-argv.log'),
    IDEFACTORY_FORGE_DB: path.join(forgeDir, 'forge-db.json'),
  };
}

function ok(result) {
  assert.equal(result.code, 0, result.err + result.out);
  return result;
}

async function seed(dir, { policyVersion = 1, taskType = 'code' } = {}) {
  ok(await idefactory(dir, ['init']));
  const configFile = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.governance.policyVersion = policyVersion;
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  const profilesFile = path.join(dir, '.factory/profiles.json');
  fs.writeFileSync(profilesFile, JSON.stringify({
    ...JSON.parse(fs.readFileSync(profilesFile, 'utf8')),
    two: { checks: ['unit', 'integration'], humanGate: false },
  }, null, 2));
  writeJson(dir, '.factory/checks.json', registry(1));
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), [
    '- [ ] 1.1 Change the parser',
    '  factory:',
    '    kind: general',
    '    dependencies: []',
    ...(taskType ? [`    taskType: ${taskType}`] : []),
    '    checks: [unit, integration]',
    '    verificationProfile: two',
    '    roles: [engineer, reviewer, scribe]',
    '',
  ].join('\n'));
  ok(await idefactory(dir, ['sync-tasks', 'demo'], {}, RAW));
}

function addContractToProfile(dir) {
  const file = path.join(dir, '.factory/profiles.json');
  const profiles = JSON.parse(fs.readFileSync(file, 'utf8'));
  profiles.two.checks = ['unit', 'integration', 'contract'];
  fs.writeFileSync(file, JSON.stringify(profiles, null, 2));
}

function accept(dir, attemptId, reviewerId, env = {}) {
  return idefactory(dir, [
    'attempt', 'transition', attemptId, 'accepted', '--evidence', JSON.stringify({ reviewerId, verdict: 'ACCEPT', notes: 'looks right' }),
  ], env);
}

async function verifyAll(dir, attemptId) {
  for (const kind of KINDS) ok(await idefactory(dir, ['verify', 'run', attemptId, '--check', kind]));
}

/**
 * Reproduces the issue: genuine unit and integration reds, the profile gains contract after the
 * reds, the attempt is reviewed and accepted, and completion then fails on contract.
 */
async function acceptedWithoutContractRed(dir, env = {}, seedOptions = {}) {
  await seed(dir, seedOptions);
  commitAll(dir);
  const started = ok(await idefactory(dir, ['attempt', 'start', 'demo', '1.1']));
  const { id } = JSON.parse(started.out);
  ok(await idefactory(dir, ['attempt', 'transition', id, 'implementing', '--evidence', '{"implementerId":"engineer-1"}']));
  ok(await idefactory(dir, ['verify', 'run', id, '--check', 'unit', '--red']));
  ok(await idefactory(dir, ['verify', 'run', id, '--check', 'integration', '--red']));
  writeJson(dir, '.factory/checks.json', registry(0));
  commitAll(dir);
  ok(await idefactory(dir, ['verify', 'run', id, '--check', 'unit']));
  ok(await idefactory(dir, ['verify', 'run', id, '--check', 'integration']));
  ok(await idefactory(dir, ['attempt', 'transition', id, 'verifying', '--evidence', '{}']));
  ok(await idefactory(dir, ['attempt', 'transition', id, 'awaiting-review', '--evidence', '{}']));
  addContractToProfile(dir);
  commitAll(dir);
  await verifyAll(dir, id);
  ok(await accept(dir, id, 'reviewer-1', env));
  commitAll(dir);
  return id;
}

function reopen(dir, attemptId, overrides = {}) {
  const flags = {
    kind: ['contract'], for: 'exception', by: 'human-1', reason: REASON, ...overrides,
  };
  const args = ['attempt', 'reopen', attemptId];
  for (const kind of [].concat(flags.kind)) args.push('--kind', kind);
  args.push('--for', flags.for, '--by', flags.by, '--reason', flags.reason);
  return idefactory(dir, args);
}

function waive(dir, attemptId, kind = 'contract') {
  return idefactory(dir, ['red', 'waive', attemptId, '--kind', kind, '--note', 'contract is covered elsewhere', '--approver', 'human-1']);
}

function complete(dir, attemptId) {
  return idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attemptId]);
}

function attemptBytes(dir, attemptId) {
  return fs.readFileSync(attemptPath(dir, attemptId), 'utf8');
}

function exceptionFiles(dir) {
  const root = path.join(dir, '.factory/exceptions/red');
  return fs.existsSync(root) ? fs.readdirSync(root).sort() : [];
}

async function assertRefused(dir, attemptId, run, pattern) {
  const before = attemptBytes(dir, attemptId);
  const files = exceptionFiles(dir);
  const result = await run();
  assert.notEqual(result.code, 0, result.out);
  assert.match(result.err, pattern);
  assert.equal(attemptBytes(dir, attemptId), before);
  assert.deepEqual(exceptionFiles(dir), files);
}

function rewriteAttempt(dir, attemptId, mutate) {
  const attempt = getAttempt(dir, attemptId);
  mutate(attempt);
  fs.writeFileSync(attemptPath(dir, attemptId), JSON.stringify(attempt, null, 2));
}

test('end to end: an accepted attempt missing a red is reopened, covered by an exception, reviewed again, and completes', async () => {
  const world = tempProject();
  try {
    const attemptId = await acceptedWithoutContractRed(world);
    const first = getAttempt(world, attemptId);
    const firstReview = first.evidence.review;
    assert.equal(firstReview.reviewerId, 'reviewer-1');

    const failed = await complete(world, attemptId);
    assert.notEqual(failed.code, 0);
    assert.match(failed.err, /failing CLI red or red exception for: contract/);
    assert.match(failed.err, /idefactory attempt reopen/);

    const unreopened = await waive(world, attemptId);
    assert.notEqual(unreopened.code, 0);
    assert.match(unreopened.err, /idefactory attempt reopen/);
    assert.deepEqual(exceptionFiles(world), []);

    const before = getAttempt(world, attemptId);
    ok(await reopen(world, attemptId));
    const reopened = getAttempt(world, attemptId);
    assert.equal(reopened.state, 'awaiting-review');
    assert.equal(reopened.evidence.review, null);
    assert.equal(reopened.reviewerId, null);
    assert.equal(reopened.evidence.reopens.length, 1);
    assert.deepEqual(
      { by: reopened.evidence.reopens[0].by, purpose: reopened.evidence.reopens[0].purpose, kinds: reopened.evidence.reopens[0].kinds, reason: reopened.evidence.reopens[0].reason },
      { by: 'human-1', purpose: 'exception', kinds: ['contract'], reason: REASON },
    );
    const [kept] = reopened.evidence.reviewHistory;
    assert.equal(kept.verdict, 'ACCEPT');
    assert.equal(kept.reviewerId, 'reviewer-1');
    assert.equal(kept.notes, 'looks right');
    assert.equal(kept.at, firstReview.at);
    assert.match(kept.digest, /^sha256:[0-9a-f]{64}$/);
    for (const key of ['reds', 'red', 'verification', 'checks', 'redExceptions']) {
      assert.deepEqual(reopened.evidence[key], before.evidence[key], key);
    }
    assert.equal(reopened.history.at(-1).reopened, true);

    const noVerdict = await complete(world, attemptId);
    assert.notEqual(noVerdict.code, 0);
    assert.match(noVerdict.err, /accepted/i);

    const waived = ok(await waive(world, attemptId));
    assert.equal(JSON.parse(waived.out).exceptions[0].acknowledgedNotStuck, false);
    assert.equal(redSatisfaction(world, getAttempt(world, attemptId), 'contract'), 'waiver');

    const missingReviewer = await idefactory(world, ['attempt', 'transition', attemptId, 'accepted', '--evidence', '{"verdict":"ACCEPT"}']);
    assert.notEqual(missingReviewer.code, 0);

    ok(await accept(world, attemptId, 'reviewer-2'));
    commitAll(world);
    await verifyAll(world, attemptId);
    ok(await complete(world, attemptId));
    assert.equal(getWorkItem(world, 'demo', '1.1').status, 'done');
    const finished = getAttempt(world, attemptId);
    assert.equal(finished.evidence.review.reviewerId, 'reviewer-2');
    assert.equal(finished.evidence.reviewHistory[0].reviewerId, 'reviewer-1');
  } finally {
    cleanup(world);
  }
});

test('refusals name the cause and leave the attempt and exceptions unchanged', async () => {
  const dir = tempProject();
  try {
    const attemptId = await acceptedWithoutContractRed(dir);
    await assertRefused(dir, attemptId, () => reopen(dir, attemptId, { kind: ['unit'] }), /unit is already satisfied/);
    await assertRefused(dir, attemptId, () => reopen(dir, attemptId, { by: 'engineer-1' }), /must differ from the implementer/);
    await assertRefused(dir, attemptId, () => reopen(dir, attemptId, { for: 'both' }), /--for must be one of: method, exception/);
    await assertRefused(dir, attemptId, () => reopen(dir, attemptId, { kind: ['nonsense'] }), /not a required test kind/);

    const journal = path.join(dir, '.factory/orchestration/finalizations', `${attemptId}.json`);
    fs.mkdirSync(path.dirname(journal), { recursive: true });
    fs.writeFileSync(journal, '{}');
    await assertRefused(dir, attemptId, () => reopen(dir, attemptId), /finalization journal/);
    fs.rmSync(journal);

    rewriteAttempt(dir, attemptId, (attempt) => {
      attempt.evidence.reopens = [
        { at: 'a', by: 'h', purpose: 'method', kinds: ['contract'], reason: 'one' },
        { at: 'b', by: 'h', purpose: 'method', kinds: ['contract'], reason: 'two' },
      ];
    });
    await assertRefused(dir, attemptId, () => reopen(dir, attemptId), /reopen limit reached.*at most 2 times/);
    rewriteAttempt(dir, attemptId, (attempt) => { delete attempt.evidence.reopens; });

    for (const state of ['finalized', 'finalize-failed']) {
      rewriteAttempt(dir, attemptId, (attempt) => { attempt.state = state; });
      await assertRefused(dir, attemptId, () => reopen(dir, attemptId), new RegExp(`${state} cannot be reopened`));
    }
    rewriteAttempt(dir, attemptId, (attempt) => { attempt.state = 'awaiting-review'; });
    await assertRefused(dir, attemptId, () => reopen(dir, attemptId), /only an accepted attempt can be reopened \(attempt state=awaiting-review\)/);
  } finally {
    cleanup(dir);
  }
});

test('policy version 2 refuses a reopen that no verified principal confirms', async () => {
  const dir = tempProject();
  try {
    const attemptId = await acceptedWithoutContractRed(dir);
    const configFile = path.join(dir, '.factory/config.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    config.governance.policyVersion = 2;
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    await assertRefused(dir, attemptId, () => reopen(dir, attemptId), /principal|verifier/i);
  } finally {
    cleanup(dir);
  }
});

test('attempt transition still refuses accepted to awaiting-review', async () => {
  const dir = tempProject();
  try {
    const attemptId = await acceptedWithoutContractRed(dir);
    const before = attemptBytes(dir, attemptId);
    const result = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'awaiting-review', '--evidence', JSON.stringify({ reviewerId: 'reviewer-1' }),
    ]);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /illegal|transition/i);
    assert.equal(attemptBytes(dir, attemptId), before);
  } finally {
    cleanup(dir);
  }
});

test('the amendment window covers only the reopened kinds and closes on re-acceptance', async () => {
  const dir = tempProject();
  try {
    const attemptId = await acceptedWithoutContractRed(dir);
    ok(await reopen(dir, attemptId));
    await assertRefused(dir, attemptId, () => waive(dir, attemptId, 'unit'), /reopened for contract; unit is outside that reopen/);
    ok(await waive(dir, attemptId));
    ok(await accept(dir, attemptId, 'reviewer-2'));
    await assertRefused(dir, attemptId, () => waive(dir, attemptId), /idefactory attempt reopen/);
  } finally {
    cleanup(dir);
  }
});

test('a non-reopened attempt still gets the not-stuck warning and a reopened kind does not', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    commitAll(dir);
    const { id } = JSON.parse(ok(await idefactory(dir, ['attempt', 'start', 'demo', '1.1'])).out);
    ok(await idefactory(dir, ['attempt', 'transition', id, 'implementing', '--evidence', '{"implementerId":"engineer-1"}']));
    const warned = await waive(dir, id, 'unit');
    assert.notEqual(warned.code, 0);
    assert.match(warned.err, /acknowledge/i);
  } finally {
    cleanup(dir);
  }
});

test('a method proposal for a reopened kind is reviewed, re-accepted, and completes with no red', async () => {
  const dir = tempProject();
  try {
    const attemptId = await acceptedWithoutContractRed(dir, {}, { taskType: null });
    ok(await reopen(dir, attemptId, { for: 'method' }));
    const outside = await idefactory(dir, [
      'method', 'propose', attemptId, '--choice', 'no-red', '--reason', 'configuration',
      '--rationale', 'only a config value changes', '--implementer', 'engineer-1', '--kind', 'unit',
    ]);
    assert.notEqual(outside.code, 0);
    assert.match(outside.err, /outside that reopen/);
    const proposed = await idefactory(dir, [
      'method', 'propose', attemptId, '--choice', 'no-red', '--reason', 'configuration',
      '--rationale', 'only a config value changes', '--implementer', 'engineer-1', '--kind', 'contract',
    ]);
    ok(proposed);
    ok(await idefactory(dir, [
      'method', 'review', attemptId, '--verdict', 'ACCEPT', '--reviewer', 'reviewer-2', '--note', 'checked the diff',
    ]));
    ok(await accept(dir, attemptId, 'reviewer-2'));
    commitAll(dir);
    await verifyAll(dir, attemptId);
    ok(await complete(dir, attemptId));
    assert.equal(getAttempt(dir, attemptId).evidence.reds?.contract, undefined);
  } finally {
    cleanup(dir);
  }
});

test('status, the reviewer packet, the review request, and the verdict comment show the reopen and earlier verdict', async () => {
  const dir = tempProject();
  const forgeDir = tempProject();
  const forgeEnv = forgeEnvFor(forgeDir);
  try {
    await seed(dir);
    commitAll(dir);
    const { id } = JSON.parse(ok(await idefactory(dir, ['attempt', 'start', 'demo', '1.1'])).out);
    ok(await idefactory(dir, ['pr', 'open', 'demo'], forgeEnv));
    ok(await idefactory(dir, ['attempt', 'transition', id, 'implementing', '--evidence', '{"implementerId":"engineer-1"}']));
    ok(await idefactory(dir, ['verify', 'run', id, '--check', 'unit', '--red']));
    ok(await idefactory(dir, ['verify', 'run', id, '--check', 'integration', '--red']));
    writeJson(dir, '.factory/checks.json', registry(0));
    commitAll(dir);
    ok(await idefactory(dir, ['verify', 'run', id, '--check', 'unit']));
    ok(await idefactory(dir, ['verify', 'run', id, '--check', 'integration']));
    ok(await idefactory(dir, ['attempt', 'transition', id, 'verifying', '--evidence', '{}']));
    ok(await idefactory(dir, ['attempt', 'transition', id, 'awaiting-review', '--evidence', '{}']));
    addContractToProfile(dir);
    commitAll(dir);
    await verifyAll(dir, id);
    ok(await accept(dir, id, 'reviewer-1', forgeEnv));
    commitAll(dir);
    ok(await reopen(dir, id));

    const status = (await idefactory(dir, ['status'])).out;
    assert.match(status, /Reopened attempts:/);
    assert.match(status, new RegExp(REASON));
    assert.match(status, /earlier verdict ACCEPT by reviewer-1/);

    const packet = renderWorkPacket(dir, getWorkItem(dir, 'demo', '1.1'), 'reviewer');
    assert.match(packet, /Reopened attempt/);
    assert.match(packet, new RegExp(REASON));
    assert.match(packet, /for exception \(contract\)/);
    assert.match(packet, /earlier verdict ACCEPT by reviewer-1/);

    const request = (await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1'])).out;
    assert.match(request, new RegExp(REASON));
    assert.match(request, /earlier verdict ACCEPT by reviewer-1/);

    ok(await waive(dir, id));
    ok(await accept(dir, id, 'reviewer-2', forgeEnv));
    const log = fs.readFileSync(forgeEnv.IDEFACTORY_FORGE_LOG, 'utf8');
    const bodies = log.split('\n').filter(Boolean).map((line) => JSON.parse(line))
      .filter((argv) => argv[0] === 'pr' && argv[1] === 'comment')
      .map((argv) => argv[argv.indexOf('--body') + 1]);
    const comment = bodies.find((body) => /reopened/.test(body));
    assert.ok(comment, bodies.join('\n'));
    assert.match(comment, /for exception \(contract\)/);
    assert.match(comment, /earlier verdict ACCEPT by reviewer-1/);
  } finally {
    cleanup(dir);
    cleanup(forgeDir);
  }
});

test('the reopen event records the attempt and omits the reason', async () => {
  const dir = tempProject();
  try {
    const attemptId = await acceptedWithoutContractRed(dir);
    ok(await reopen(dir, attemptId));
    const events = fs.readFileSync(path.join(dir, '.factory/observability/events.jsonl'), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line));
    const event = events.find((row) => row.type === 'attempt.reopened');
    assert.equal(event.attemptId, attemptId);
    assert.equal(event.change, 'demo');
    assert.equal(event.task, '1.1');
    assert.equal(JSON.stringify(events).includes(REASON), false);
  } finally {
    cleanup(dir);
  }
});

test('attempt reopen is documented without changing the global usage', async () => {
  const dir = tempProject();
  try {
    const help = await idefactory(dir, ['help', 'attempt', 'reopen', '--json']);
    assert.equal(help.code, 0, help.err);
    const doc = JSON.parse(help.out);
    assert.match(JSON.stringify(doc), /--for method\|exception/);
    const global = await idefactory(dir, ['--help']);
    assert.doesNotMatch(global.out, /attempt reopen/);
  } finally {
    cleanup(dir);
  }
});
