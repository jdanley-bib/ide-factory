import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readRunSession, validateRunSession } from '../src/lib/run-session.mjs';

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
