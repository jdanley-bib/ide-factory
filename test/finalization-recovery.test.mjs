import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  allowlistedTargetPaths,
  buildFinalizationPlan,
  contentDigest,
  createFinalizationJournal,
  finalizationJournalPath,
  planDigest,
  readFinalizationJournal,
  validateFinalizationJournal,
} from '../src/lib/finalization-recovery.mjs';
import { writeText } from '../src/lib/layout.mjs';
import { getWorkItem, upsertWorkItem } from '../src/lib/work.mjs';
import { cleanup, tempProject } from './helpers.mjs';

const CHANGE = 'make-finalization-recoverable';
const TASK_ID = '1.1';
const ATTEMPT_ID = '25abe23f-bfaf-4489-b0cc-8e014bacc45f';
const SOURCE_REVISION = 'abc123def4567890abcdef1234567890abcdef12';
const COMPLETION_DATE = '2026-10-21';
const FINALIZED_AT = '2026-10-21T22:00:00.000Z';
const PLAN_TASK_ID = '1.2';
const PLAN_ATTEMPT_ID = '46a2aac4-ca25-4b93-a9db-ee047d77be5c';

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

function seedPlanFixture(dir) {
  writeText(
    path.join(dir, 'openspec', 'changes', CHANGE, 'tasks.md'),
    [
      '# Tasks',
      '',
      '## 1. Journal and deterministic plan',
      '',
      `- [x] 1.1 Prior task`,
      `- [ ] ${PLAN_TASK_ID} Add failing tests that complete creates one deterministic plan`,
      '',
    ].join('\n'),
  );
  writeText(path.join(dir, '.factory', 'agents', 'scribe', 'history.md'), '# History\n\n(none yet)\n');
  writeText(path.join(dir, '.factory', 'identity', 'now.md'), '# Now\n\nIdle.\n');
  const attempt = {
    id: PLAN_ATTEMPT_ID,
    change: CHANGE,
    taskId: PLAN_TASK_ID,
    state: 'accepted',
    implementerRole: 'engineer',
    implementerId: 'bc-engineer',
    reviewerId: 'bc-reviewer',
    modelProfile: 'coding-standard',
    evidence: {
      red: { issuer: 'cli', kind: 'unit', passed: false, exitCode: 1 },
      verification: [],
      security: [],
      review: { verdict: 'ACCEPT', reviewerId: 'bc-reviewer', notes: '', at: '2026-10-21T21:00:00.000Z' },
      changedFiles: [],
      baseRev: null,
    },
    history: [
      { at: '2026-10-21T20:00:00.000Z', state: 'planned' },
      { at: '2026-10-21T21:00:00.000Z', state: 'accepted' },
    ],
    createdAt: '2026-10-21T20:00:00.000Z',
    updatedAt: '2026-10-21T21:00:00.000Z',
  };
  writeText(
    path.join(dir, '.factory', 'attempts', `${PLAN_ATTEMPT_ID}.json`),
    `${JSON.stringify(attempt, null, 2)}\n`,
  );
  upsertWorkItem(dir, {
    id: PLAN_TASK_ID,
    change: CHANGE,
    title: 'deterministic finalization plan',
    status: 'in_progress',
    dependencies: ['1.1'],
    acceptanceCriteria: [],
    factory: { checks: ['unit'], verificationProfile: 'frontend-low' },
    attemptId: PLAN_ATTEMPT_ID,
  });
  return attempt;
}

function planOptions(overrides = {}) {
  return {
    change: CHANGE,
    taskId: PLAN_TASK_ID,
    attemptId: PLAN_ATTEMPT_ID,
    sourceRevision: SOURCE_REVISION,
    completionDate: COMPLETION_DATE,
    finalizedAt: FINALIZED_AT,
    ...overrides,
  };
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

test('buildFinalizationPlan creates one deterministic plan for all pre-commit targets and the commit point', () => {
  const dir = tempProject();
  try {
    seedPlanFixture(dir);
    const options = planOptions();
    const plan = buildFinalizationPlan(dir, options);
    const again = buildFinalizationPlan(dir, options);

    assert.deepEqual(plan, again, 'frozen timestamps keep the plan byte-identical across retries');

    const expectedPaths = allowlistedTargetPaths({
      change: CHANGE,
      taskId: PLAN_TASK_ID,
      attemptId: PLAN_ATTEMPT_ID,
    });
    assert.deepEqual(plan.targets.map((target) => target.path), expectedPaths);

    const [tasksTarget, scribeTarget, identityTarget, attemptTarget, indexTarget, journalTarget] =
      plan.targets;

    assert.match(tasksTarget.afterBytes, new RegExp(`- \\[x\\]\\s+${PLAN_TASK_ID}\\b`));
    assert.match(scribeTarget.afterBytes, new RegExp(`Attempt:\\s*${PLAN_ATTEMPT_ID}`));
    assert.match(
      scribeTarget.afterBytes,
      new RegExp(`## ${COMPLETION_DATE} finalized ${CHANGE}/${PLAN_TASK_ID}`),
    );
    assert.match(
      identityTarget.afterBytes,
      new RegExp(`Last finalized:\\s*${CHANGE}/${PLAN_TASK_ID} \\(${COMPLETION_DATE}\\)`),
    );

    const finalizedAttempt = JSON.parse(attemptTarget.afterBytes);
    assert.equal(finalizedAttempt.state, 'finalized');
    assert.equal(finalizedAttempt.updatedAt, FINALIZED_AT);
    assert.equal(finalizedAttempt.evidence.completed, true);
    assert.deepEqual(finalizedAttempt.history.at(-1), { at: FINALIZED_AT, state: 'finalized' });

    const intendedIndex = JSON.parse(indexTarget.afterBytes);
    assert.equal(intendedIndex.updatedAt, FINALIZED_AT);
    const indexEntry = intendedIndex.items.find(
      (entry) => entry.change === CHANGE && entry.id === PLAN_TASK_ID,
    );
    assert.ok(indexEntry, 'intended work index includes the task');
    assert.equal(indexEntry.status, 'done');

    const readyJournal = JSON.parse(journalTarget.afterBytes);
    assert.equal(readyJournal.phase, 'ready-to-commit');
    assert.equal(readyJournal.schemaVersion, 1);
    assert.equal(readyJournal.change, CHANGE);
    assert.equal(readyJournal.taskId, PLAN_TASK_ID);
    assert.equal(readyJournal.attemptId, PLAN_ATTEMPT_ID);
    assert.equal(readyJournal.sourceRevision, SOURCE_REVISION);
    assert.equal(readyJournal.completionDate, COMPLETION_DATE);

    assert.equal(plan.journal.phase, 'prepared');
    assert.equal(plan.journal.planDigest, planDigest(plan.journal));
    validateFinalizationJournal(plan.journal, {
      change: CHANGE,
      taskId: PLAN_TASK_ID,
      attemptId: PLAN_ATTEMPT_ID,
      sourceRevision: SOURCE_REVISION,
      projectRoot: dir,
    });

    const itemRel = `.factory/work/items/${CHANGE}--${PLAN_TASK_ID}.json`;
    assert.equal(plan.commit.path, itemRel);
    assert.equal(plan.finalCorrectnessCriticalWrite, itemRel);
    const doneItem = JSON.parse(plan.commit.afterBytes);
    assert.equal(doneItem.status, 'done');
    assert.equal(doneItem.updatedAt, FINALIZED_AT);

    assert.deepEqual(plan.writeOrder, [...expectedPaths, itemRel]);
    assert.equal(plan.writeOrder.at(-1), plan.commit.path);
    assert.equal(
      plan.writeOrder.at(-1),
      plan.finalCorrectnessCriticalWrite,
      'work-item done write is the final correctness-critical write',
    );

    for (const target of plan.targets) {
      assert.equal(contentDigest(target.afterBytes), target.afterDigest);
      assert.match(target.beforeDigest, /^sha256:[0-9a-f]{64}$/);
    }
    assert.equal(contentDigest(plan.commit.afterBytes), plan.commit.afterDigest);

    assert.notEqual(getWorkItem(dir, CHANGE, PLAN_TASK_ID).status, 'done');
    assert.equal(fs.existsSync(finalizationJournalPath(dir, PLAN_ATTEMPT_ID)), false);
  } finally {
    cleanup(dir);
  }
});

test('buildFinalizationPlan keeps timestamps fixed only when completionDate and finalizedAt are reused', () => {
  const dir = tempProject();
  try {
    seedPlanFixture(dir);
    const first = buildFinalizationPlan(dir, planOptions());
    const second = buildFinalizationPlan(dir, planOptions({
      finalizedAt: '2026-10-21T23:59:59.000Z',
    }));

    assert.notEqual(
      JSON.parse(first.targets[3].afterBytes).updatedAt,
      JSON.parse(second.targets[3].afterBytes).updatedAt,
    );
    assert.equal(JSON.parse(first.targets[3].afterBytes).updatedAt, FINALIZED_AT);
    assert.deepEqual(
      buildFinalizationPlan(dir, planOptions()),
      first,
    );
  } finally {
    cleanup(dir);
  }
});
