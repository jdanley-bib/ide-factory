import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SUPPORTED_SCHEMA_VERSION = 1;

const REQUIRED_BUDGET_KEYS = [
  'maxAgentSteps',
  'maxTasks',
  'maxWallClockMs',
  'maxFailures',
];

/** Built-in positive defaults when config keys are absent (design.md). */
export const BUILTIN_RUN_BUDGETS = {
  maxAgentSteps: 20,
  maxTasks: 20,
  maxWallClockMs: 14_400_000,
  maxFailures: 5,
};

/**
 * Validate a schema version 1 run-session object.
 * Rejects unsupported schema versions and missing required fields.
 *
 * @param {unknown} session
 * @returns {object}
 */
export function validateRunSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) {
    throw new Error('run session must be an object');
  }
  if (session.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`unsupported run session schema version: ${session.schemaVersion}`);
  }

  requireString(session, 'runId');
  requireString(session, 'change');
  requireString(session, 'startedAt');

  if (session.status !== 'open' && session.status !== 'closed') {
    throw new Error('run session status must be "open" or "closed"');
  }

  const budgets = session.budgets;
  if (!budgets || typeof budgets !== 'object' || Array.isArray(budgets)) {
    throw new Error('run session requires budgets object');
  }
  for (const key of REQUIRED_BUDGET_KEYS) {
    if (!Number.isInteger(budgets[key]) || budgets[key] <= 0) {
      throw new Error(`run session budgets.${key} must be a positive integer`);
    }
  }

  requireNonNegativeInteger(session, 'agentSteps');
  requireNonNegativeInteger(session, 'completedTasks');
  requireNonNegativeInteger(session, 'failureCount');

  if (!('lastRequestFingerprint' in session)) {
    throw new Error('run session requires lastRequestFingerprint');
  }
  if (!('stopReason' in session)) {
    throw new Error('run session requires stopReason');
  }

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    runId: session.runId,
    change: session.change,
    status: session.status,
    startedAt: session.startedAt,
    lastObservedAt: session.lastObservedAt ?? null,
    budgets: {
      maxAgentSteps: budgets.maxAgentSteps,
      maxTasks: budgets.maxTasks,
      maxWallClockMs: budgets.maxWallClockMs,
      maxFailures: budgets.maxFailures,
      ...(budgets.maxTokens !== undefined ? { maxTokens: budgets.maxTokens } : {}),
      ...(budgets.maxCost !== undefined ? { maxCost: budgets.maxCost } : {}),
    },
    agentSteps: session.agentSteps,
    completedTasks: session.completedTasks,
    failureCount: session.failureCount,
    baselineDoneIds: Array.isArray(session.baselineDoneIds) ? [...session.baselineDoneIds] : [],
    countedFailureIds: Array.isArray(session.countedFailureIds)
      ? [...session.countedFailureIds]
      : [],
    lastRequestFingerprint: session.lastRequestFingerprint ?? null,
    stopReason: session.stopReason ?? null,
  };
}

/**
 * Read and validate a run-session file. On parse or schema failure the file
 * bytes are left unchanged and no replacement file is written.
 *
 * @param {string} filePath
 * @returns {object}
 */
export function readRunSession(filePath) {
  const bytes = fs.readFileSync(filePath);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    throw new Error(`invalid run session JSON: ${err.message}`);
  }
  return validateRunSession(parsed);
}

export function runsDir(project) {
  return path.join(project, '.factory', 'orchestration', 'runs');
}

export function runSessionPath(project, runId) {
  return path.join(runsDir(project), `${runId}.json`);
}

/**
 * Persist a validated session via temp file + rename.
 *
 * @param {string} project
 * @param {object} session
 * @returns {object}
 */
export function writeRunSession(project, session) {
  const validated = validateRunSession(session);
  const dir = runsDir(project);
  fs.mkdirSync(dir, { recursive: true });
  const target = runSessionPath(project, validated.runId);
  const tmp = path.join(dir, `.${validated.runId}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(validated, null, 2)}\n`);
  fs.renameSync(tmp, target);
  return validated;
}

/**
 * Latest session for a change by greatest startedAt, or null.
 *
 * @param {string} project
 * @param {string} change
 * @returns {object|null}
 */
export function latestRunSession(project, change) {
  const dir = runsDir(project);
  if (!fs.existsSync(dir)) return null;
  let latest = null;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const session = readRunSession(path.join(dir, name));
    if (session.change !== change) continue;
    if (!latest || session.startedAt > latest.startedAt) latest = session;
  }
  return latest;
}

/**
 * Resolve budgets for a new session: CLI/config, then built-in positive defaults.
 * Does not invent token/cost ceilings.
 *
 * @param {object} config
 * @param {{ maxTasks?: number|string }} [flags]
 * @returns {object}
 */
export function resolveNewSessionBudgets(config = {}, { maxTasks } = {}) {
  const run = config.run || {};
  return {
    maxAgentSteps: positiveIntOrDefault(run.defaultMaxAgentSteps, BUILTIN_RUN_BUDGETS.maxAgentSteps),
    maxTasks: positiveIntOrDefault(
      maxTasks != null && maxTasks !== '' ? maxTasks : run.defaultMaxTasks,
      BUILTIN_RUN_BUDGETS.maxTasks,
    ),
    maxWallClockMs: positiveIntOrDefault(run.defaultMaxWallClockMs, BUILTIN_RUN_BUDGETS.maxWallClockMs),
    maxFailures: positiveIntOrDefault(run.defaultMaxFailures, BUILTIN_RUN_BUDGETS.maxFailures),
  };
}

/**
 * Create a new open session file for the change.
 *
 * @param {string} project
 * @param {{ change: string, budgets: object, now?: Date }} options
 * @returns {object}
 */
export function createRunSession(project, { change, budgets, now = new Date() } = {}) {
  if (!change) throw new Error('createRunSession requires change');
  const startedAt = now.toISOString();
  return writeRunSession(project, {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    runId: randomUUID(),
    change,
    status: 'open',
    startedAt,
    lastObservedAt: startedAt,
    budgets,
    agentSteps: 0,
    completedTasks: 0,
    failureCount: 0,
    baselineDoneIds: [],
    countedFailureIds: [],
    lastRequestFingerprint: null,
    stopReason: null,
  });
}

/**
 * Resume the latest session for a change, or create one when none exists.
 * Resume preserves run id and counters; budgets are only applied on create.
 *
 * @param {string} project
 * @param {{ change: string, budgets: object, now?: Date }} options
 * @returns {object}
 */
export function openOrResumeRunSession(project, { change, budgets, now = new Date() } = {}) {
  if (!change) throw new Error('openOrResumeRunSession requires change');
  const existing = latestRunSession(project, change);
  if (existing) {
    return writeRunSession(project, {
      ...existing,
      lastObservedAt: now.toISOString(),
    });
  }
  return createRunSession(project, { change, budgets, now });
}

function positiveIntOrDefault(value, fallback) {
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) return n;
  return fallback;
}

function requireString(session, key) {
  if (typeof session[key] !== 'string' || session[key].length === 0) {
    throw new Error(`run session requires non-empty string ${key}`);
  }
}

function requireNonNegativeInteger(session, key) {
  if (!Number.isInteger(session[key]) || session[key] < 0) {
    throw new Error(`run session requires non-negative integer ${key}`);
  }
}
