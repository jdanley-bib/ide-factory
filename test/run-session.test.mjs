import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readRunSession, validateRunSession } from '../src/lib/run-session.mjs';
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

async function seedDemoChange(dir) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
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
  assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
}

function spawnRun(dir) {
  return spawnSync(
    process.execPath,
    [path.join(repoRoot, 'src/cli.mjs'), 'run', '--change', 'demo', '--path', dir],
    { cwd: dir, encoding: 'utf8', shell: false, env: process.env },
  );
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
    assert.equal(resumed.agentSteps, 3);
    assert.equal(resumed.change, 'demo');
  } finally {
    cleanup(dir);
  }
});
