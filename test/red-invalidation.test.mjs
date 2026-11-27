import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { attemptPath, getAttempt } from '../src/lib/attempt.mjs';
import { eventLogPath } from '../src/lib/event-log.mjs';
import { describeException, redSatisfaction } from '../src/lib/red-exceptions.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { BASIC_TASK, commitAll, seedChange } from './factory-project.mjs';

function failingRed(startedAt, extra = {}) {
  return {
    issuer: 'cli',
    kind: 'unit',
    exitCode: 1,
    startedAt,
    commandDigest: `sha256:${'a'.repeat(64)}`,
    id: `red-${startedAt}`,
    ...extra,
  };
}

async function startedAttempt(dir) {
  await seedChange(dir, { tasks: BASIC_TASK });
  const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
  assert.equal(started.code, 0, started.err);
  return JSON.parse(started.out).id;
}

function storeRed(dir, attemptId, red, history = null) {
  const file = attemptPath(dir, attemptId);
  const attempt = JSON.parse(fs.readFileSync(file, 'utf8'));
  attempt.evidence = {
    ...(attempt.evidence || {}),
    reds: { ...(attempt.evidence?.reds || {}), unit: red },
    ...(history ? { redHistory: { unit: history } } : {}),
  };
  fs.writeFileSync(file, `${JSON.stringify(attempt, null, 2)}\n`);
}

function invalidate(dir, attemptId, overrides = {}) {
  const args = {
    class: 'post-implementation',
    note: 'recorded after the implementation was written',
    by: 'engineer-1',
    ...overrides,
  };
  const argv = ['red', 'invalidate', attemptId, '--kind', 'unit'];
  if (args.class !== undefined) argv.push('--class', args.class);
  if (args.note !== undefined) argv.push('--note', args.note);
  if (args.by !== undefined) argv.push('--by', args.by);
  return idefactory(dir, argv);
}

function invalidationFiles(dir) {
  const root = path.join(dir, '.factory', 'exceptions', 'red-invalid');
  return fs.existsSync(root) ? fs.readdirSync(root).filter((name) => name.endsWith('.json')) : [];
}

test('red invalidate writes one record bound to the attempt and leaves the stored red unchanged', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    storeRed(dir, id, failingRed('2026-01-01T00:00:00.000Z'));
    const redBefore = JSON.stringify(getAttempt(dir, id).evidence.reds);

    const result = await invalidate(dir, id);
    assert.equal(result.code, 0, result.err + result.out);
    assert.equal(invalidationFiles(dir).length, 1);
    const attempt = getAttempt(dir, id);
    assert.equal(attempt.evidence.redInvalidations.unit.length, 1);
    assert.equal(JSON.stringify(attempt.evidence.reds), redBefore);

    const record = JSON.parse(fs.readFileSync(path.join(dir, '.factory/exceptions/red-invalid', invalidationFiles(dir)[0]), 'utf8'));
    assert.equal(record.attemptId, id);
    assert.equal(record.kind, 'unit');
    assert.equal(record.class, 'post-implementation');
    assert.equal(record.by, 'engineer-1');
    assert.match(record.invalidatedRedDigest, /^sha256:[0-9a-f]{64}$/);
  } finally {
    cleanup(dir);
  }
});

test('an invalidated red does not satisfy red; the event carries codes only', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    storeRed(dir, id, failingRed('2026-01-01T00:00:00.000Z'));
    assert.equal(redSatisfaction(dir, getAttempt(dir, id), 'unit'), 'cli');

    assert.equal((await invalidate(dir, id)).code, 0);
    assert.equal(redSatisfaction(dir, getAttempt(dir, id), 'unit'), 'missing');

    const events = fs.readFileSync(eventLogPath(dir), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const invalidated = events.filter((event) => event.type === 'red.invalidated');
    assert.equal(invalidated.length, 1);
    assert.equal(invalidated[0].cause, 'post-implementation');
    assert.equal(invalidated[0].resolver, 'engineer-1');
    assert.equal(JSON.stringify(invalidated[0]).includes('recorded after the implementation'), false);
  } finally {
    cleanup(dir);
  }
});

test('a later failing red satisfies after an invalidation; an earlier red and a missing history digest do not', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    const first = failingRed('2000-01-01T00:00:00.000Z');
    storeRed(dir, id, first, [first]);
    assert.equal((await invalidate(dir, id)).code, 0);

    const earlier = failingRed('1999-06-01T00:00:00.000Z', { id: 'earlier', commandDigest: `sha256:${'b'.repeat(64)}` });
    storeRed(dir, id, earlier, [first, earlier]);
    assert.equal(redSatisfaction(dir, getAttempt(dir, id), 'unit'), 'missing');

    const later = failingRed('2099-01-01T00:00:00.000Z', { id: 'later', commandDigest: `sha256:${'c'.repeat(64)}` });
    storeRed(dir, id, later, [first, later]);
    assert.equal(redSatisfaction(dir, getAttempt(dir, id), 'unit'), 'cli');

    const unhistoried = failingRed('2099-06-01T00:00:00.000Z', { id: 'unhistoried', commandDigest: `sha256:${'d'.repeat(64)}` });
    storeRed(dir, id, unhistoried, [unhistoried]);
    assert.equal(redSatisfaction(dir, getAttempt(dir, id), 'unit'), 'missing');
  } finally {
    cleanup(dir);
  }
});

test('invalidation is refused without a failing CLI red, when already invalidated, and over a waiver', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    const none = await invalidate(dir, id);
    assert.notEqual(none.code, 0);
    assert.match(none.err, /no failing CLI red/);
    assert.equal(invalidationFiles(dir).length, 0);

    storeRed(dir, id, failingRed('2026-01-01T00:00:00.000Z'));
    assert.equal((await invalidate(dir, id)).code, 0);
    const again = await invalidate(dir, id);
    assert.notEqual(again.code, 0);
    assert.match(again.err, /already invalidated/);
    assert.equal(invalidationFiles(dir).length, 1);
  } finally {
    cleanup(dir);
  }
});

test('invalidation is refused over an existing exception on the kind', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    const file = attemptPath(dir, id);
    const attempt = JSON.parse(fs.readFileSync(file, 'utf8'));
    attempt.evidence = {
      ...(attempt.evidence || {}),
      reds: { unit: failingRed('2026-01-01T00:00:00.000Z') },
      redExceptions: { unit: { id: 'exc-x', type: 'waiver', digest: 'sha256:0' } },
    };
    fs.writeFileSync(file, `${JSON.stringify(attempt, null, 2)}\n`);
    const refused = await invalidate(dir, id);
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /already has a waiver for unit/);
    assert.equal(invalidationFiles(dir).length, 0);
  } finally {
    cleanup(dir);
  }
});

test('a third invalidation of the same kind is refused and the first two files remain', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    for (let i = 0; i < 2; i += 1) {
      storeRed(dir, id, failingRed(`2026-01-0${i + 1}T00:00:00.000Z`, { commandDigest: `sha256:${String(i).repeat(64)}` }));
      assert.equal((await invalidate(dir, id)).code, 0);
    }
    storeRed(dir, id, failingRed('2026-01-05T00:00:00.000Z', { commandDigest: `sha256:${'f'.repeat(64)}` }));
    const third = await invalidate(dir, id);
    assert.notEqual(third.code, 0);
    assert.match(third.err, /red waive --invalid-red/);
    assert.equal(invalidationFiles(dir).length, 2);
  } finally {
    cleanup(dir);
  }
});

test('a valid failing red still refuses a method and the refusal names red invalidate', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    commitAll(dir, 'checkpoint');
    storeRed(dir, id, failingRed('2026-01-01T00:00:00.000Z'));
    const refused = await idefactory(dir, [
      'method', 'propose', id, '--choice', 'no-red', '--reason', 'configuration',
      '--rationale', 'only a config value changes', '--implementer', 'engineer-1', '--kind', 'unit',
    ]);
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /red invalidate/);
  } finally {
    cleanup(dir);
  }
});

test('an invalidated red does not block a method proposal', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    commitAll(dir, 'checkpoint');
    storeRed(dir, id, failingRed('2026-01-01T00:00:00.000Z'));
    assert.equal((await invalidate(dir, id)).code, 0);
    const proposed = await idefactory(dir, [
      'method', 'propose', id, '--choice', 'no-red', '--reason', 'configuration',
      '--rationale', 'only a config value changes', '--implementer', 'engineer-1', '--kind', 'unit',
    ]);
    assert.equal(proposed.code, 0, proposed.err + proposed.out);
  } finally {
    cleanup(dir);
  }
});

test('a waiver over a genuine red names red invalidate before --invalid-red', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    storeRed(dir, id, failingRed('2026-01-01T00:00:00.000Z'));
    const waived = await idefactory(dir, ['red', 'waive', id, '--kind', 'unit', '--note', 'covered', '--approver', 'human-1']);
    assert.notEqual(waived.code, 0);
    assert.match(waived.err, /red invalidate/);
    assert.match(waived.err, /--invalid-red/);
    assert.ok(waived.err.indexOf('red invalidate') < waived.err.indexOf('--invalid-red'));
  } finally {
    cleanup(dir);
  }
});

test('status shows an invalidation as withdrawn and not satisfying red', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    storeRed(dir, id, failingRed('2026-01-01T00:00:00.000Z'));
    assert.equal((await invalidate(dir, id)).code, 0);
    const status = await idefactory(dir, ['status', '--json']);
    assert.equal(status.code, 0, status.err);
    const rows = JSON.parse(status.out).redExceptions;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'invalidated');
    assert.equal(rows[0].invalidationClass, 'post-implementation');
    const sentence = describeException(rows[0]);
    assert.match(sentence, /withdrawn as not genuine \(post-implementation\)/);
    assert.match(sentence, /does not satisfy red/);
  } finally {
    cleanup(dir);
  }
});

test('HALT refuses red invalidate and writes nothing', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    storeRed(dir, id, failingRed('2026-01-01T00:00:00.000Z'));
    fs.writeFileSync(path.join(dir, 'HALT'), 'stop\n');
    const result = await invalidate(dir, id);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /HALT/);
    assert.equal(invalidationFiles(dir).length, 0);
  } finally {
    cleanup(dir);
  }
});

test('red invalidate refuses an unknown class and a missing flag', async () => {
  const dir = tempProject();
  try {
    const id = await startedAttempt(dir);
    storeRed(dir, id, failingRed('2026-01-01T00:00:00.000Z'));
    const unknown = await invalidate(dir, id, { class: 'sometimes' });
    assert.notEqual(unknown.code, 0);
    assert.match(unknown.err, /post-implementation, wrong-failure/);
    const missing = await invalidate(dir, id, { note: undefined });
    assert.notEqual(missing.code, 0);
    assert.match(missing.err, /Usage: idefactory red invalidate/);
    assert.equal(invalidationFiles(dir).length, 0);
  } finally {
    cleanup(dir);
  }
});

test('help red invalidate names the classes and the limit; the global text is unchanged', async () => {
  const dir = tempProject();
  try {
    const help = await idefactory(dir, ['help', 'red', 'invalidate']);
    assert.equal(help.code, 0, help.err);
    assert.match(help.out, /post-implementation/);
    assert.match(help.out, /wrong-failure/);
    assert.match(help.out, /At most two/);
  } finally {
    cleanup(dir);
  }
});
