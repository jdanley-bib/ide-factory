import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readRunSession, validateRunSession } from '../src/lib/run-session.mjs';
import { updateWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

function validSession(overrides = {}) {
  return {
    schemaVersion: 1,
    runId: 'run-abc-123',
    change: 'persist-bounded-run-sessions',
    status: 'open',
    startedAt: '2026-10-21T17:00:00.000Z',
    lastObservedAt: '2026-10-21T17:05:00.000Z',
    budgets: {
      maxAgentSteps: 20,
      maxTasks: 20,
      maxWallClockMs: 14_400_000,
      maxFailures: 5,
    },
    agentSteps: 0,
    completedTasks: 0,
    failureCount: 0,
    baselineDoneIds: [],
    countedFailureIds: [],
    lastRequestFingerprint: null,
    stopReason: null,
    ...overrides,
  };
}

test('schema version 1 session records required fields', () => {
  const fingerprint = {
    action: 'agent-step',
    role: 'engineer',
    taskId: '1.1',
    attemptId: '1dd1b142-2dc7-4317-a6f6-eea9e5019472',
    attemptState: 'implementing',
    workItemStatus: 'in_progress',
  };
  const input = validSession({
    agentSteps: 3,
    completedTasks: 1,
    failureCount: 2,
    lastRequestFingerprint: fingerprint,
    stopReason: 'max-agent-steps',
    status: 'closed',
  });

  const session = validateRunSession(input);

  assert.equal(session.schemaVersion, 1);
  assert.equal(session.runId, 'run-abc-123');
  assert.equal(session.change, 'persist-bounded-run-sessions');
  assert.equal(session.startedAt, '2026-10-21T17:00:00.000Z');
  assert.deepEqual(session.budgets, {
    maxAgentSteps: 20,
    maxTasks: 20,
    maxWallClockMs: 14_400_000,
    maxFailures: 5,
  });
  assert.equal(session.agentSteps, 3);
  assert.equal(session.completedTasks, 1);
  assert.equal(session.failureCount, 2);
  assert.deepEqual(session.lastRequestFingerprint, fingerprint);
  assert.equal(session.stopReason, 'max-agent-steps');
});

test('unsupported schema version is rejected without replacing the file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'run-session-'));
  const file = path.join(dir, 'run.json');
  const original = `${JSON.stringify(validSession({ schemaVersion: 99 }), null, 2)}\n`;
  fs.writeFileSync(file, original);

  assert.throws(
    () => readRunSession(file),
    /unsupported|schema version/i,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('non-JSON session body is rejected without replacing the file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'run-session-'));
  const file = path.join(dir, 'run.json');
  const original = 'not-json{{{';
  fs.writeFileSync(file, original);

  assert.throws(
    () => readRunSession(file),
    /JSON|parse|invalid/i,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

function listRunSessionFiles(project) {
  const runsDir = path.join(project, '.factory', 'orchestration', 'runs');
  if (!fs.existsSync(runsDir)) return [];
  return fs.readdirSync(runsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(runsDir, name));
}

function demoTaskBlock(id, title) {
  return [
    `- [ ] ${id} ${title}`,
    '  factory:',
    '    kind: general',
    '    checks: [unit]',
    '    verificationProfile: frontend-low',
    '    roles: [engineer, reviewer, scribe]',
    '',
  ].join('\n');
}

async function seedDemoChange(dir, tasksBody) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'openspec/changes/demo/tasks.md'),
    tasksBody || demoTaskBlock('1.1', 'Add parser'),
  );
  assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
}

function spawnRun(dir, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [path.join(repoRoot, 'src/cli.mjs'), 'run', '--change', 'demo', '--path', dir, ...extraArgs],
    { cwd: dir, encoding: 'utf8', shell: false, env: process.env },
  );
}

function parseOrchestrationJson(out) {
  const match = out.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(match, 'orchestration request must include a json block');
  return JSON.parse(match[1]);
}

/** Advance attempt state so the next run request differs (unchanged-state is task 3.1). */
function advanceAttemptState(dir, attemptId, state) {
  const file = path.join(dir, '.factory', 'attempts', `${attemptId}.json`);
  const attempt = JSON.parse(fs.readFileSync(file, 'utf8'));
  attempt.state = state;
  attempt.history = Array.isArray(attempt.history) ? attempt.history : [];
  attempt.history.push({ at: new Date().toISOString(), state });
  attempt.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, `${JSON.stringify(attempt, null, 2)}\n`);
}

test('first idefactory run for a change writes .factory/orchestration/runs/<run-id>.json', async () => {
  const dir = tempProject();
  try {
    await seedDemoChange(dir);
    assert.deepEqual(listRunSessionFiles(dir), [], 'no session files before first run');

    const result = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(result.code, 2, result.err + result.out);

    const files = listRunSessionFiles(dir);
    assert.equal(files.length, 1, `expected one session file, got ${files.join(', ')}`);
    const session = readRunSession(files[0]);
    assert.equal(session.change, 'demo');
    assert.equal(path.basename(files[0]), `${session.runId}.json`);
    assert.ok(files[0].includes(`${path.sep}orchestration${path.sep}runs${path.sep}`));
  } finally {
    cleanup(dir);
  }
});

test('second process resumes the same run id and agent-step count', async () => {
  const dir = tempProject();
  try {
    await seedDemoChange(dir);
    const first = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(first.code, 2, first.err + first.out);

    const filesAfterFirst = listRunSessionFiles(dir);
    assert.equal(filesAfterFirst.length, 1);
    const created = readRunSession(filesAfterFirst[0]);
    const bumped = {
      ...created,
      agentSteps: 3,
      lastObservedAt: '2026-10-21T17:10:00.000Z',
    };
    fs.writeFileSync(filesAfterFirst[0], `${JSON.stringify(bumped, null, 2)}\n`);

    const second = spawnRun(dir);
    assert.equal(second.status, 2, second.stderr + second.stdout);

    const filesAfterSecond = listRunSessionFiles(dir);
    assert.equal(filesAfterSecond.length, 1, 'resume must not create a second session file');
    const resumed = readRunSession(filesAfterSecond[0]);
    assert.equal(resumed.runId, created.runId);
    // Second process prints an agent-step request, so the count increments after resume.
    assert.equal(resumed.agentSteps, 4);
    assert.equal(resumed.change, 'demo');
  } finally {
    cleanup(dir);
  }
});

function appendLedger(project, event, data = {}) {
  const file = path.join(project, '.factory', 'ledger.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...data });
  fs.appendFileSync(file, `${line}\n`);
}

test('ledger run-session-opened with missing file and no close exits 1 invalid-session and creates no zeroed session', async () => {
  const dir = tempProject();
  try {
    await seedDemoChange(dir);
    const orphanRunId = 'orphan-run-session-1.3';
    appendLedger(dir, 'run-session-opened', { change: 'demo', runId: orphanRunId });
    assert.deepEqual(listRunSessionFiles(dir), [], 'precondition: no session files');

    const result = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(result.code, 1, result.err + result.out);
    assert.match(`${result.err}\n${result.out}`, /invalid-session/);
    assert.doesNotMatch(`${result.err}\n${result.out}`, /# Orchestration request/);
    assert.deepEqual(
      listRunSessionFiles(dir),
      [],
      'must not create a zeroed session when ledger open is unmatched',
    );
  } finally {
    cleanup(dir);
  }
});

test('ledger agent-step high-water above loaded file exits 1 without printing a request', async () => {
  const dir = tempProject();
  try {
    await seedDemoChange(dir);
    const first = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.equal(first.code, 2, first.err + first.out);

    const files = listRunSessionFiles(dir);
    assert.equal(files.length, 1);
    const created = readRunSession(files[0]);
    const lowered = {
      ...created,
      agentSteps: 1,
      lastObservedAt: '2026-10-21T17:12:00.000Z',
    };
    const originalBytes = `${JSON.stringify(lowered, null, 2)}\n`;
    fs.writeFileSync(files[0], originalBytes);
    appendLedger(dir, 'run-session-opened', { change: 'demo', runId: created.runId });
    appendLedger(dir, 'run-agent-step', { change: 'demo', runId: created.runId, agentSteps: 4 });

    const second = spawnRun(dir);
    assert.equal(second.status, 1, second.stderr + second.stdout);
    assert.match(`${second.stderr}\n${second.stdout}`, /invalid-session/);
    assert.doesNotMatch(`${second.stderr}\n${second.stdout}`, /# Orchestration request/);
    assert.equal(fs.readFileSync(files[0], 'utf8'), originalBytes, 'corrupt session bytes stay unchanged');
  } finally {
    cleanup(dir);
  }
});

test('max-agent-steps N allows N cross-process requests then process N+1 stops with max-agent-steps', async () => {
  const dir = tempProject();
  const N = 2;
  const advanceStates = ['implementing'];
  try {
    await seedDemoChange(dir);

    let runId = null;
    for (let step = 1; step <= N; step += 1) {
      const result = spawnRun(dir, ['--max-agent-steps', String(N)]);
      assert.equal(result.status, 2, `process ${step}: ${result.stderr}${result.stdout}`);
      assert.match(result.stdout, /# Orchestration request/);
      assert.match(result.stdout, /"action": "agent-step"/);

      const files = listRunSessionFiles(dir);
      assert.equal(files.length, 1, 'one session file across processes');
      const session = readRunSession(files[0]);
      assert.equal(session.budgets.maxAgentSteps, N);
      assert.equal(
        session.agentSteps,
        step,
        'incremented agentSteps must be persisted before the request is printed',
      );
      assert.equal(session.status, 'open');
      assert.equal(session.stopReason, null);
      if (runId == null) runId = session.runId;
      else assert.equal(session.runId, runId);

      const request = parseOrchestrationJson(result.stdout);
      assert.equal(request.action, 'agent-step');
      if (step < N) {
        advanceAttemptState(dir, request.attemptId, advanceStates[step - 1]);
      }
    }

    const capped = spawnRun(dir, ['--max-agent-steps', String(N)]);
    assert.equal(capped.status, 0, capped.stderr + capped.stdout);
    assert.match(`${capped.stderr}\n${capped.stdout}`, /max-agent-steps/);
    assert.doesNotMatch(`${capped.stderr}\n${capped.stdout}`, /# Orchestration request/);
    assert.doesNotMatch(`${capped.stderr}\n${capped.stdout}`, /"action": "agent-step"/);

    const files = listRunSessionFiles(dir);
    assert.equal(files.length, 1);
    const finalSession = readRunSession(files[0]);
    assert.equal(finalSession.runId, runId);
    assert.equal(finalSession.agentSteps, N);
    assert.equal(finalSession.stopReason, 'max-agent-steps');
    assert.equal(finalSession.status, 'closed');
  } finally {
    cleanup(dir);
  }
});

test('max-tasks counts only tasks finalized during the session; baseline done ids are excluded', async () => {
  const dir = tempProject();
  const maxTasks = 1;
  try {
    await seedDemoChange(
      dir,
      [
        demoTaskBlock('1.1', 'Already done before session'),
        demoTaskBlock('1.2', 'Finalize during session'),
        demoTaskBlock('1.3', 'Still open after cap'),
      ].join('\n'),
    );
    // Work already done at session creation must not count toward max-tasks.
    updateWorkItem(dir, 'demo', '1.1', { status: 'done' });

    const first = spawnRun(dir, ['--max-tasks', String(maxTasks)]);
    assert.equal(first.status, 2, first.stderr + first.stdout);
    assert.match(first.stdout, /# Orchestration request/);
    const firstRequest = parseOrchestrationJson(first.stdout);
    assert.equal(firstRequest.action, 'agent-step');
    assert.equal(firstRequest.taskId, '1.2');

    const filesAfterFirst = listRunSessionFiles(dir);
    assert.equal(filesAfterFirst.length, 1);
    const created = readRunSession(filesAfterFirst[0]);
    assert.equal(created.budgets.maxTasks, maxTasks);
    assert.deepEqual(created.baselineDoneIds, ['1.1']);
    assert.equal(created.completedTasks, 0);
    assert.equal(created.status, 'open');
    assert.equal(created.stopReason, null);

    // Finalize the configured number of tasks during the session.
    updateWorkItem(dir, 'demo', '1.2', { status: 'done' });

    const capped = spawnRun(dir, ['--max-tasks', String(maxTasks)]);
    assert.equal(capped.status, 0, capped.stderr + capped.stdout);
    assert.match(`${capped.stderr}\n${capped.stdout}`, /max-tasks/);
    assert.doesNotMatch(`${capped.stderr}\n${capped.stdout}`, /# Orchestration request/);
    assert.doesNotMatch(`${capped.stderr}\n${capped.stdout}`, /"action": "agent-step"/);

    const filesAfterCap = listRunSessionFiles(dir);
    assert.equal(filesAfterCap.length, 1);
    const finalSession = readRunSession(filesAfterCap[0]);
    assert.equal(finalSession.runId, created.runId);
    assert.deepEqual(finalSession.baselineDoneIds, ['1.1']);
    assert.equal(finalSession.completedTasks, maxTasks);
    assert.equal(finalSession.stopReason, 'max-tasks');
    assert.equal(finalSession.status, 'closed');
  } finally {
    cleanup(dir);
  }
});

test('session past maxWallClockMs exits 0 with wall-clock and no orchestration request', async () => {
  const dir = tempProject();
  const maxWallClockMs = 60_000;
  try {
    await seedDemoChange(dir);
    const first = spawnRun(dir, ['--max-tasks', '1']);
    assert.equal(first.status, 2, first.stderr + first.stdout);

    const files = listRunSessionFiles(dir);
    assert.equal(files.length, 1);
    const created = readRunSession(files[0]);
    const expiredStart = new Date(Date.now() - maxWallClockMs - 5_000).toISOString();
    fs.writeFileSync(
      files[0],
      `${JSON.stringify({
        ...created,
        startedAt: expiredStart,
        budgets: { ...created.budgets, maxWallClockMs },
        lastObservedAt: expiredStart,
      }, null, 2)}\n`,
    );

    const capped = spawnRun(dir, ['--max-tasks', '1']);
    assert.equal(capped.status, 0, capped.stderr + capped.stdout);
    assert.match(`${capped.stderr}\n${capped.stdout}`, /wall-clock/);
    assert.doesNotMatch(`${capped.stderr}\n${capped.stdout}`, /# Orchestration request/);
    assert.doesNotMatch(`${capped.stderr}\n${capped.stdout}`, /"action": "agent-step"/);

    const finalSession = readRunSession(files[0]);
    assert.equal(finalSession.runId, created.runId);
    assert.equal(finalSession.stopReason, 'wall-clock');
    assert.equal(finalSession.status, 'closed');
  } finally {
    cleanup(dir);
  }
});

test('clock earlier than startedAt exits 1 with invalid-session and no orchestration request', async () => {
  const dir = tempProject();
  try {
    await seedDemoChange(dir);
    const first = spawnRun(dir, ['--max-tasks', '1']);
    assert.equal(first.status, 2, first.stderr + first.stdout);

    const files = listRunSessionFiles(dir);
    assert.equal(files.length, 1);
    const created = readRunSession(files[0]);
    const futureStart = new Date(Date.now() + 3_600_000).toISOString();
    fs.writeFileSync(
      files[0],
      `${JSON.stringify({
        ...created,
        startedAt: futureStart,
        lastObservedAt: futureStart,
      }, null, 2)}\n`,
    );

    const regressed = spawnRun(dir, ['--max-tasks', '1']);
    assert.equal(regressed.status, 1, regressed.stderr + regressed.stdout);
    assert.match(`${regressed.stderr}\n${regressed.stdout}`, /invalid-session/);
    assert.doesNotMatch(`${regressed.stderr}\n${regressed.stdout}`, /# Orchestration request/);

    const finalSession = readRunSession(files[0]);
    assert.equal(finalSession.runId, created.runId);
    assert.equal(finalSession.stopReason, 'invalid-session');
    assert.equal(finalSession.status, 'closed');
  } finally {
    cleanup(dir);
  }
});
