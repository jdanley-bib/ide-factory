import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { BlockedError } from '../src/lib/blocked-error.mjs';
import { buildAutonomyReport } from '../src/lib/autonomy.mjs';
import { readControlEvents } from '../src/lib/event-log.mjs';
import { progressPath, readProgress, decisionProblem, retryCount } from '../src/lib/mcp-progress.mjs';
import {
  ackPlan, createPlan, factsOf, formatPlan, pendingPlans, readPlan, recordOperation,
} from '../src/lib/mcp-plan.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

const commentOperation = {
  tool: 'wit_work_item_comment_write',
  arguments: { action: 'add', orgName: 'contoso', project: 'Shop', workItemId: 7, comment: 'hello' },
};

const updateOperation = {
  tool: 'wit_work_item_write',
  arguments: { action: 'update', orgName: 'contoso', project: 'Shop', workItemId: 7, updates: [] },
};

function samplePlan(operations = [commentOperation]) {
  return {
    kind: 'board-comment',
    change: 'demo',
    operations,
    effects: { writes: [{ path: '.factory/boards/demo.json', json: { change: 'demo', note: 'x' } }] },
  };
}

async function project() {
  const dir = tempProject();
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  return dir;
}

function setCap(dir, value) {
  fs.mkdirSync(path.join(dir, '.factory'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.factory', 'config.json'), JSON.stringify({ mcp: { maxOperationAttempts: value } }));
}

test('new plans carry repeat and read-back facts, and the plan text shows them', async () => {
  const dir = await project();
  try {
    const pullRequest = { tool: 'repo_pull_request_write', arguments: { action: 'create', orgName: 'contoso', project: 'Shop', repositoryId: 'r', sourceRefName: 'refs/heads/f', targetRefName: 'refs/heads/main', title: 'T' } };
    const thread = { tool: 'repo_pull_request_thread_write', arguments: { action: 'create', orgName: 'contoso', project: 'Shop', repositoryId: 'r', pullRequestId: 3, comments: [] } };
    const plan = createPlan(dir, samplePlan([commentOperation, updateOperation, pullRequest, thread]));
    const [comment, update, pr, threadOp] = readPlan(dir, plan.id).operations;
    assert.equal(pr.repeat, 'check-first');
    assert.equal(pr.verify.tool, 'repo_pull_request');
    assert.equal(threadOp.repeat, 'check-first');
    assert.equal(threadOp.verify.tool, 'repo_pull_request_thread');
    assert.equal(comment.repeat, 'check-first');
    assert.equal(comment.verify.tool, 'wit_work_item');
    assert.equal(update.repeat, 'safe');
    assert.equal(update.verify, null);
    const text = formatPlan(readPlan(dir, plan.id));
    assert.match(text, /repeat: check-first; read-back wit_work_item get/);
    assert.match(text, /repeat: safe; no read-back/);
    assert.match(text, /idefactory mcp record/);
  } finally {
    cleanup(dir);
  }
});

test('a stored plan from before the facts existed loads, and a retry on it is refused until the agent escalates', async () => {
  const dir = await project();
  try {
    const plan = samplePlan();
    const content = { kind: plan.kind, change: plan.change, operations: plan.operations, effects: plan.effects };
    const id = `plan-${createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 12)}`;
    fs.mkdirSync(path.join(dir, '.factory', 'mcp'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.factory', 'mcp', `${id}.json`), `${JSON.stringify({ id, ...content }, null, 2)}\n`);
    assert.equal(readPlan(dir, id).id, id);
    assert.throws(() => recordOperation(dir, id, {
      operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry', readback: 'absent',
    }), /no read-back defined/);
    const { record } = recordOperation(dir, id, {
      operation: 1, outcome: 'failed', cause: 'transient', decision: 'escalate',
    });
    assert.equal(record.decision, 'escalate');
  } finally {
    cleanup(dir);
  }
});

test('an operation without facts is treated as check-first with no read-back', () => {
  assert.deepEqual(factsOf(commentOperation), { repeat: 'check-first', verify: null });
  const problem = decisionProblem({
    operation: 1,
    fact: factsOf(commentOperation),
    outcome: 'failed',
    cause: 'transient',
    decision: 'retry',
    readback: 'absent',
  }, [], 3);
  assert.match(problem.message, /no read-back defined/);
});

test('the retry cap reads mcp.maxOperationAttempts and falls back to 3 when it is out of range', async () => {
  const dir = await project();
  try {
    const { id } = createPlan(dir, samplePlan());
    const retry = { operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry-after-readback', readback: 'absent' };
    setCap(dir, 11);
    for (let i = 0; i < 3; i += 1) recordOperation(dir, id, retry);
    assert.throws(() => recordOperation(dir, id, retry), /cap is reached/);
    setCap(dir, 5);
    recordOperation(dir, id, retry);
    assert.equal(retryCount(readProgress(dir, id), 1), 4);
  } finally {
    cleanup(dir);
  }
});

test('a check-first retry needs a read-back of absent', async () => {
  const dir = await project();
  try {
    const { id } = createPlan(dir, samplePlan());
    assert.throws(() => recordOperation(dir, id, {
      operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry',
    }), /read-back \(wit_work_item get/);
    assert.throws(() => recordOperation(dir, id, {
      operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry', readback: 'present',
    }), /Only skip-applied/);
    assert.throws(() => recordOperation(dir, id, {
      operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry', readback: 'unavailable',
    }), /Only escalate/);
    assert.deepEqual(readProgress(dir, id), []);
    assert.equal(fs.existsSync(progressPath(dir, id)), false);
  } finally {
    cleanup(dir);
  }
});

test('a check-first retry after an absent read-back is recorded, and skip-applied needs a present read-back', async () => {
  const dir = await project();
  try {
    const { id } = createPlan(dir, samplePlan());
    recordOperation(dir, id, {
      operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry-after-readback', readback: 'absent',
    });
    assert.throws(() => recordOperation(dir, id, {
      operation: 1, outcome: 'failed', cause: 'transient', decision: 'skip-applied',
    }), /needs --readback present/);
    recordOperation(dir, id, {
      operation: 1, outcome: 'failed', cause: 'transient', decision: 'skip-applied', readback: 'present',
    });
    assert.equal(readProgress(dir, id).length, 2);
  } finally {
    cleanup(dir);
  }
});

test('a safe operation may be retried without a read-back', async () => {
  const dir = await project();
  try {
    const { id } = createPlan(dir, samplePlan([updateOperation]));
    const { record } = recordOperation(dir, id, {
      operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry',
    });
    assert.equal(record.decision, 'retry');
  } finally {
    cleanup(dir);
  }
});

test('the retry cap refuses the next retry with the operation-retry-cap blocked state and writes nothing', async () => {
  const dir = await project();
  try {
    setCap(dir, 1);
    const { id } = createPlan(dir, samplePlan());
    const first = { operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry-after-readback', readback: 'absent' };
    recordOperation(dir, id, first);
    assert.throws(() => recordOperation(dir, id, first), (error) => {
      assert.ok(error instanceof BlockedError);
      assert.equal(error.invariant, 'operation-retry-cap');
      return true;
    });
    assert.equal(readProgress(dir, id).length, 1);
    const cli = await idefactory(dir, ['mcp', 'record', id, '--operation', '1', '--outcome', 'failed', '--cause', 'transient', '--decision', 'retry-after-readback', '--readback', 'absent', '--json']);
    assert.equal(cli.code, 1);
    const report = JSON.parse(cli.out);
    assert.equal(report.invariant.code, 'operation-retry-cap');
    assert.equal(report.actor, 'human');
    assert.equal(readProgress(dir, id).length, 1);
  } finally {
    cleanup(dir);
  }
});

test('an unresolved operation blocks ack and an applied retry lets it through', async () => {
  const dir = await project();
  try {
    const { id } = createPlan(dir, samplePlan([updateOperation]));
    recordOperation(dir, id, { operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry' });
    assert.throws(() => ackPlan(dir, id, {}), /unresolved operation 1 \(failed\)/);
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'boards', 'demo.json')), false);
    assert.equal(readPlan(dir, id).operations.length, 1);

    recordOperation(dir, id, { operation: 1, outcome: 'applied', decision: 'retry' });
    ackPlan(dir, id, {});
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'boards', 'demo.json')), true);
    assert.equal(fs.existsSync(progressPath(dir, id)), false);
    const trail = path.join(dir, '.factory', 'mcp', 'archive', `${id}.progress.jsonl`);
    assert.deepEqual(readProgress(dir, id), []);
    assert.equal(fs.readFileSync(trail, 'utf8').trim().split('\n').length, 2);
  } finally {
    cleanup(dir);
  }
});

test('pending shows each operation latest outcome and retry count', async () => {
  const dir = await project();
  try {
    const { id } = createPlan(dir, samplePlan([updateOperation]));
    recordOperation(dir, id, { operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry' });
    const [row] = pendingPlans(dir);
    assert.equal(row.id, id);
    assert.deepEqual(row.progress, [{ operation: 1, outcome: 'failed', retries: 1 }]);

    const cli = await idefactory(dir, ['mcp', 'pending']);
    assert.match(cli.out, /operation 1: failed, 1 retry/);
    const json = await idefactory(dir, ['mcp', 'pending', '--json']);
    assert.equal(JSON.parse(json.out)[0].progress[0].retries, 1);
  } finally {
    cleanup(dir);
  }
});

test('escalate and non-conflict abandon record a human stop, conflict abandon does not', async () => {
  const dir = await project();
  try {
    const first = createPlan(dir, samplePlan([updateOperation]));
    recordOperation(dir, first.id, { operation: 1, outcome: 'failed', cause: 'permission', decision: 'escalate' });
    const second = createPlan(dir, samplePlan([{ ...updateOperation, arguments: { ...updateOperation.arguments, workItemId: 8 } }]));
    recordOperation(dir, second.id, { operation: 1, outcome: 'failed', cause: 'conflict', decision: 'abandon' });

    const events = readControlEvents(dir);
    const stops = events.filter((event) => event.type === 'blocked.recorded');
    assert.deepEqual(stops.map((event) => event.invariant), ['operation-escalated']);
    assert.equal(stops[0].actor, 'human');
    const decisions = events.filter((event) => event.type === 'mcp-decision');
    assert.deepEqual(decisions.map((event) => event.decision), ['escalate', 'abandon']);
    assert.ok(decisions.every((event) => !('note' in event)));
  } finally {
    cleanup(dir);
  }
});

test('a note is kept in the progress file and never in events', async () => {
  const dir = await project();
  try {
    const { id } = createPlan(dir, samplePlan([updateOperation]));
    recordOperation(dir, id, {
      operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry', note: 'secret-reasoning-text',
    });
    assert.match(fs.readFileSync(progressPath(dir, id), 'utf8'), /secret-reasoning-text/);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, '.factory', 'observability', 'events.jsonl'), 'utf8'), /secret-reasoning-text/);
  } finally {
    cleanup(dir);
  }
});

test('record refuses unknown enum values and operation numbers outside the plan', async () => {
  const dir = await project();
  try {
    const { id } = createPlan(dir, samplePlan());
    assert.throws(() => recordOperation(dir, id, { operation: 2, outcome: 'failed', cause: 'transient', decision: 'retry' }), /between 1 and 1/);
    assert.throws(() => recordOperation(dir, id, { operation: 1, outcome: 'maybe', decision: 'retry' }), /--outcome must be one of/);
    assert.throws(() => recordOperation(dir, id, { operation: 1, outcome: 'failed', cause: 'weather', decision: 'retry' }), /--cause must be one of/);
    assert.throws(() => recordOperation(dir, id, { operation: 1, outcome: 'failed', cause: 'transient', decision: 'panic' }), /--decision must be one of/);
    assert.equal(retryCount(readProgress(dir, id), 1), 0);
  } finally {
    cleanup(dir);
  }
});

test('autonomy counts retries and conflict abandons as handled, and pairs a retry with its ack', async () => {
  const dir = await project();
  try {
    const { id } = createPlan(dir, samplePlan([updateOperation]));
    recordOperation(dir, id, { operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry' });
    recordOperation(dir, id, { operation: 1, outcome: 'applied', decision: 'retry' });
    ackPlan(dir, id, {});
    const claim = createPlan(dir, samplePlan([{ ...updateOperation, arguments: { ...updateOperation.arguments, workItemId: 9 } }]));
    recordOperation(dir, claim.id, { operation: 1, outcome: 'failed', cause: 'conflict', decision: 'abandon' });

    const report = buildAutonomyReport(dir);
    assert.equal(report.counts.interventions, 0);
    assert.equal(report.counts.handledByInvariant['operation-retry'], 1);
    assert.equal(report.counts.handledByInvariant['operation-conflict'], 1);
    assert.equal(report.counts.autonomousRecoveries, 1);
    assert.equal(report.autonomousRecoveries[0].resolution, 'mcp-ack');
  } finally {
    cleanup(dir);
  }
});

test('record refuses a plan whose file no longer matches its id, and leaves the plan file untouched', async () => {
  const dir = await project();
  try {
    const { id } = createPlan(dir, samplePlan([updateOperation]));
    const file = path.join(dir, '.factory', 'mcp', `${id}.json`);
    const tampered = fs.readFileSync(file, 'utf8').replace('"workItemId": 7', '"workItemId": 70');
    fs.writeFileSync(file, tampered);
    assert.throws(() => recordOperation(dir, id, { operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry' }));
    assert.equal(fs.readFileSync(file, 'utf8'), tampered);
    assert.equal(fs.existsSync(progressPath(dir, id)), false);
  } finally {
    cleanup(dir);
  }
});

test('an applied skip-applied resolution lets ack through', async () => {
  const dir = await project();
  try {
    const { id } = createPlan(dir, samplePlan([commentOperation]));
    recordOperation(dir, id, {
      operation: 1, outcome: 'applied', decision: 'skip-applied', readback: 'present',
    });
    ackPlan(dir, id, {});
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'boards', 'demo.json')), true);
  } finally {
    cleanup(dir);
  }
});

const createOperation = (title) => ({
  tool: 'wit_work_item_write',
  arguments: { action: 'create', orgName: 'contoso', project: 'Shop', workItemType: 'Task', title },
});

function stubTracker() {
  const store = { items: [], creates: 0, failures: [] };
  return {
    store,
    create(title) {
      store.creates += 1;
      const failure = store.failures.shift();
      if (failure === 'landed-then-error') {
        store.items.push(title);
        throw new Error('503 Service Unavailable');
      }
      if (failure === 'conflict') throw Object.assign(new Error('409 revision mismatch'), { status: 409 });
      if (failure === 'error') throw new Error('503 Service Unavailable');
      store.items.push(title);
      return { id: store.items.length };
    },
    readBack(title) {
      return store.items.includes(title) ? 'present' : 'absent';
    },
  };
}

test('stubbed caller: a 409 on the first claim operation is abandoned with no human stop', async () => {
  const dir = await project();
  try {
    const tracker = stubTracker();
    tracker.store.failures.push('conflict');
    const { id } = createPlan(dir, samplePlan([createOperation('Story')]));
    try {
      tracker.create('Story');
    } catch (error) {
      assert.equal(error.status, 409);
      recordOperation(dir, id, { operation: 1, outcome: 'failed', cause: 'conflict', decision: 'abandon' });
    }
    assert.equal(tracker.store.creates, 1);
    assert.equal(readControlEvents(dir).filter((event) => event.type === 'blocked.recorded').length, 0);
    assert.equal(buildAutonomyReport(dir).counts.interventions, 0);
    assert.throws(() => ackPlan(dir, id, {}), /unresolved/);
  } finally {
    cleanup(dir);
  }
});

test('stubbed caller: a create that landed before a 503 is skipped on read-back, with no second create', async () => {
  const dir = await project();
  try {
    const tracker = stubTracker();
    tracker.store.failures.push('landed-then-error');
    const { id } = createPlan(dir, samplePlan([createOperation('Story')]));
    try {
      tracker.create('Story');
    } catch {
      assert.equal(tracker.readBack('Story'), 'present');
      recordOperation(dir, id, {
        operation: 1, outcome: 'applied', decision: 'skip-applied', readback: 'present',
      });
    }
    ackPlan(dir, id, {});
    assert.equal(tracker.store.creates, 1);
    assert.deepEqual(tracker.store.items, ['Story']);
  } finally {
    cleanup(dir);
  }
});

test('stubbed caller: a transient failure with an absent read-back is retried once and then acked', async () => {
  const dir = await project();
  try {
    const tracker = stubTracker();
    tracker.store.failures.push('error');
    const { id } = createPlan(dir, samplePlan([createOperation('Story')]));
    try {
      tracker.create('Story');
    } catch {
      assert.equal(tracker.readBack('Story'), 'absent');
      recordOperation(dir, id, {
        operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry-after-readback', readback: 'absent',
      });
    }
    tracker.create('Story');
    recordOperation(dir, id, { operation: 1, outcome: 'applied', decision: 'retry' });
    ackPlan(dir, id, {});
    assert.equal(tracker.store.creates, 2);
    assert.deepEqual(tracker.store.items, ['Story']);
  } finally {
    cleanup(dir);
  }
});

test('stubbed caller: repeated transient failures stop at the retry cap with operation-retry-cap and no further create', async () => {
  const dir = await project();
  try {
    const tracker = stubTracker();
    tracker.store.failures.push('error', 'error', 'error', 'error', 'error');
    const { id } = createPlan(dir, samplePlan([createOperation('Story')]));
    let refusal = null;
    let attempts = 0;
    while (!refusal) {
      try {
        attempts += 1;
        tracker.create('Story');
        break;
      } catch {
        try {
          recordOperation(dir, id, {
            operation: 1, outcome: 'failed', cause: 'transient', decision: 'retry-after-readback', readback: 'absent',
          });
        } catch (error) {
          refusal = error;
        }
      }
    }
    assert.ok(refusal instanceof BlockedError);
    assert.equal(refusal.invariant, 'operation-retry-cap');
    assert.equal(tracker.store.creates, 4);
    assert.equal(attempts, 4);
    assert.deepEqual(tracker.store.items, []);
    assert.equal(retryCount(readProgress(dir, id), 1), 3);
  } finally {
    cleanup(dir);
  }
});
