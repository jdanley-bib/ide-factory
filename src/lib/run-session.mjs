import fs from 'node:fs';

const SUPPORTED_SCHEMA_VERSION = 1;

const REQUIRED_BUDGET_KEYS = [
  'maxAgentSteps',
  'maxTasks',
  'maxWallClockMs',
  'maxFailures',
];

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
