import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  allowlistedTargetPaths,
  buildFinalizationPlan,
  compareAndApplyTarget,
  contentDigest,
  createFinalizationJournal,
  finalizationFaultBoundaries,
  finalizationJournalPath,
  planDigest,
  readFinalizationJournal,
  recoverFinalization,
  replayFinalizationTargets,
  runJournaledFinalization,
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
const RECOVERY_TASK_ID = '2.1';
const RECOVERY_ATTEMPT_ID = '3a56eca2-2a84-440c-b064-87222e4e7a3c';
const FAULT_TASK_ID = '2.2';
const FAULT_ATTEMPT_ID = '53b91f30-220d-425e-8f86-e9b3dbbc18ab';

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

function seedRecoveryFixture(dir, { attemptState = 'accepted' } = {}) {
  writeText(
    path.join(dir, 'openspec', 'changes', CHANGE, 'tasks.md'),
    [
      '# Tasks',
      '',
      '## 2. Replay and crash recovery',
      '',
      `- [ ] ${RECOVERY_TASK_ID} Add failing tests that replay skips an after-digest target`,
      '',
    ].join('\n'),
  );
  writeText(path.join(dir, '.factory', 'agents', 'scribe', 'history.md'), '# History\n\n(none yet)\n');
  writeText(path.join(dir, '.factory', 'identity', 'now.md'), '# Now\n\nIdle.\n');
  const attempt = {
    id: RECOVERY_ATTEMPT_ID,
    change: CHANGE,
    taskId: RECOVERY_TASK_ID,
    state: attemptState,
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
      ...(attemptState === 'finalized' ? { completed: true } : {}),
    },
    history: [
      { at: '2026-10-21T20:00:00.000Z', state: 'planned' },
      { at: '2026-10-21T21:00:00.000Z', state: 'accepted' },
      ...(attemptState === 'finalized'
        ? [{ at: FINALIZED_AT, state: 'finalized' }]
        : []),
    ],
    createdAt: '2026-10-21T20:00:00.000Z',
    updatedAt: attemptState === 'finalized' ? FINALIZED_AT : '2026-10-21T21:00:00.000Z',
  };
  writeText(
    path.join(dir, '.factory', 'attempts', `${RECOVERY_ATTEMPT_ID}.json`),
    `${JSON.stringify(attempt, null, 2)}\n`,
  );
  upsertWorkItem(dir, {
    id: RECOVERY_TASK_ID,
    change: CHANGE,
    title: 'compare-and-apply recovery',
    status: 'in_progress',
    dependencies: ['1.2'],
    acceptanceCriteria: [],
    factory: { checks: ['unit'], verificationProfile: 'frontend-low' },
    attemptId: RECOVERY_ATTEMPT_ID,
  });
  return attempt;
}

function recoveryPlanOptions(overrides = {}) {
  return {
    change: CHANGE,
    taskId: RECOVERY_TASK_ID,
    attemptId: RECOVERY_ATTEMPT_ID,
    sourceRevision: SOURCE_REVISION,
    completionDate: COMPLETION_DATE,
    finalizedAt: FINALIZED_AT,
    ...overrides,
  };
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function snapshotTargets(dir, targets) {
  return Object.fromEntries(
    targets.map((target) => {
      const absolute = path.join(dir, target.path);
      return [target.path, fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null];
    }),
  );
}

test('compareAndApplyTarget skips a target already at its after digest', () => {
  const dir = tempProject();
  try {
    const rel = 'openspec/changes/make-finalization-recoverable/tasks.md';
    const after = '- [x] 2.1 already applied\n';
    writeText(path.join(dir, rel), after);
    const target = {
      path: rel,
      beforeDigest: contentDigest('- [ ] 2.1 pending\n'),
      afterDigest: contentDigest(after),
      afterBytes: after,
    };

    const result = compareAndApplyTarget(dir, target);
    assert.equal(result.action, 'skipped');
    assert.equal(fs.readFileSync(path.join(dir, rel), 'utf8'), after);
  } finally {
    cleanup(dir);
  }
});

test('compareAndApplyTarget applies exact after bytes when current digest matches before', () => {
  const dir = tempProject();
  try {
    const rel = '.factory/identity/now.md';
    const before = '# Now\n\nIdle.\n';
    const after = '# Now\n\nLast finalized: make-finalization-recoverable/2.1 (2026-10-21)\n';
    writeText(path.join(dir, rel), before);
    const target = {
      path: rel,
      beforeDigest: contentDigest(before),
      afterDigest: contentDigest(after),
      afterBytes: after,
    };

    const result = compareAndApplyTarget(dir, target);
    assert.equal(result.action, 'applied');
    assert.equal(fs.readFileSync(path.join(dir, rel), 'utf8'), after);
    assert.equal(contentDigest(fs.readFileSync(path.join(dir, rel))), target.afterDigest);
  } finally {
    cleanup(dir);
  }
});

test('compareAndApplyTarget rejects a conflict digest without writing after bytes', () => {
  const dir = tempProject();
  try {
    const rel = '.factory/agents/scribe/history.md';
    const before = '# History\n\n(none yet)\n';
    const after = '# History\n\n## marker\n';
    const conflict = '# History\n\nexternally edited\n';
    writeText(path.join(dir, rel), conflict);
    const target = {
      path: rel,
      beforeDigest: contentDigest(before),
      afterDigest: contentDigest(after),
      afterBytes: after,
    };

    assert.throws(() => compareAndApplyTarget(dir, target), /conflict/i);
    assert.equal(fs.readFileSync(path.join(dir, rel), 'utf8'), conflict);
    assert.notEqual(contentDigest(conflict), target.afterDigest);
  } finally {
    cleanup(dir);
  }
});

test('replayFinalizationTargets skips after-digest, applies before-digest, and stops on conflict', () => {
  const dir = tempProject();
  try {
    const appliedRel = '.factory/identity/now.md';
    const pendingRel = 'openspec/changes/make-finalization-recoverable/tasks.md';
    const conflictRel = '.factory/agents/scribe/history.md';
    const appliedAfter = '# Now\n\nLast finalized: x\n';
    const pendingBefore = '- [ ] 2.1 task\n';
    const pendingAfter = '- [x] 2.1 task\n';
    const conflictBefore = '# History\n\n(none yet)\n';
    const conflictAfter = '# History\n\n## done\n';
    writeText(path.join(dir, appliedRel), appliedAfter);
    writeText(path.join(dir, pendingRel), pendingBefore);
    writeText(path.join(dir, conflictRel), '# History\n\nconflicted\n');

    const targets = [
      {
        path: appliedRel,
        beforeDigest: contentDigest('# Now\n\nIdle.\n'),
        afterDigest: contentDigest(appliedAfter),
        afterBytes: appliedAfter,
      },
      {
        path: pendingRel,
        beforeDigest: contentDigest(pendingBefore),
        afterDigest: contentDigest(pendingAfter),
        afterBytes: pendingAfter,
      },
      {
        path: conflictRel,
        beforeDigest: contentDigest(conflictBefore),
        afterDigest: contentDigest(conflictAfter),
        afterBytes: conflictAfter,
      },
    ];

    assert.throws(() => replayFinalizationTargets(dir, targets), /conflict/i);
    assert.equal(fs.readFileSync(path.join(dir, appliedRel), 'utf8'), appliedAfter);
    assert.equal(fs.readFileSync(path.join(dir, pendingRel), 'utf8'), pendingAfter);
    assert.equal(fs.readFileSync(path.join(dir, conflictRel), 'utf8'), '# History\n\nconflicted\n');
  } finally {
    cleanup(dir);
  }
});

test('recoverFinalization resumes a matching finalized attempt with an unfinished journal', () => {
  const dir = tempProject();
  try {
    // Journal is planned while accepted; crash leaves attempt at after digest (finalized)
    // while later targets and the work-item commit remain unfinished.
    seedRecoveryFixture(dir, { attemptState: 'accepted' });
    const plan = buildFinalizationPlan(dir, recoveryPlanOptions());
    createFinalizationJournal(dir, plan.journal, {
      change: CHANGE,
      taskId: RECOVERY_TASK_ID,
      attemptId: RECOVERY_ATTEMPT_ID,
      sourceRevision: SOURCE_REVISION,
    });

    writeText(path.join(dir, plan.targets[0].path), plan.targets[0].afterBytes);
    writeText(path.join(dir, plan.targets[1].path), plan.targets[1].afterBytes);
    writeText(path.join(dir, plan.targets[3].path), plan.targets[3].afterBytes);

    const beforeScribe = fs.readFileSync(path.join(dir, plan.targets[1].path), 'utf8');
    const attemptBeforeResume = JSON.parse(
      fs.readFileSync(path.join(dir, plan.targets[3].path), 'utf8'),
    );
    assert.equal(attemptBeforeResume.state, 'finalized');
    assert.notEqual(getWorkItem(dir, CHANGE, RECOVERY_TASK_ID).status, 'done');

    const result = recoverFinalization(dir, {
      change: CHANGE,
      taskId: RECOVERY_TASK_ID,
      attemptId: RECOVERY_ATTEMPT_ID,
      sourceRevision: SOURCE_REVISION,
      targets: plan.targets,
      commit: plan.commit,
    });

    assert.equal(result.status, 'resumed');
    assert.equal(getWorkItem(dir, CHANGE, RECOVERY_TASK_ID).status, 'done');
    assert.equal(
      fs.readFileSync(path.join(dir, plan.targets[0].path), 'utf8'),
      plan.targets[0].afterBytes,
    );
    assert.equal(fs.readFileSync(path.join(dir, plan.targets[1].path), 'utf8'), beforeScribe);
    assert.equal(
      countMatches(beforeScribe, new RegExp(`Attempt:\\s*${RECOVERY_ATTEMPT_ID}`, 'g')),
      1,
    );
    assert.equal(
      fs.readFileSync(path.join(dir, plan.targets[2].path), 'utf8'),
      plan.targets[2].afterBytes,
    );
    const attemptAfter = JSON.parse(fs.readFileSync(path.join(dir, plan.targets[3].path), 'utf8'));
    assert.equal(attemptAfter.state, 'finalized');
    assert.equal(
      attemptAfter.history.filter((entry) => entry.state === 'finalized').length,
      1,
    );
    assert.deepEqual(attemptAfter, attemptBeforeResume);
    assert.equal(
      fs.readFileSync(path.join(dir, plan.targets[4].path), 'utf8'),
      plan.targets[4].afterBytes,
    );
    assert.equal(
      fs.readFileSync(path.join(dir, plan.targets[5].path), 'utf8'),
      plan.targets[5].afterBytes,
    );
    assert.equal(
      fs.readFileSync(path.join(dir, plan.commit.path), 'utf8'),
      plan.commit.afterBytes,
    );
  } finally {
    cleanup(dir);
  }
});

test('recoverFinalization repeats an already committed completion without changing bytes or duplicating records', () => {
  const dir = tempProject();
  try {
    seedRecoveryFixture(dir, { attemptState: 'accepted' });
    const plan = buildFinalizationPlan(dir, recoveryPlanOptions());
    createFinalizationJournal(dir, plan.journal, {
      change: CHANGE,
      taskId: RECOVERY_TASK_ID,
      attemptId: RECOVERY_ATTEMPT_ID,
      sourceRevision: SOURCE_REVISION,
    });

    const first = recoverFinalization(dir, {
      change: CHANGE,
      taskId: RECOVERY_TASK_ID,
      attemptId: RECOVERY_ATTEMPT_ID,
      sourceRevision: SOURCE_REVISION,
      targets: plan.targets,
      commit: plan.commit,
    });
    assert.equal(first.status, 'committed');
    assert.equal(getWorkItem(dir, CHANGE, RECOVERY_TASK_ID).status, 'done');

    const targetSnapshot = snapshotTargets(dir, [...plan.targets, plan.commit]);
    const scribeText = fs.readFileSync(path.join(dir, plan.targets[1].path), 'utf8');
    const attemptText = fs.readFileSync(path.join(dir, plan.targets[3].path), 'utf8');
    const checkboxText = fs.readFileSync(path.join(dir, plan.targets[0].path), 'utf8');
    assert.equal(countMatches(scribeText, new RegExp(`Attempt:\\s*${RECOVERY_ATTEMPT_ID}`, 'g')), 1);
    assert.equal(
      JSON.parse(attemptText).history.filter((entry) => entry.state === 'finalized').length,
      1,
    );
    assert.match(checkboxText, new RegExp(`- \\[x\\]\\s+${RECOVERY_TASK_ID}\\b`));

    const second = recoverFinalization(dir, {
      change: CHANGE,
      taskId: RECOVERY_TASK_ID,
      attemptId: RECOVERY_ATTEMPT_ID,
      sourceRevision: SOURCE_REVISION,
      targets: plan.targets,
      commit: plan.commit,
    });
    assert.equal(second.status, 'already-committed');
    assert.deepEqual(snapshotTargets(dir, [...plan.targets, plan.commit]), targetSnapshot);
    assert.equal(
      countMatches(
        fs.readFileSync(path.join(dir, plan.targets[1].path), 'utf8'),
        new RegExp(`Attempt:\\s*${RECOVERY_ATTEMPT_ID}`, 'g'),
      ),
      1,
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dir, plan.targets[3].path), 'utf8'))
        .history.filter((entry) => entry.state === 'finalized').length,
      1,
    );
    assert.equal(
      fs.readFileSync(path.join(dir, plan.targets[0].path), 'utf8'),
      checkboxText,
    );
  } finally {
    cleanup(dir);
  }
});

test('recoverFinalization conflict keeps the work item not done', () => {
  const dir = tempProject();
  try {
    seedRecoveryFixture(dir, { attemptState: 'accepted' });
    const plan = buildFinalizationPlan(dir, recoveryPlanOptions());
    createFinalizationJournal(dir, plan.journal, {
      change: CHANGE,
      taskId: RECOVERY_TASK_ID,
      attemptId: RECOVERY_ATTEMPT_ID,
      sourceRevision: SOURCE_REVISION,
    });
    writeText(path.join(dir, plan.targets[1].path), '# History\n\nexternal edit\n');

    assert.throws(
      () => recoverFinalization(dir, {
        change: CHANGE,
        taskId: RECOVERY_TASK_ID,
        attemptId: RECOVERY_ATTEMPT_ID,
        sourceRevision: SOURCE_REVISION,
        targets: plan.targets,
        commit: plan.commit,
      }),
      /conflict/i,
    );
    assert.notEqual(getWorkItem(dir, CHANGE, RECOVERY_TASK_ID).status, 'done');
  } finally {
    cleanup(dir);
  }
});

function seedFaultFixture(dir) {
  writeText(
    path.join(dir, 'openspec', 'changes', CHANGE, 'tasks.md'),
    [
      '# Tasks',
      '',
      '## 2. Replay and crash recovery',
      '',
      `- [ ] ${FAULT_TASK_ID} Add a library-only fault hook and table-driven failing tests`,
      '',
    ].join('\n'),
  );
  writeText(path.join(dir, '.factory', 'agents', 'scribe', 'history.md'), '# History\n\n(none yet)\n');
  writeText(path.join(dir, '.factory', 'identity', 'now.md'), '# Now\n\nIdle.\n');
  const attempt = {
    id: FAULT_ATTEMPT_ID,
    change: CHANGE,
    taskId: FAULT_TASK_ID,
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
    path.join(dir, '.factory', 'attempts', `${FAULT_ATTEMPT_ID}.json`),
    `${JSON.stringify(attempt, null, 2)}\n`,
  );
  upsertWorkItem(dir, {
    id: FAULT_TASK_ID,
    change: CHANGE,
    title: 'fault injection boundaries',
    status: 'in_progress',
    dependencies: ['2.1'],
    acceptanceCriteria: [],
    factory: { checks: ['unit'], verificationProfile: 'frontend-low' },
    attemptId: FAULT_ATTEMPT_ID,
  });
  return attempt;
}

function faultPlanOptions(overrides = {}) {
  return {
    change: CHANGE,
    taskId: FAULT_TASK_ID,
    attemptId: FAULT_ATTEMPT_ID,
    sourceRevision: SOURCE_REVISION,
    completionDate: COMPLETION_DATE,
    finalizedAt: FINALIZED_AT,
    ...overrides,
  };
}

function snapshotFinalState(dir, plan) {
  return Object.fromEntries(
    [...plan.targets, plan.commit].map((target) => {
      const absolute = path.join(dir, target.path);
      return [target.path, fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null];
    }),
  );
}

test('finalizationFaultBoundaries lists journal, every pre-commit target, ready-journal, and before-commit', () => {
  const boundaries = finalizationFaultBoundaries();
  assert.ok(boundaries.includes('before-journal-create'));
  assert.ok(boundaries.includes('after-journal-create'));
  for (const name of ['tasks', 'scribe', 'identity', 'attempt', 'index', 'ready-journal']) {
    assert.ok(boundaries.includes(`before-target:${name}`), `missing before-target:${name}`);
    assert.ok(boundaries.includes(`after-target:${name}`), `missing after-target:${name}`);
  }
  assert.ok(boundaries.includes('before-commit'));
  assert.equal(boundaries.at(-1), 'before-commit');
});

test('injected fault at every finalization boundary leaves item not done and uninjected retry reaches one byte-consistent state', () => {
  const boundaries = finalizationFaultBoundaries();
  assert.ok(boundaries.length >= 15, 'expected before/after journal, before/after each target, before-commit');

  for (const boundary of boundaries) {
    const dir = tempProject();
    try {
      seedFaultFixture(dir);
      const plan = buildFinalizationPlan(dir, faultPlanOptions());
      const injectOnce = (name) => {
        if (name === boundary) {
          throw new Error(`injected fault at ${boundary}`);
        }
      };

      assert.throws(
        () => runJournaledFinalization(dir, {
          ...faultPlanOptions(),
          plan,
          faultHook: injectOnce,
        }),
        new RegExp(`injected fault at ${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      );
      assert.notEqual(
        getWorkItem(dir, CHANGE, FAULT_TASK_ID).status,
        'done',
        `item must not be done after fault at ${boundary}`,
      );

      const recovered = runJournaledFinalization(dir, {
        ...faultPlanOptions(),
        plan,
      });
      assert.ok(
        recovered.status === 'committed' || recovered.status === 'resumed',
        `unexpected recovery status ${recovered.status} after ${boundary}`,
      );
      assert.equal(getWorkItem(dir, CHANGE, FAULT_TASK_ID).status, 'done');
      const afterFirst = snapshotFinalState(dir, plan);

      const again = runJournaledFinalization(dir, {
        ...faultPlanOptions(),
        plan,
      });
      assert.equal(again.status, 'already-committed');
      assert.deepEqual(
        snapshotFinalState(dir, plan),
        afterFirst,
        `byte-consistent final state after recovery from ${boundary}`,
      );
      assert.equal(
        countMatches(
          fs.readFileSync(path.join(dir, plan.targets[1].path), 'utf8'),
          new RegExp(`Attempt:\\s*${FAULT_ATTEMPT_ID}`, 'g'),
        ),
        1,
      );
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(dir, plan.targets[3].path), 'utf8'))
          .history.filter((entry) => entry.state === 'finalized').length,
        1,
      );
    } finally {
      cleanup(dir);
    }
  }
});

test('runJournaledFinalization without faultHook reaches committed final state', () => {
  const dir = tempProject();
  try {
    seedFaultFixture(dir);
    const plan = buildFinalizationPlan(dir, faultPlanOptions());
    const result = runJournaledFinalization(dir, {
      ...faultPlanOptions(),
      plan,
    });
    assert.equal(result.status, 'committed');
    assert.equal(getWorkItem(dir, CHANGE, FAULT_TASK_ID).status, 'done');
    for (const target of plan.targets) {
      assert.equal(
        fs.readFileSync(path.join(dir, target.path), 'utf8'),
        target.afterBytes,
      );
    }
    assert.equal(
      fs.readFileSync(path.join(dir, plan.commit.path), 'utf8'),
      plan.commit.afterBytes,
    );
  } finally {
    cleanup(dir);
  }
});
