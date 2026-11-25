import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { getAttempt } from '../src/lib/attempt.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
import { missingCheckReasons, missingChecks, unpassedChecks, readCheckRegistry } from '../src/lib/required-checks.mjs';
import {
  commandDigest,
  gitSnapshot,
  recordValidity,
  registryConfigDigest,
  runEnvironment,
} from '../src/lib/verification-evidence.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

const UNIT_ARGV = [process.execPath, '-e', 'process.exit(0)'];

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

function commitAll(dir, message) {
  git(dir, ['add', '-A']);
  const status = git(dir, ['status', '--porcelain']);
  if (status.length > 0) git(dir, ['commit', '-q', '-m', message]);
  return git(dir, ['rev-parse', 'HEAD']);
}

function unitRegistry({ timeoutMs = 30_000, importKeys } = {}) {
  return {
    schemaVersion: 1,
    ...(importKeys ? { importKeys } : {}),
    checks: {
      unit: {
        argv: UNIT_ARGV,
        cwdPolicy: 'project',
        timeoutMs,
        artifacts: [],
      },
    },
  };
}

function writeRegistry(dir, registry) {
  fs.writeFileSync(path.join(dir, '.factory/checks.json'), `${JSON.stringify(registry, null, 2)}\n`);
}

function writeProduct(dir, name, text) {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), text);
}

/** An initialized project with a demo work item, a committed clean HEAD, and one attempt. */
async function fixture(registry = unitRegistry()) {
  const dir = tempProject();
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  writeRegistry(dir, registry);
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'openspec/changes/demo/tasks.md'),
    [
      '- [ ] 1.1 Add parser',
      '  factory:',
      '    kind: general',
      '    checks: [unit]',
      '    verificationProfile: frontend-low',
      '    roles: [engineer, reviewer, scribe]',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(dir, '.factory/profiles.json'), `${JSON.stringify({ 'frontend-low': { checks: ['unit'] } }, null, 2)}\n`);
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'idefactory-test']);
  fs.writeFileSync(path.join(dir, '.gitignore'), '.factory/attempts/*\n.factory/work/\n.factory/ledger.jsonl\n.factory/orchestration/*\n');
  writeProduct(dir, 'src/app.txt', 'v1\n');
  commitAll(dir, 'checkpoint');
  assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
  const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
  assert.equal(started.code, 0, started.err);
  const attemptId = JSON.parse(started.out).id;
  return { dir, attemptId };
}

async function passAt(dir, attemptId) {
  const run = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit']);
  assert.equal(run.code, 0, run.err + run.out);
  return getAttempt(dir, attemptId);
}

function unitEntry(dir) {
  const raw = readCheckRegistry(dir).unit;
  return { ...raw, commandDigest: commandDigest(raw.argv) };
}

function unpassed(dir, attemptId, options = {}) {
  return unpassedChecks(getAttempt(dir, attemptId), ['unit'], {
    rawChecks: readCheckRegistry(dir),
    project: dir,
    ...options,
  });
}

test('a CLI record carries the configuration digest and the environment', async () => {
  const { dir, attemptId } = await fixture();
  try {
    const attempt = await passAt(dir, attemptId);
    const [record] = attempt.evidence.verification;
    const entry = unitEntry(dir);
    assert.equal(record.configDigest, registryConfigDigest({
      argv: entry.argv,
      cwdPolicy: entry.cwdPolicy,
      timeoutMs: entry.timeoutMs,
      artifacts: entry.artifacts,
    }));
    assert.deepEqual(record.environment, runEnvironment());
    assert.equal(record.environment.node, process.version);
  } finally {
    cleanup(dir);
  }
});

test('changing only the timeout changes the configuration digest', () => {
  const base = { argv: UNIT_ARGV, cwdPolicy: 'project', timeoutMs: 30_000, artifacts: [] };
  assert.notEqual(
    registryConfigDigest(base),
    registryConfigDigest({ ...base, timeoutMs: 60_000 }),
  );
  assert.equal(commandDigest(UNIT_ARGV), commandDigest([...UNIT_ARGV]));
});

test('a run-state-only commit keeps a passing record valid', async () => {
  const { dir, attemptId } = await fixture();
  try {
    await passAt(dir, attemptId);
    writeProduct(dir, '.factory/active-change.json', '{"change":"demo"}\n');
    commitAll(dir, 'run state');
    assert.deepEqual(unpassed(dir, attemptId), []);
  } finally {
    cleanup(dir);
  }
});

test('a product commit makes the record stale and names the path', async () => {
  const { dir, attemptId } = await fixture();
  try {
    await passAt(dir, attemptId);
    writeProduct(dir, 'src/app.txt', 'v2\n');
    commitAll(dir, 'product change');
    const [failure] = unpassed(dir, attemptId);
    assert.equal(failure.kind, 'unit');
    assert.match(failure.reason, /changed since the record: src\/app\.txt/);
  } finally {
    cleanup(dir);
  }
});

test('an uncommitted product change makes the record stale', async () => {
  const { dir, attemptId } = await fixture();
  try {
    await passAt(dir, attemptId);
    writeProduct(dir, 'src/app.txt', 'dirty\n');
    const [failure] = unpassed(dir, attemptId);
    assert.match(failure.reason, /uncommitted change outside factory run-state: src\/app\.txt/);
    assert.deepEqual(unpassed(dir, attemptId, { requireCleanWorktree: false }), []);
  } finally {
    cleanup(dir);
  }
});

test('a timeout change makes the record stale because the configuration digest differs', async () => {
  const { dir, attemptId } = await fixture();
  try {
    await passAt(dir, attemptId);
    writeRegistry(dir, unitRegistry({ timeoutMs: 60_000 }));
    commitAll(dir, 'raise timeout');
    const [failure] = unpassed(dir, attemptId);
    assert.equal(failure.reason, 'registry entry changed since the record');
  } finally {
    cleanup(dir);
  }
});

test('a rewritten history makes the record stale', async () => {
  const { dir, attemptId } = await fixture();
  try {
    writeProduct(dir, '.factory/active-change.json', '{}\n');
    commitAll(dir, 'run state');
    await passAt(dir, attemptId);
    git(dir, ['reset', '-q', '--hard', 'HEAD~1']);
    const [failure] = unpassed(dir, attemptId);
    assert.equal(failure.reason, 'revision is not an ancestor of HEAD');
  } finally {
    cleanup(dir);
  }
});

test('a product file renamed into run-state is reported by its old path', async () => {
  const { dir, attemptId } = await fixture();
  try {
    await passAt(dir, attemptId);
    fs.mkdirSync(path.join(dir, '.factory/observability'), { recursive: true });
    git(dir, ['mv', 'src/app.txt', '.factory/observability/moved.txt']);
    commitAll(dir, 'move product into run state');
    const [failure] = unpassed(dir, attemptId);
    assert.match(failure.reason, /changed since the record: src\/app\.txt/);
  } finally {
    cleanup(dir);
  }
});

test('an unresolvable revision fails closed with a git error reason', async () => {
  const { dir, attemptId } = await fixture();
  try {
    const attempt = await passAt(dir, attemptId);
    const [record] = attempt.evidence.verification;
    const snapshot = gitSnapshot(dir);
    const verdict = recordValidity(
      { ...record, sourceRevision: '1'.repeat(40) },
      { project: dir, attemptId, entry: unitEntry(dir), snapshot },
    );
    assert.equal(verdict.valid, false);
    assert.equal(verdict.kind, 'stale');
    assert.match(verdict.reason, /git could not verify the revision/);
  } finally {
    cleanup(dir);
  }
});

test('a record without the fingerprint is kept but stale with re-run verify', async () => {
  const { dir, attemptId } = await fixture();
  try {
    const attempt = await passAt(dir, attemptId);
    const [record] = attempt.evidence.verification;
    const legacy = { ...record };
    delete legacy.configDigest;
    delete legacy.environment;
    const verdict = recordValidity(legacy, {
      project: dir,
      attemptId,
      entry: unitEntry(dir),
      snapshot: gitSnapshot(dir),
    });
    assert.equal(verdict.valid, false);
    assert.match(verdict.reason, /re-run verify/);
  } finally {
    cleanup(dir);
  }
});

test('review handoff and the complete check agree on a legacy record', async () => {
  const { dir, attemptId } = await fixture();
  try {
    await passAt(dir, attemptId);
    const file = path.join(dir, '.factory', 'attempts', `${attemptId}.json`);
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const record of stored.evidence.verification) {
      delete record.configDigest;
      delete record.environment;
    }
    fs.writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`);

    const item = getWorkItem(dir, 'demo', '1.1');
    const handoff = missingCheckReasons(dir, getAttempt(dir, attemptId), item);
    const gate = unpassed(dir, attemptId);
    assert.deepEqual(handoff.map((entry) => entry.kind), ['unit']);
    assert.deepEqual(handoff.map((entry) => [entry.kind, entry.reason]), gate.map((entry) => [entry.kind, entry.reason]));
    assert.match(gate[0].reason, /re-run verify/);
    assert.deepEqual(missingChecks(dir, getAttempt(dir, attemptId), item), ['unit']);
  } finally {
    cleanup(dir);
  }
});

test('a failing record is failed and not reused', async () => {
  const { dir, attemptId } = await fixture(unitRegistry());
  try {
    writeRegistry(dir, {
      schemaVersion: 1,
      checks: { unit: { argv: [process.execPath, '-e', 'process.exit(3)'], cwdPolicy: 'project', timeoutMs: 30_000, artifacts: [] } },
    });
    commitAll(dir, 'failing check');
    const run = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit']);
    assert.equal(run.code, 0, run.err + run.out);
    const attempt = getAttempt(dir, attemptId);
    const [record] = attempt.evidence.verification;
    const verdict = recordValidity(record, {
      project: dir,
      attemptId,
      entry: unitEntry(dir),
      snapshot: gitSnapshot(dir),
    });
    assert.equal(verdict.kind, 'failed');
  } finally {
    cleanup(dir);
  }
});

test('review handoff and the complete check agree on a record after run-state work', async () => {
  const { dir, attemptId } = await fixture();
  try {
    await passAt(dir, attemptId);
    writeProduct(dir, '.factory/active-change.json', '{"after":true}\n');
    commitAll(dir, 'run state');
    const attempt = getAttempt(dir, attemptId);
    const item = getWorkItem(dir, 'demo', '1.1');
    assert.deepEqual(missingChecks(dir, attempt, item), []);
    assert.deepEqual(unpassed(dir, attemptId).map((entry) => entry.kind), []);

    writeProduct(dir, 'src/app.txt', 'v3\n');
    commitAll(dir, 'product change');
    assert.deepEqual(missingChecks(dir, getAttempt(dir, attemptId), item), ['unit']);
  } finally {
    cleanup(dir);
  }
});

function importKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    id: 'test-import-key',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey,
  };
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function signedAttestation(key, attemptId, sourceRevision) {
  const attestation = {
    schemaVersion: 1,
    kind: 'unit',
    runner: { name: 'idefactory', version: '0.0.0-test' },
    argv: [...UNIT_ARGV],
    commandDigest: commandDigest(UNIT_ARGV),
    cwdPolicy: 'project',
    exitCode: 0,
    timedOut: false,
    startedAt: '2026-11-24T12:00:00.000Z',
    finishedAt: '2026-11-24T12:00:01.000Z',
    sourceRevision,
    worktreeClean: true,
    logDigest: `sha256:${createHash('sha256').update('log').digest('hex')}`,
    artifactDigests: [],
    attemptId,
    keyId: key.id,
    passed: true,
  };
  const { signature: _unused, ...payload } = attestation;
  attestation.signature = sign(null, Buffer.from(canonical(payload), 'utf8'), key.privateKey).toString('base64');
  return attestation;
}

test('an imported attestation is valid only at its exact revision', async () => {
  const key = importKeyPair();
  const registry = unitRegistry({ importKeys: [{ id: key.id, publicKeyPem: key.publicKeyPem }] });
  const { dir, attemptId } = await fixture(registry);
  const attestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idefactory-attest-'));
  try {
    const head = git(dir, ['rev-parse', 'HEAD']);
    const first = path.join(attestDir, 'first.json');
    fs.writeFileSync(first, JSON.stringify(signedAttestation(key, attemptId, head)));
    const imported = await idefactory(dir, ['verify', 'import', attemptId, '--file', first]);
    assert.equal(imported.code, 0, imported.err + imported.out);
    assert.deepEqual(unpassed(dir, attemptId), []);

    writeProduct(dir, '.factory/active-change.json', '{}\n');
    const moved = commitAll(dir, 'run state');
    const [failure] = unpassed(dir, attemptId);
    assert.equal(failure.reason, 'import is reused only at its exact revision');

    const second = path.join(attestDir, 'second.json');
    fs.writeFileSync(second, JSON.stringify(signedAttestation(key, attemptId, moved)));
    const reimported = await idefactory(dir, ['verify', 'import', attemptId, '--file', second]);
    assert.equal(reimported.code, 0, reimported.err + reimported.out);
    assert.deepEqual(unpassed(dir, attemptId), []);
  } finally {
    cleanup(attestDir);
    cleanup(dir);
  }
});

function countingRegistry(markerFile, { timeoutMs = 30_000 } = {}) {
  const script = `require('fs').appendFileSync(${JSON.stringify(markerFile)}, 'run\\n');process.exit(0)`;
  return {
    schemaVersion: 1,
    checks: {
      unit: { argv: [process.execPath, '-e', script], cwdPolicy: 'project', timeoutMs, artifacts: [] },
    },
  };
}

function runOnce(dir) {
  return spawnSync(process.execPath, [
    path.join(process.cwd(), 'src/cli.mjs'), 'run', '--change', 'demo', '--path', dir,
  ], { cwd: dir, encoding: 'utf8', shell: false, env: { ...process.env } });
}

async function baselineProject(markerFile, registry = countingRegistry(markerFile)) {
  const dir = tempProject();
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  fs.writeFileSync(path.join(dir, '.factory/checks.json'), `${JSON.stringify(registry, null, 2)}\n`);
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'openspec/changes/demo/tasks.md'),
    '- [ ] 1.1 Add parser\n  factory:\n    kind: general\n    checks: [unit]\n    roles: [engineer, reviewer, scribe]\n',
  );
  fs.writeFileSync(path.join(dir, 'app.txt'), 'v1\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.factory/attempts/*\n.factory/work/\n.factory/ledger.jsonl\n.factory/orchestration/*\n');
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'idefactory-test']);
  assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
  commitAll(dir, 'checkpoint');
  return dir;
}

function baselineRuns(markerFile) {
  return fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf8').split('\n').filter(Boolean).length : 0;
}

test('a run-state-only commit reuses the run baseline', async () => {
  const markerDir = tempProject();
  const marker = path.join(markerDir, 'runs.txt');
  const dir = await baselineProject(marker);
  try {
    const first = runOnce(dir);
    assert.equal(first.status, 2, first.stderr + first.stdout);
    assert.equal(baselineRuns(marker), 1);

    writeProduct(dir, '.factory/observability/note.txt', 'run state\n');
    commitAll(dir, 'run state');
    const second = runOnce(dir);
    assert.match(second.stdout, /unchanged-state/, second.stderr + second.stdout);
    assert.equal(baselineRuns(marker), 1);
  } finally {
    cleanup(dir);
    cleanup(markerDir);
  }
});

test('a product change re-runs the run baseline', async () => {
  const markerDir = tempProject();
  const marker = path.join(markerDir, 'runs.txt');
  const dir = await baselineProject(marker);
  try {
    assert.equal(runOnce(dir).status, 2);
    assert.equal(baselineRuns(marker), 1);

    writeProduct(dir, 'app.txt', 'v2\n');
    commitAll(dir, 'product change');
    runOnce(dir);
    assert.equal(baselineRuns(marker), 2);
  } finally {
    cleanup(dir);
    cleanup(markerDir);
  }
});

test('a changed check registry re-runs the run baseline', async () => {
  const markerDir = tempProject();
  const marker = path.join(markerDir, 'runs.txt');
  const dir = await baselineProject(marker);
  try {
    assert.equal(runOnce(dir).status, 2);
    assert.equal(baselineRuns(marker), 1);

    fs.writeFileSync(path.join(dir, '.factory/checks.json'), `${JSON.stringify(countingRegistry(marker, { timeoutMs: 60_000 }), null, 2)}\n`);
    commitAll(dir, 'raise timeout');
    runOnce(dir);
    assert.equal(baselineRuns(marker), 2);
  } finally {
    cleanup(dir);
    cleanup(markerDir);
  }
});
