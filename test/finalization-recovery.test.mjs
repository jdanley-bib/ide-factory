import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  allowlistedTargetPaths,
  contentDigest,
  createFinalizationJournal,
  finalizationJournalPath,
  planDigest,
  readFinalizationJournal,
  validateFinalizationJournal,
} from '../src/lib/finalization-recovery.mjs';
import { getWorkItem, upsertWorkItem } from '../src/lib/work.mjs';
import { cleanup, tempProject } from './helpers.mjs';

const CHANGE = 'make-finalization-recoverable';
const TASK_ID = '1.1';
const ATTEMPT_ID = '25abe23f-bfaf-4489-b0cc-8e014bacc45f';
const SOURCE_REVISION = 'abc123def4567890abcdef1234567890abcdef12';
const COMPLETION_DATE = '2026-10-21';

function sha256Digest(text) {
  const hex = createHash('sha256').update(text, 'utf8').digest('hex');
  return `sha256:${hex}`;
}

function targetEntry(relPath, beforeText, afterText) {
  return {
    path: relPath,
    beforeDigest: sha256Digest(beforeText),
    afterDigest: sha256Digest(afterText),
    afterBytes: afterText,
  };
}

function validJournal(overrides = {}) {
  const change = overrides.change ?? CHANGE;
  const taskId = overrides.taskId ?? TASK_ID;
  const attemptId = overrides.attemptId ?? ATTEMPT_ID;
  const paths = allowlistedTargetPaths({ change, taskId, attemptId });
  const defaultTargets = paths.map((relPath, index) =>
    targetEntry(relPath, `before-${index}\n`, `after-${index}\n`));
  const base = {
    schemaVersion: 1,
    change: CHANGE,
    taskId: TASK_ID,
    attemptId: ATTEMPT_ID,
    sourceRevision: SOURCE_REVISION,
    completionDate: COMPLETION_DATE,
    phase: 'prepared',
    targets: defaultTargets,
    ...overrides,
  };
  if (!Object.hasOwn(overrides, 'targets') && !Object.hasOwn(overrides, 'planDigest')) {
    // Recompute allowlisted defaults when identity overrides change paths.
    base.targets = paths.map((relPath, index) =>
      targetEntry(relPath, `before-${index}\n`, `after-${index}\n`));
  }
  if (!Object.hasOwn(overrides, 'planDigest')) {
    base.planDigest = planDigest(base);
  }
  return base;
}

function seedWorkItem(dir, status = 'in_progress') {
  upsertWorkItem(dir, {
    id: TASK_ID,
    change: CHANGE,
    title: 'journal validation',
    status,
    dependencies: [],
    acceptanceCriteria: [],
    factory: { checks: ['unit'], verificationProfile: 'frontend-low' },
  });
  return getWorkItem(dir, CHANGE, TASK_ID);
}

test('schema version 1 journal binds identity, revision, date, allowlisted targets, digests, bytes, and plan digest', () => {
  const journal = validJournal();
  const validated = validateFinalizationJournal(journal, {
    change: CHANGE,
    taskId: TASK_ID,
    attemptId: ATTEMPT_ID,
    sourceRevision: SOURCE_REVISION,
  });

  assert.equal(validated.schemaVersion, 1);
  assert.equal(validated.change, CHANGE);
  assert.equal(validated.taskId, TASK_ID);
  assert.equal(validated.attemptId, ATTEMPT_ID);
  assert.equal(validated.sourceRevision, SOURCE_REVISION);
  assert.equal(validated.completionDate, COMPLETION_DATE);
  assert.equal(validated.phase, 'prepared');
  assert.equal(validated.planDigest, planDigest(journal));
  assert.equal(validated.targets.length, 6);

  const expectedPaths = allowlistedTargetPaths({
    change: CHANGE,
    taskId: TASK_ID,
    attemptId: ATTEMPT_ID,
  });
  assert.deepEqual(validated.targets.map((t) => t.path), expectedPaths);

  for (const [index, target] of validated.targets.entries()) {
    assert.equal(target.beforeDigest, sha256Digest(`before-${index}\n`));
    assert.equal(target.afterDigest, sha256Digest(`after-${index}\n`));
    assert.equal(target.afterBytes, `after-${index}\n`);
    assert.equal(contentDigest(target.afterBytes), target.afterDigest);
  }
});

test('atomic journal creation writes prepared journal without marking the work item done', () => {
  const dir = tempProject();
  try {
    seedWorkItem(dir, 'in_progress');
    const journal = validJournal();
    const written = createFinalizationJournal(dir, journal, {
      change: CHANGE,
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      sourceRevision: SOURCE_REVISION,
    });

    const file = finalizationJournalPath(dir, ATTEMPT_ID);
    assert.equal(fs.existsSync(file), true);
    assert.equal(written.phase, 'prepared');
    assert.equal(written.attemptId, ATTEMPT_ID);

    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(onDisk.schemaVersion, 1);
    assert.equal(onDisk.planDigest, journal.planDigest);
    assert.deepEqual(
      onDisk.targets.map((t) => t.path),
      allowlistedTargetPaths({ change: CHANGE, taskId: TASK_ID, attemptId: ATTEMPT_ID }),
    );

    const item = getWorkItem(dir, CHANGE, TASK_ID);
    assert.notEqual(item.status, 'done');
    assert.equal(item.status, 'in_progress');
  } finally {
    cleanup(dir);
  }
});

test('corrupt journal fails closed without marking the item done', () => {
  const dir = tempProject();
  try {
    seedWorkItem(dir, 'in_progress');
    const file = finalizationJournalPath(dir, ATTEMPT_ID);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'not-json{{{');

    assert.throws(
      () => readFinalizationJournal(dir, ATTEMPT_ID, {
        change: CHANGE,
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        sourceRevision: SOURCE_REVISION,
      }),
      /JSON|parse|invalid|corrupt/i,
    );

    const item = getWorkItem(dir, CHANGE, TASK_ID);
    assert.notEqual(item.status, 'done');
  } finally {
    cleanup(dir);
  }
});

test('unsupported schema version fails closed without marking the item done', () => {
  const dir = tempProject();
  try {
    seedWorkItem(dir, 'in_progress');
    const journal = validJournal({ schemaVersion: 99 });
    assert.throws(
      () => createFinalizationJournal(dir, journal, {
        change: CHANGE,
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        sourceRevision: SOURCE_REVISION,
      }),
      /unsupported|schema/i,
    );
    assert.equal(fs.existsSync(finalizationJournalPath(dir, ATTEMPT_ID)), false);
    assert.notEqual(getWorkItem(dir, CHANGE, TASK_ID).status, 'done');
  } finally {
    cleanup(dir);
  }
});

test('path-traversing target fails closed without marking the item done', () => {
  const dir = tempProject();
  try {
    seedWorkItem(dir, 'in_progress');
    const paths = allowlistedTargetPaths({ change: CHANGE, taskId: TASK_ID, attemptId: ATTEMPT_ID });
    const targets = paths.map((relPath, index) =>
      targetEntry(relPath, `before-${index}\n`, `after-${index}\n`));
    targets[0] = targetEntry('../../etc/passwd', 'before\n', 'after\n');
    const journal = validJournal({ targets });

    assert.throws(
      () => createFinalizationJournal(dir, journal, {
        change: CHANGE,
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        sourceRevision: SOURCE_REVISION,
      }),
      /path|travers|allowlist|outside|parent/i,
    );
    assert.equal(fs.existsSync(finalizationJournalPath(dir, ATTEMPT_ID)), false);
    assert.notEqual(getWorkItem(dir, CHANGE, TASK_ID).status, 'done');
  } finally {
    cleanup(dir);
  }
});

test('identity-mismatched journal fails closed without marking the item done', () => {
  const dir = tempProject();
  try {
    seedWorkItem(dir, 'in_progress');
    const journal = validJournal({ taskId: '9.9' });
    assert.throws(
      () => createFinalizationJournal(dir, journal, {
        change: CHANGE,
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        sourceRevision: SOURCE_REVISION,
      }),
      /identity|mismatch|task/i,
    );
    assert.equal(fs.existsSync(finalizationJournalPath(dir, ATTEMPT_ID)), false);
    assert.notEqual(getWorkItem(dir, CHANGE, TASK_ID).status, 'done');
  } finally {
    cleanup(dir);
  }
});

test('revision-mismatched journal fails closed without marking the item done', () => {
  const dir = tempProject();
  try {
    seedWorkItem(dir, 'in_progress');
    const journal = validJournal({ sourceRevision: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' });
    assert.throws(
      () => createFinalizationJournal(dir, journal, {
        change: CHANGE,
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        sourceRevision: SOURCE_REVISION,
      }),
      /revision|mismatch|source/i,
    );
    assert.equal(fs.existsSync(finalizationJournalPath(dir, ATTEMPT_ID)), false);
    assert.notEqual(getWorkItem(dir, CHANGE, TASK_ID).status, 'done');
  } finally {
    cleanup(dir);
  }
});

test('plan digest mismatch fails closed without writing a journal', () => {
  const dir = tempProject();
  try {
    seedWorkItem(dir, 'in_progress');
    const journal = validJournal({ planDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' });
    assert.throws(
      () => createFinalizationJournal(dir, journal, {
        change: CHANGE,
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        sourceRevision: SOURCE_REVISION,
      }),
      /plan.?digest|mismatch/i,
    );
    assert.equal(fs.existsSync(finalizationJournalPath(dir, ATTEMPT_ID)), false);
    assert.notEqual(getWorkItem(dir, CHANGE, TASK_ID).status, 'done');
  } finally {
    cleanup(dir);
  }
});
