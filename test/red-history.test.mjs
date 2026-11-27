import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { attemptPath, getAttempt } from '../src/lib/attempt.mjs';
import { redHistoryFor } from '../src/lib/red-evidence.mjs';
import {
  bindRedException,
  describeException,
  listAttemptExceptions,
  redDigestOf,
  redSatisfaction,
} from '../src/lib/red-exceptions.mjs';
import { renderWorkPacket } from '../src/lib/queue.mjs';
import { resolveGitBinding } from '../src/lib/verification-evidence.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';
import { commitAll, nodeCheck, retireAttempt, writeJson } from './factory-project.mjs';

const RAW = { rawRegistry: true };
const fakeForge = path.join(repoRoot, 'support/fake-forge.mjs');
const INVALID = 'recorded after implementing';

function registry(exit, extra = '') {
  return { schemaVersion: 1, checks: { unit: nodeCheck(`${extra}process.exit(${exit})`) } };
}

function ok(result) {
  assert.equal(result.code, 0, result.err + result.out);
  return result;
}

async function seed(dir) {
  ok(await idefactory(dir, ['init']));
  const configFile = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.governance.policyVersion = 1;
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  writeJson(dir, '.factory/checks.json', registry(1));
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), [
    '- [ ] 1.1 Change the parser',
    '  factory:',
    '    kind: general',
    '    dependencies: []',
    '    taskType: code',
    '    checks: [unit]',
    '    verificationProfile: cli',
    '    roles: [engineer, reviewer, scribe]',
    '',
  ].join('\n'));
  ok(await idefactory(dir, ['sync-tasks', 'demo'], {}, RAW));
  commitAll(dir);
}

async function implementing(dir) {
  const { id } = JSON.parse(ok(await idefactory(dir, ['attempt', 'start', 'demo', '1.1'])).out);
  ok(await idefactory(dir, ['attempt', 'transition', id, 'implementing', '--evidence', '{"implementerId":"engineer-1"}']));
  return id;
}

const red = (dir, id) => idefactory(dir, ['verify', 'run', id, '--check', 'unit', '--red']);

function invalidate(dir, id, reason = INVALID) {
  return idefactory(dir, [
    'red', 'waive', id, '--kind', 'unit', '--note', 'post-hoc red', '--approver', 'human-1',
    '--invalid-red', reason, '--acknowledge-not-stuck',
  ]);
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 15));

function snapshot(dir) {
  const rows = {};
  const walk = (current) => {
    for (const name of fs.readdirSync(current)) {
      if (name === '.git' || name === 'node_modules') continue;
      const file = path.join(current, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else rows[path.relative(dir, file)] = fs.readFileSync(file, 'utf8');
    }
  };
  walk(dir);
  return rows;
}

function rewrite(dir, id, mutate) {
  const attempt = getAttempt(dir, id);
  mutate(attempt);
  fs.writeFileSync(attemptPath(dir, id), JSON.stringify(attempt, null, 2));
}

async function invalidatedWithLaterRed(dir) {
  await seed(dir);
  const id = await implementing(dir);
  ok(await red(dir, id));
  ok(await invalidate(dir, id));
  await pause();
  ok(await red(dir, id));
  return id;
}

test('a second red appends, keeps the first byte-identical, and becomes the current red', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const id = await implementing(dir);
    ok(await red(dir, id));
    const first = getAttempt(dir, id).evidence.reds.unit;
    const firstText = JSON.stringify(first);
    await pause();
    ok(await red(dir, id));
    const attempt = getAttempt(dir, id);
    const history = attempt.evidence.redHistory.unit;
    assert.equal(history.length, 2);
    assert.equal(JSON.stringify(history[0]), firstText);
    assert.deepEqual(attempt.evidence.reds.unit, history[1]);
    assert.ok(Date.parse(history[1].startedAt) >= Date.parse(history[0].startedAt));
    assert.equal(redSatisfaction(dir, attempt, 'unit'), 'cli');
  } finally {
    cleanup(dir);
  }
});

test('an attempt stored without a history reads as one entry whose digest matches the waiver', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const id = await implementing(dir);
    ok(await red(dir, id));
    ok(await invalidate(dir, id));
    rewrite(dir, id, (attempt) => { delete attempt.evidence.redHistory; });
    const attempt = getAttempt(dir, id);
    assert.equal(redHistoryFor(attempt, 'unit').length, 1);
    const doc = JSON.parse(ok(await idefactory(dir, ['red', 'list', id, '--json'])).out);
    const [entry] = doc.kinds.find((row) => row.kind === 'unit').entries;
    const [row] = listAttemptExceptions(dir, attempt);
    assert.equal(entry.digest, row.invalidRedDigest);
    assert.equal(entry.digest, redDigestOf(attempt.evidence.reds.unit));

    ok(await red(dir, id));
    const after = getAttempt(dir, id);
    assert.equal(after.evidence.redHistory.unit.length, 2);
    assert.equal(redDigestOf(after.evidence.redHistory.unit[0]), row.invalidRedDigest);
  } finally {
    cleanup(dir);
  }
});

test('a red after reuse or an ordinary waiver is refused without spawning the check; after an invalid-red waiver one is allowed', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const marker = path.join(dir, 'ran.txt');
    writeJson(dir, '.factory/checks.json', registry(1, `require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'x');`));
    const waived = await implementing(dir);
    ok(await idefactory(dir, [
      'red', 'waive', waived, '--kind', 'unit', '--note', 'covered elsewhere', '--approver', 'human-1', '--acknowledge-not-stuck',
    ]));
    retireAttempt(dir, waived);
    const reused = await implementing(dir);
    const attempt = getAttempt(dir, reused);
    bindRedException(dir, reused, {
      schemaVersion: 1,
      id: 'reuse-test-exception',
      type: 'reuse',
      change: attempt.change,
      task: attempt.taskId,
      attemptId: reused,
      kind: 'unit',
      approver: 'human-1',
      reason: 'verification-only retry',
      issuance: new Date().toISOString(),
      policyVersion: 1,
      sourceRevision: resolveGitBinding(dir).sourceRevision,
      source: { attemptId: waived },
    });
    for (const id of [waived, reused]) {
      const before = fs.readFileSync(attemptPath(dir, id), 'utf8');
      const result = await red(dir, id);
      assert.notEqual(result.code, 0);
      assert.match(result.err, /already excepted; a new red cannot replace it/);
      assert.equal(fs.readFileSync(attemptPath(dir, id), 'utf8'), before);
    }
    assert.equal(fs.existsSync(marker), false);

    retireAttempt(dir, reused);
    const invalidated = await implementing(dir);
    ok(await red(dir, invalidated));
    assert.equal(fs.readFileSync(marker, 'utf8'), 'x');
    ok(await invalidate(dir, invalidated));
    await pause();
    ok(await red(dir, invalidated));
    assert.equal(fs.readFileSync(marker, 'utf8'), 'xx');
    const before = fs.readFileSync(attemptPath(dir, invalidated), 'utf8');
    const again = await red(dir, invalidated);
    assert.notEqual(again.code, 0);
    assert.match(again.err, /later red for unit .* already recorded after the invalid-red waiver/);
    assert.equal(fs.readFileSync(attemptPath(dir, invalidated), 'utf8'), before);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'xx');
  } finally {
    cleanup(dir);
  }
});

test('a later red satisfies red only when it started after the waiver and the invalidated digest is still in history', async () => {
  const dir = tempProject();
  try {
    const id = await invalidatedWithLaterRed(dir);
    const attempt = getAttempt(dir, id);
    assert.equal(redSatisfaction(dir, attempt, 'unit'), 'cli');

    const early = structuredClone(attempt);
    early.evidence.reds.unit.startedAt = '2000-01-01T00:00:00.000Z';
    early.evidence.redHistory.unit[1] = early.evidence.reds.unit;
    assert.equal(redSatisfaction(dir, early, 'unit'), 'missing');

    const missing = structuredClone(attempt);
    missing.evidence.redHistory.unit = [missing.evidence.redHistory.unit[1]];
    assert.equal(redSatisfaction(dir, missing, 'unit'), 'missing');

    const tampered = structuredClone(attempt);
    tampered.evidence.redHistory.unit[0].exitCode = 2;
    assert.equal(redSatisfaction(dir, tampered, 'unit'), 'missing');

    const unchanged = structuredClone(attempt);
    unchanged.evidence.reds.unit = unchanged.evidence.redHistory.unit[0];
    assert.equal(redSatisfaction(dir, unchanged, 'unit'), 'waiver');
  } finally {
    cleanup(dir);
  }
});

test('a second invalidation is refused naming the existing exception and records nothing', async () => {
  const dir = tempProject();
  try {
    const id = await invalidatedWithLaterRed(dir);
    const exceptionId = getAttempt(dir, id).evidence.redExceptions.unit.id;
    const before = snapshot(dir);
    const result = await invalidate(dir, id, 'recorded after implementing again');
    assert.notEqual(result.code, 0);
    assert.match(result.err, new RegExp(`already has an exception for unit \\(${exceptionId}\\)`));
    const after = snapshot(dir);
    for (const key of Object.keys(before)) {
      if (key.startsWith('.factory/observability') || key === '.factory/ledger.jsonl') continue;
      assert.equal(after[key], before[key], key);
    }
    assert.deepEqual(Object.keys(after).filter((key) => key.startsWith('.factory/exceptions')), Object.keys(before).filter((key) => key.startsWith('.factory/exceptions')));
  } finally {
    cleanup(dir);
  }
});

test('red list shows both reds with a verifiable waiver reference and writes nothing', async () => {
  const dir = tempProject();
  try {
    const id = await invalidatedWithLaterRed(dir);
    const before = snapshot(dir);
    const text = ok(await idefactory(dir, ['red', 'list', id])).out;
    const doc = JSON.parse(ok(await idefactory(dir, ['red', 'list', id, '--json'])).out);
    assert.deepEqual(snapshot(dir), before);

    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.attemptId, id);
    const unit = doc.kinds.find((row) => row.kind === 'unit');
    assert.equal(unit.satisfiedBy, 'cli');
    assert.equal(unit.entries.length, 2);
    const exceptionId = getAttempt(dir, id).evidence.redExceptions.unit.id;
    assert.equal(unit.entries[0].invalidated, true);
    assert.equal(unit.entries[0].referencedBy, exceptionId);
    assert.equal(unit.entries[0].current, false);
    assert.equal(unit.entries[1].current, true);
    assert.equal(unit.entries[1].referencedBy, null);
    const attempt = getAttempt(dir, id);
    assert.equal(unit.entries[0].digest, redDigestOf(attempt.evidence.redHistory.unit[0]));
    assert.equal(unit.entries[0].digest, listAttemptExceptions(dir, attempt)[0].invalidRedDigest);
    for (const entry of unit.entries) assert.ok(text.includes(entry.digest));
    assert.match(text, /\[invalidated, referenced by /);
    assert.match(text, /\[current\]/);
  } finally {
    cleanup(dir);
  }
});

test('status, the reviewer packet, and the exception wording show both reds and never call the later one test-first proof', async () => {
  const dir = tempProject();
  try {
    const id = await invalidatedWithLaterRed(dir);
    const attempt = getAttempt(dir, id);
    const [row] = listAttemptExceptions(dir, attempt);
    assert.ok(row.laterRedDigest);
    assert.equal(row.laterRedDigest, redDigestOf(attempt.evidence.reds.unit));
    const sentence = describeException(row);
    for (const text of [sentence, (await idefactory(dir, ['status'])).out]) {
      assert.ok(text.includes(row.invalidRedDigest));
      assert.ok(text.includes(row.laterRedDigest));
      assert.match(text, /human-1/);
      assert.match(text, new RegExp(INVALID));
      assert.match(text, /not proof that the test came first/);
      assert.match(text, /reviewer relies on the recorded evidence to judge whether it preceded the implementation it tests/);
    }
    const item = getWorkItem(dir, 'demo', '1.1');
    ok(await idefactory(dir, ['attempt', 'transition', id, 'verifying', '--evidence', '{}']));
    const packet = renderWorkPacket(dir, item, 'reviewer');
    assert.ok(packet.includes(row.invalidRedDigest));
    assert.ok(packet.includes(row.laterRedDigest));

    const plain = describeException({
      attemptId: 'a', kind: 'unit', approver: 'human-1', reason: 'r', type: 'waiver', id: 'x',
      invalidRedDigest: 'sha256:aa', invalidRedReason: 'late',
    });
    assert.doesNotMatch(plain, /later failing red/);
  } finally {
    cleanup(dir);
  }
});

test('red list and help are documented without changing the global usage', async () => {
  const dir = tempProject();
  try {
    const help = ok(await idefactory(dir, ['help', 'red', 'list', '--json']));
    assert.match(help.out, /red list <attemptId>/);
    const global = ok(await idefactory(dir, ['--help']));
    assert.doesNotMatch(global.out, /red list/);
    const verifyHelp = ok(await idefactory(dir, ['help', 'verify', 'run']));
    assert.match(verifyHelp.out, /append-only/);
  } finally {
    cleanup(dir);
  }
});

test('end to end: an invalidated red plus one later red passes the gates, shows both on the verdict comment, and completes', async () => {
  const dir = tempProject();
  const forgeDir = tempProject();
  const forgeEnv = {
    IDEFACTORY_FORGE: fakeForge,
    IDEFACTORY_FORGE_LOG: path.join(forgeDir, 'forge-argv.log'),
    IDEFACTORY_FORGE_DB: path.join(forgeDir, 'forge-db.json'),
  };
  try {
    await seed(dir);
    const id = await implementing(dir);
    ok(await idefactory(dir, ['pr', 'open', 'demo'], forgeEnv));
    ok(await red(dir, id));
    ok(await invalidate(dir, id));
    await pause();
    ok(await red(dir, id));
    writeJson(dir, '.factory/checks.json', registry(0));
    commitAll(dir);
    ok(await idefactory(dir, ['verify', 'run', id, '--check', 'unit']));
    ok(await idefactory(dir, ['attempt', 'transition', id, 'verifying', '--evidence', '{}']));
    ok(await idefactory(dir, ['attempt', 'transition', id, 'awaiting-review', '--evidence', '{}']));
    ok(await idefactory(dir, [
      'attempt', 'transition', id, 'accepted', '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict: 'ACCEPT' }),
    ], forgeEnv));
    commitAll(dir);
    ok(await idefactory(dir, ['verify', 'run', id, '--check', 'unit']));
    ok(await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', id]));
    assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'done');

    const attempt = getAttempt(dir, id);
    const [row] = listAttemptExceptions(dir, attempt);
    const bodies = fs.readFileSync(forgeEnv.IDEFACTORY_FORGE_LOG, 'utf8').split('\n').filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((argv) => argv[0] === 'pr' && argv[1] === 'comment')
      .map((argv) => argv[argv.indexOf('--body') + 1]);
    const comment = bodies.find((body) => body.includes(row.invalidRedDigest));
    assert.ok(comment, bodies.join('\n'));
    assert.ok(comment.includes(row.laterRedDigest));
    assert.match(comment, /not proof that the test came first/);
  } finally {
    cleanup(dir);
    cleanup(forgeDir);
  }
});
