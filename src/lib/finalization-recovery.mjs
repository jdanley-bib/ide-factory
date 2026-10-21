import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SUPPORTED_SCHEMA_VERSION = 1;
const ALLOWED_PHASES = new Set(['prepared', 'ready-to-commit']);

const REQUIRED_FIELDS = [
  'schemaVersion',
  'change',
  'taskId',
  'attemptId',
  'sourceRevision',
  'completionDate',
  'phase',
  'planDigest',
  'targets',
];

/**
 * Ordered allowlisted finalization target paths for a bound change/task/attempt.
 *
 * @param {{ change: string, taskId?: string, attemptId: string }} identity
 * @returns {string[]}
 */
export function allowlistedTargetPaths(identity) {
  const change = identity?.change;
  const attemptId = identity?.attemptId;
  if (typeof change !== 'string' || change.length === 0) {
    throw new Error('allowlisted targets require change');
  }
  if (typeof attemptId !== 'string' || attemptId.length === 0) {
    throw new Error('allowlisted targets require attemptId');
  }
  return [
    `openspec/changes/${change}/tasks.md`,
    '.factory/agents/scribe/history.md',
    '.factory/identity/now.md',
    `.factory/attempts/${attemptId}.json`,
    '.factory/work/index.json',
    `.factory/orchestration/finalizations/${attemptId}.json`,
  ];
}

/**
 * SHA-256 digest of UTF-8 bytes as `sha256:<hex>`.
 *
 * @param {string|Buffer} bytes
 * @returns {string}
 */
export function contentDigest(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), 'utf8');
  const hex = createHash('sha256').update(buf).digest('hex');
  return `sha256:${hex}`;
}

/**
 * Digest of the immutable finalization plan (excludes phase and planDigest).
 *
 * @param {object} journal
 * @returns {string}
 */
export function planDigest(journal) {
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) {
    throw new Error('journal plan must be an object');
  }
  const targets = Array.isArray(journal.targets)
    ? journal.targets.map((target) => ({
      path: target?.path,
      beforeDigest: target?.beforeDigest,
      afterDigest: target?.afterDigest,
      afterBytes: target?.afterBytes,
    }))
    : [];
  const plan = {
    schemaVersion: journal.schemaVersion,
    change: journal.change,
    taskId: journal.taskId,
    attemptId: journal.attemptId,
    sourceRevision: journal.sourceRevision,
    completionDate: journal.completionDate,
    targets,
  };
  return contentDigest(canonicalJson(plan));
}

/**
 * Validate a schema version 1 finalization journal.
 * Rejects unsupported schema, path traversal, non-allowlisted targets,
 * identity mismatch, revision mismatch, and plan-digest mismatch.
 *
 * @param {unknown} journal
 * @param {{
 *   change?: string,
 *   taskId?: string,
 *   attemptId?: string,
 *   sourceRevision?: string,
 *   projectRoot?: string,
 * }} [options]
 * @returns {object}
 */
export function validateFinalizationJournal(journal, options = {}) {
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) {
    throw new Error('finalization journal must be an object');
  }

  for (const field of REQUIRED_FIELDS) {
    if (journal[field] === undefined || journal[field] === null || journal[field] === '') {
      throw new Error(`finalization journal missing required field: ${field}`);
    }
  }

  if (journal.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`unsupported finalization journal schema version: ${journal.schemaVersion}`);
  }

  requireNonEmptyString(journal, 'change');
  requireNonEmptyString(journal, 'taskId');
  requireNonEmptyString(journal, 'attemptId');
  requireNonEmptyString(journal, 'sourceRevision');
  requireNonEmptyString(journal, 'completionDate');
  requireNonEmptyString(journal, 'planDigest');

  if (!ALLOWED_PHASES.has(journal.phase)) {
    throw new Error('finalization journal phase must be "prepared" or "ready-to-commit"');
  }

  assertIdentityMatch(journal, options);
  if (
    typeof options.sourceRevision === 'string'
    && options.sourceRevision.length > 0
    && journal.sourceRevision !== options.sourceRevision
  ) {
    throw new Error('finalization journal source revision mismatch');
  }

  if (!Array.isArray(journal.targets) || journal.targets.length === 0) {
    throw new Error('finalization journal requires ordered targets');
  }

  const expectedPaths = allowlistedTargetPaths({
    change: journal.change,
    taskId: journal.taskId,
    attemptId: journal.attemptId,
  });
  if (journal.targets.length !== expectedPaths.length) {
    throw new Error('finalization journal targets must match the allowlisted ordered set');
  }

  const projectRoot = typeof options.projectRoot === 'string' && options.projectRoot.length > 0
    ? path.resolve(options.projectRoot)
    : null;

  const targets = journal.targets.map((target, index) =>
    validateTarget(target, expectedPaths[index], projectRoot, index));

  const expectedPlanDigest = planDigest({
    schemaVersion: journal.schemaVersion,
    change: journal.change,
    taskId: journal.taskId,
    attemptId: journal.attemptId,
    sourceRevision: journal.sourceRevision,
    completionDate: journal.completionDate,
    targets,
  });
  if (journal.planDigest !== expectedPlanDigest) {
    throw new Error('finalization journal plan digest mismatch');
  }

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    change: journal.change,
    taskId: journal.taskId,
    attemptId: journal.attemptId,
    sourceRevision: journal.sourceRevision,
    completionDate: journal.completionDate,
    phase: journal.phase,
    planDigest: expectedPlanDigest,
    targets,
  };
}

/**
 * Atomically create a prepared finalization journal.
 * On validation failure, writes nothing and does not mark the work item done.
 *
 * @param {string} project
 * @param {unknown} journal
 * @param {{
 *   change?: string,
 *   taskId?: string,
 *   attemptId?: string,
 *   sourceRevision?: string,
 * }} [options]
 * @returns {object}
 */
export function createFinalizationJournal(project, journal, options = {}) {
  if (!project || typeof project !== 'string') {
    throw new Error('project is required to create a finalization journal');
  }
  const prepared = {
    ...(journal && typeof journal === 'object' ? journal : {}),
    phase: 'prepared',
  };
  const validated = validateFinalizationJournal(prepared, {
    ...options,
    projectRoot: project,
  });

  const dir = path.join(project, '.factory', 'orchestration', 'finalizations');
  fs.mkdirSync(dir, { recursive: true });
  const target = finalizationJournalPath(project, validated.attemptId);
  const tmp = path.join(
    dir,
    `.${validated.attemptId}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(tmp, `${JSON.stringify(validated, null, 2)}\n`);
  fs.renameSync(tmp, target);
  return validated;
}

/**
 * Read and validate a finalization journal. Corrupt or unsupported files fail
 * closed without rewriting bytes or marking the work item done.
 *
 * @param {string} project
 * @param {string} attemptId
 * @param {{
 *   change?: string,
 *   taskId?: string,
 *   attemptId?: string,
 *   sourceRevision?: string,
 * }} [options]
 * @returns {object}
 */
export function readFinalizationJournal(project, attemptId, options = {}) {
  const file = finalizationJournalPath(project, attemptId);
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (err) {
    throw new Error(`finalization journal unreadable: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    throw new Error(`finalization journal corrupt JSON: ${err.message}`);
  }
  return validateFinalizationJournal(parsed, {
    ...options,
    attemptId: options.attemptId ?? attemptId,
    projectRoot: project,
  });
}

/**
 * @param {string} project
 * @param {string} attemptId
 * @returns {string}
 */
export function finalizationJournalPath(project, attemptId) {
  return path.join(
    project,
    '.factory',
    'orchestration',
    'finalizations',
    `${attemptId}.json`,
  );
}

function validateTarget(target, expectedPath, projectRoot, index) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new Error(`finalization journal target[${index}] must be an object`);
  }
  requireNonEmptyString(target, 'path');
  requireNonEmptyString(target, 'beforeDigest');
  requireNonEmptyString(target, 'afterDigest');
  if (typeof target.afterBytes !== 'string') {
    throw new Error(`finalization journal target[${index}] afterBytes must be a string`);
  }

  assertSafeRelativePath(target.path, projectRoot);
  if (normalizeRelPath(target.path) !== normalizeRelPath(expectedPath)) {
    throw new Error(
      `finalization journal target[${index}] path is not on the allowlist: ${target.path}`,
    );
  }

  const afterDigest = contentDigest(target.afterBytes);
  if (target.afterDigest !== afterDigest) {
    throw new Error(`finalization journal target[${index}] afterDigest does not match afterBytes`);
  }

  return {
    path: normalizeRelPath(expectedPath),
    beforeDigest: target.beforeDigest,
    afterDigest,
    afterBytes: target.afterBytes,
  };
}

function assertSafeRelativePath(relPath, projectRoot) {
  if (relPath.includes('\0')) {
    throw new Error('finalization journal target path is invalid');
  }
  if (path.isAbsolute(relPath)) {
    throw new Error(`finalization journal target path rejects absolute paths: ${relPath}`);
  }
  const segments = relPath.split(/[/\\]/).filter((part) => part.length > 0);
  if (segments.some((part) => part === '..')) {
    throw new Error(
      `finalization journal target path rejects parent-directory traversal: ${relPath}`,
    );
  }

  if (projectRoot) {
    const resolved = path.resolve(projectRoot, relPath);
    const relative = path.relative(projectRoot, resolved);
    if (
      relative === ''
      || relative.startsWith(`..${path.sep}`)
      || relative === '..'
      || path.isAbsolute(relative)
    ) {
      throw new Error(`finalization journal target path is outside the project: ${relPath}`);
    }
    try {
      if (fs.lstatSync(resolved).isSymbolicLink()) {
        const real = fs.realpathSync(resolved);
        const realRel = path.relative(projectRoot, real);
        if (
          realRel.startsWith(`..${path.sep}`)
          || realRel === '..'
          || path.isAbsolute(realRel)
        ) {
          throw new Error(
            `finalization journal target path symlink escapes the project: ${relPath}`,
          );
        }
      }
    } catch (err) {
      if (err && /symlink escapes|outside the project/.test(err.message)) throw err;
      // Missing path is fine during plan creation.
    }
  }
}

function assertIdentityMatch(journal, options) {
  for (const field of ['change', 'taskId', 'attemptId']) {
    const expected = options[field];
    if (typeof expected === 'string' && expected.length > 0 && journal[field] !== expected) {
      throw new Error(`finalization journal identity mismatch: ${field}`);
    }
  }
}

function normalizeRelPath(relPath) {
  return String(relPath).replace(/\\/g, '/');
}

function requireNonEmptyString(record, field) {
  if (typeof record[field] !== 'string' || record[field].length === 0) {
    throw new Error(`finalization journal ${field} must be a non-empty string`);
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
