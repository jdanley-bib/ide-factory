import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeRedFailure, redFailureDiagnostics } from '../src/lib/red-evidence.mjs';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const STARTED = '2026-11-24T16:00:00.000Z';
const FINISHED = '2026-11-24T16:00:01.250Z';

function entryFor(overrides = {}) {
  return redFailureDiagnostics({
    kind: 'unit',
    classification: 'infrastructure-failure',
    timedOut: false,
    timeoutMs: 1000,
    startedAt: STARTED,
    finishedAt: FINISHED,
    exitCode: null,
    spawnError: null,
    logDigest: DIGEST,
    recordedAt: FINISHED,
    ...overrides,
  });
}

test('a timed-out outcome records the limit and elapsed time', () => {
  assert.deepEqual(entryFor({ timedOut: true, exitCode: 1 }), {
    kind: 'unit',
    classification: 'infrastructure-failure',
    timedOut: true,
    timeoutMs: 1000,
    durationMs: 1250,
    exitCode: 1,
    spawnError: null,
    logDigest: DIGEST,
    recordedAt: FINISHED,
    commandDigest: null,
    sourceRevision: null,
  });
});

test('a red entry binds to the command digest and source revision when given', () => {
  const entry = entryFor({ exitCode: 0, commandDigest: 'sha256:abc', sourceRevision: 'deadbeef' });
  assert.equal(entry.commandDigest, 'sha256:abc');
  assert.equal(entry.sourceRevision, 'deadbeef');
  assert.equal(entryFor({ exitCode: 0 }).sourceRevision, null);
});

test('a spawn error keeps only its code and never its message', () => {
  const error = Object.assign(new Error('spawn /home/ubuntu/secret-bin ENOENT'), { code: 'ENOENT' });
  const entry = entryFor({ spawnError: error });
  assert.equal(entry.spawnError, 'ENOENT');
  assert.equal(entry.exitCode, null);
  assert.doesNotMatch(JSON.stringify(entry), /secret-bin/);
});

test('a non-zero exit with no tests keeps its exit code', () => {
  const entry = entryFor({ exitCode: 1 });
  assert.equal(entry.timedOut, false);
  assert.equal(entry.spawnError, null);
  assert.equal(entry.exitCode, 1);
  assert.equal(entry.durationMs, 1250);
});

test('describeRedFailure states a timeout limit and elapsed time', () => {
  assert.equal(
    describeRedFailure(entryFor({ timedOut: true })),
    'timed out after 1000 ms, elapsed 1250 ms',
  );
});

test('describeRedFailure states a spawn error code without its message', () => {
  const error = Object.assign(new Error('spawn /home/ubuntu/secret-bin ENOENT'), { code: 'ENOENT' });
  const detail = describeRedFailure(entryFor({ spawnError: error }));
  assert.equal(detail, 'spawn error ENOENT');
  assert.doesNotMatch(detail, /secret-bin/);
});

test('describeRedFailure states the exit code for a missing command', () => {
  assert.equal(
    describeRedFailure(entryFor({ exitCode: 127 })),
    'exit code 127',
  );
});

test('describeRedFailure reports a no-tests exit with its exit code', () => {
  assert.equal(
    describeRedFailure(entryFor({ exitCode: 1 })),
    'no tests reported, exit code 1',
  );
});

test('describeRedFailure reports a vacuous red with exit code zero', () => {
  assert.equal(
    describeRedFailure(entryFor({ classification: 'vacuous-red', exitCode: 0 })),
    'exit code 0',
  );
});
