import fs from 'node:fs';
import path from 'node:path';
import { readText } from './layout.mjs';
import { runsDir } from './run-session.mjs';
import { listWorkItems } from './work.mjs';

const WORK_STATUSES = ['todo', 'in_progress', 'done', 'blocked'];

/**
 * Read-only status document. Callers must not persist this object.
 * @param {string} project
 * @returns {object}
 */
export function buildStatusDocument(project) {
  const workCounts = emptyCounts();
  for (const item of listWorkItems(project)) {
    if (workCounts[item.status] !== undefined) workCounts[item.status] += 1;
  }

  const attemptCounts = {};
  const attemptsDir = path.join(project, '.factory', 'attempts');
  if (fs.existsSync(attemptsDir)) {
    for (const name of fs.readdirSync(attemptsDir)) {
      if (!name.endsWith('.json')) continue;
      const attempt = readJson(path.join(attemptsDir, name));
      if (!attempt || typeof attempt.state !== 'string') continue;
      attemptCounts[attempt.state] = (attemptCounts[attempt.state] || 0) + 1;
    }
  }

  const stopReasons = {};
  let openRuns = 0;
  const runs = runsDir(project);
  if (fs.existsSync(runs)) {
    for (const name of fs.readdirSync(runs)) {
      if (!name.endsWith('.json')) continue;
      const session = readJson(path.join(runs, name));
      if (!session) continue;
      if (session.status === 'open') openRuns += 1;
      if (typeof session.stopReason === 'string' && session.stopReason.length > 0) {
        stopReasons[session.stopReason] = (stopReasons[session.stopReason] || 0) + 1;
      }
    }
  }

  const approvals = { schema1: 0, schema2: 0 };
  const approvalsDir = path.join(project, '.factory', 'approvals');
  if (fs.existsSync(approvalsDir)) {
    for (const name of fs.readdirSync(approvalsDir)) {
      if (!name.endsWith('.json')) continue;
      const record = readJson(path.join(approvalsDir, name));
      if (!record) continue;
      if (record.schemaVersion === 2) approvals.schema2 += 1;
      else approvals.schema1 += 1;
    }
  }

  const activePath = path.join(project, '.factory', 'active-change.json');
  const active = fs.existsSync(activePath) ? readJson(activePath) : null;

  return {
    schemaVersion: 1,
    halt: fs.existsSync(path.join(project, 'HALT')),
    activeChange: active?.change || null,
    workCounts,
    metrics: {
      attempts: attemptCounts,
      openRuns,
      stopReasons,
      approvals,
    },
  };
}

function emptyCounts() {
  return Object.fromEntries(WORK_STATUSES.map((status) => [status, 0]));
}

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}
