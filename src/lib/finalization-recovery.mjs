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
 * Build one deterministic finalization plan for the allowlisted pre-commit
 * targets plus the atomic work-item `done` commit point.
 *
 * Timestamps come only from the caller-supplied `completionDate` and
 * `finalizedAt`, so retries with the same inputs produce identical bytes.
 * The work-item update is returned as the final correctness-critical write
 * and is not applied by this function.
 *
 * @param {string} project
 * @param {{
 *   change: string,
 *   taskId: string,
 *   attemptId: string,
 *   sourceRevision: string,
 *   completionDate: string,
 *   finalizedAt: string,
 * }} options
 * @returns {{
 *   change: string,
 *   taskId: string,
 *   attemptId: string,
 *   sourceRevision: string,
 *   completionDate: string,
 *   finalizedAt: string,
 *   journal: object,
 *   targets: object[],
 *   commit: object,
 *   writeOrder: string[],
 *   finalCorrectnessCriticalWrite: string,
 * }}
 */
export function buildFinalizationPlan(project, options = {}) {
  if (!project || typeof project !== 'string') {
    throw new Error('project is required to build a finalization plan');
  }
  const change = requireOptionString(options, 'change');
  const taskId = requireOptionString(options, 'taskId');
  const attemptId = requireOptionString(options, 'attemptId');
  const sourceRevision = requireOptionString(options, 'sourceRevision');
  const completionDate = requireOptionString(options, 'completionDate');
  const finalizedAt = requireOptionString(options, 'finalizedAt');

  const paths = allowlistedTargetPaths({ change, taskId, attemptId });
  const [
    tasksRel,
    scribeRel,
    identityRel,
    attemptRel,
    indexRel,
    journalRel,
  ] = paths;
  const itemRel = `.factory/work/items/${change}--${taskId}.json`;

  const tasksBefore = readProjectText(project, tasksRel, { required: true });
  const tasksAfter = withCheckedCheckbox(tasksBefore, taskId);

  const scribeBefore = readProjectText(project, scribeRel, { required: false });
  const scribeAfter = withScribeMarker(scribeBefore, {
    change,
    taskId,
    attemptId,
    completionDate,
  });

  const identityBefore = readProjectText(project, identityRel, { required: false });
  const identityAfter = `# Now\n\nLast finalized: ${change}/${taskId} (${completionDate})\n`;

  const attemptBefore = readProjectText(project, attemptRel, { required: true });
  let attempt;
  try {
    attempt = JSON.parse(attemptBefore);
  } catch (err) {
    throw new Error(`finalization plan attempt JSON is corrupt: ${err.message}`);
  }
  if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) {
    throw new Error('finalization plan attempt must be an object');
  }
  const attemptAfterObj = {
    ...attempt,
    state: 'finalized',
    updatedAt: finalizedAt,
    evidence: {
      ...(attempt.evidence && typeof attempt.evidence === 'object' ? attempt.evidence : {}),
      completed: true,
    },
    history: [
      ...(Array.isArray(attempt.history) ? attempt.history : []),
      { at: finalizedAt, state: 'finalized' },
    ],
  };
  const attemptAfter = `${JSON.stringify(attemptAfterObj, null, 2)}\n`;

  const indexBefore = readProjectText(project, indexRel, { required: true });
  let index;
  try {
    index = JSON.parse(indexBefore);
  } catch (err) {
    throw new Error(`finalization plan work index JSON is corrupt: ${err.message}`);
  }
  if (!index || typeof index !== 'object' || Array.isArray(index)) {
    throw new Error('finalization plan work index must be an object');
  }
  const items = Array.isArray(index.items) ? index.items.map((entry) => {
    if (entry && entry.change === change && entry.id === taskId) {
      return { ...entry, status: 'done' };
    }
    return entry;
  }) : [];
  if (!items.some((entry) => entry && entry.change === change && entry.id === taskId)) {
    items.push({ change, id: taskId, status: 'done' });
  }
  const indexAfter = `${JSON.stringify({
    ...index,
    version: index.version ?? 1,
    updatedAt: finalizedAt,
    items,
  }, null, 2)}\n`;

  const itemBefore = readProjectText(project, itemRel, { required: true });
  let item;
  try {
    item = JSON.parse(itemBefore);
  } catch (err) {
    throw new Error(`finalization plan work item JSON is corrupt: ${err.message}`);
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('finalization plan work item must be an object');
  }
  const itemAfter = `${JSON.stringify({
    ...item,
    status: 'done',
    updatedAt: finalizedAt,
  }, null, 2)}\n`;

  const contentTargets = [
    targetFrom(tasksRel, tasksBefore, tasksAfter),
    targetFrom(scribeRel, scribeBefore, scribeAfter),
    targetFrom(identityRel, identityBefore, identityAfter),
    targetFrom(attemptRel, attemptBefore, attemptAfter),
    targetFrom(indexRel, indexBefore, indexAfter),
  ];

  // Journal self-target uses empty afterBytes in the storable prepared journal
  // so the document does not embed a copy of itself. The apply target carries
  // the ready-to-commit bytes (phase flip of that prepared document).
  const journalWireTarget = {
    path: journalRel,
    beforeDigest: `sha256:${'0'.repeat(64)}`,
    afterDigest: contentDigest(''),
    afterBytes: '',
  };
  const journal = {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    change,
    taskId,
    attemptId,
    sourceRevision,
    completionDate,
    phase: 'prepared',
    targets: [...contentTargets, journalWireTarget],
    planDigest: '',
  };
  journal.planDigest = planDigest(journal);
  // Use the validated document shape so prepared/ready bytes match
  // createFinalizationJournal atomic writes (stable field order).
  const preparedJournal = validateFinalizationJournal(journal, {
    change,
    taskId,
    attemptId,
    sourceRevision,
    projectRoot: project,
  });

  const preparedBytes = `${JSON.stringify(preparedJournal, null, 2)}\n`;
  const readyBytes = `${JSON.stringify({
    ...preparedJournal,
    phase: 'ready-to-commit',
  }, null, 2)}\n`;
  const journalApplyTarget = {
    path: journalRel,
    beforeDigest: contentDigest(preparedBytes),
    afterDigest: contentDigest(readyBytes),
    afterBytes: readyBytes,
  };

  const targets = [...contentTargets, journalApplyTarget];
  const commit = {
    path: itemRel,
    beforeDigest: contentDigest(itemBefore),
    afterDigest: contentDigest(itemAfter),
    afterBytes: itemAfter,
    role: 'final-correctness-critical-write',
  };
  const writeOrder = [...targets.map((target) => target.path), commit.path];

  return {
    change,
    taskId,
    attemptId,
    sourceRevision,
    completionDate,
    finalizedAt,
    journal: preparedJournal,
    targets,
    commit,
    writeOrder,
    finalCorrectnessCriticalWrite: commit.path,
  };
}

/**
 * Compare-and-apply one journaled target.
 * - current digest == afterDigest → skip
 * - current digest == beforeDigest → atomically write exact afterBytes
 * - otherwise → conflict (no write)
 *
 * @param {string} project
 * @param {{
 *   path: string,
 *   beforeDigest: string,
 *   afterDigest: string,
 *   afterBytes: string,
 * }} target
 * @returns {{ action: 'skipped' | 'applied', path: string }}
 */
export function compareAndApplyTarget(project, target) {
  if (!project || typeof project !== 'string') {
    throw new Error('project is required to compare-and-apply a finalization target');
  }
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new Error('finalization target must be an object');
  }
  requireNonEmptyString(target, 'path');
  requireNonEmptyString(target, 'beforeDigest');
  requireNonEmptyString(target, 'afterDigest');
  if (typeof target.afterBytes !== 'string') {
    throw new Error('finalization target afterBytes must be a string');
  }
  assertSafeRelativePath(target.path, path.resolve(project));

  const absolute = path.join(project, target.path);
  const currentBytes = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
  const currentDigest = contentDigest(currentBytes);

  if (currentDigest === target.afterDigest) {
    return { action: 'skipped', path: normalizeRelPath(target.path) };
  }
  if (currentDigest === target.beforeDigest) {
    if (contentDigest(target.afterBytes) !== target.afterDigest) {
      throw new Error('finalization target afterDigest does not match afterBytes');
    }
    atomicWriteText(absolute, target.afterBytes);
    return { action: 'applied', path: normalizeRelPath(target.path) };
  }
  throw new Error(
    `finalization recovery conflict for ${normalizeRelPath(target.path)}: `
    + `current digest matches neither before nor after`,
  );
}

/**
 * Replay an ordered list of journaled targets with compare-and-apply.
 * Stops on the first conflict without applying that target.
 *
 * @param {string} project
 * @param {object[]} targets
 * @returns {{ action: 'skipped' | 'applied', path: string }[]}
 */
export function replayFinalizationTargets(project, targets) {
  if (!Array.isArray(targets)) {
    throw new Error('finalization replay requires an ordered targets array');
  }
  const results = [];
  for (const target of targets) {
    results.push(compareAndApplyTarget(project, target));
  }
  return results;
}

/**
 * Resume or repeat a journaled finalization.
 *
 * Permitted when the attempt is accepted, finalize-failed, or already
 * finalized with this matching journal while the work item is unfinished.
 * When the matching ready journal and work item are already committed,
 * returns without changing bytes.
 *
 * @param {string} project
 * @param {{
 *   change: string,
 *   taskId: string,
 *   attemptId: string,
 *   sourceRevision: string,
 *   targets?: object[],
 *   commit?: object,
 * }} options
 * @returns {{
 *   status: 'committed' | 'resumed' | 'already-committed',
 *   attempt: object,
 *   item: object,
 *   actions: { action: string, path: string }[],
 * }}
 */
export function recoverFinalization(project, options = {}) {
  if (!project || typeof project !== 'string') {
    throw new Error('project is required to recover finalization');
  }
  const change = requireOptionString(options, 'change');
  const taskId = requireOptionString(options, 'taskId');
  const attemptId = requireOptionString(options, 'attemptId');
  const sourceRevision = requireOptionString(options, 'sourceRevision');

  const journal = readFinalizationJournal(project, attemptId, {
    change,
    taskId,
    attemptId,
    sourceRevision,
  });

  const attemptPathRel = `.factory/attempts/${attemptId}.json`;
  const itemPathRel = `.factory/work/items/${change}--${taskId}.json`;
  const attempt = readJsonObject(project, attemptPathRel, 'attempt');
  const item = readJsonObject(project, itemPathRel, 'work item');

  if (attempt.change !== change || attempt.taskId !== taskId || attempt.id !== attemptId) {
    throw new Error('finalization recovery attempt identity mismatch');
  }
  if (item.change !== change || item.id !== taskId) {
    throw new Error('finalization recovery work item identity mismatch');
  }

  const targets = Array.isArray(options.targets) && options.targets.length > 0
    ? options.targets
    : resolveApplyTargets(journal);
  const commit = options.commit && typeof options.commit === 'object'
    ? options.commit
    : null;

  if (!canResumeFinalization(attempt, item, journal)) {
    throw new Error(
      `finalization recovery refuses attempt state=${attempt.state} item status=${item.status}`,
    );
  }

  if (isFinalizationCommitted(project, journal, item, targets, commit)) {
    return {
      status: 'already-committed',
      attempt,
      item,
      actions: [],
    };
  }

  const hadPartialProgress = targets.some((target) => {
    const absolute = path.join(project, target.path);
    const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
    return contentDigest(current) === target.afterDigest;
  }) || attempt.state === 'finalized';

  const actions = replayFinalizationTargets(project, targets);

  if (commit) {
    actions.push(compareAndApplyTarget(project, commit));
  }

  const itemAfter = readJsonObject(project, itemPathRel, 'work item');
  const attemptAfter = readJsonObject(project, attemptPathRel, 'attempt');
  if (itemAfter.status !== 'done') {
    throw new Error('finalization recovery finished without marking the work item done');
  }

  return {
    status: hadPartialProgress ? 'resumed' : 'committed',
    attempt: attemptAfter,
    item: itemAfter,
    actions,
  };
}

/**
 * @param {object} attempt
 * @param {object} item
 * @param {object} journal
 * @returns {boolean}
 */
export function canResumeFinalization(attempt, item, journal) {
  if (!attempt || !item || !journal) return false;
  if (item.status === 'done' && journal.phase === 'ready-to-commit') return true;
  if (item.status === 'done') return false;
  if (attempt.state === 'accepted' || attempt.state === 'finalize-failed') return true;
  if (attempt.state === 'finalized') return true;
  return false;
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

function requireOptionString(options, field) {
  if (typeof options?.[field] !== 'string' || options[field].length === 0) {
    throw new Error(`finalization plan requires ${field}`);
  }
  return options[field];
}

function readProjectText(project, relPath, { required }) {
  const absolute = path.join(project, relPath);
  if (!fs.existsSync(absolute)) {
    if (required) {
      throw new Error(`finalization plan missing required target: ${relPath}`);
    }
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

function targetFrom(relPath, beforeText, afterText) {
  return {
    path: normalizeRelPath(relPath),
    beforeDigest: contentDigest(beforeText),
    afterDigest: contentDigest(afterText),
    afterBytes: afterText,
  };
}

function withCheckedCheckbox(tasksText, taskId) {
  const pattern = new RegExp(`^(- \\[)[^\\]]*(\\]\\s+${escapeRegExp(taskId)}\\s+)`, 'm');
  if (!pattern.test(tasksText)) {
    throw new Error(`Checkbox ${taskId} not found in OpenSpec tasks.md`);
  }
  return tasksText.replace(pattern, '$1x$2');
}

function withScribeMarker(historyText, { change, taskId, attemptId, completionDate }) {
  const marker = `## ${completionDate} finalized ${change}/${taskId}\n\nAttempt: ${attemptId}\n`;
  if (historyText.includes(`Attempt: ${attemptId}`)) {
    return historyText.endsWith('\n') ? historyText : `${historyText}\n`;
  }
  if (!historyText) return `${marker}`;
  const base = historyText.endsWith('\n') ? historyText : `${historyText}\n`;
  return `${base}\n${marker}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function atomicWriteText(absolutePath, bytes) {
  const dir = path.dirname(absolutePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(absolutePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, absolutePath);
}

function readJsonObject(project, relPath, label) {
  const absolute = path.join(project, relPath);
  let text;
  try {
    text = fs.readFileSync(absolute, 'utf8');
  } catch (err) {
    throw new Error(`finalization recovery ${label} unreadable: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`finalization recovery ${label} corrupt JSON: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`finalization recovery ${label} must be an object`);
  }
  return parsed;
}

/**
 * Resolve apply targets from a stored journal. Content targets keep their
 * afterBytes; the journal self-target is reconstructed as ready-to-commit.
 *
 * @param {object} journal
 * @returns {object[]}
 */
function resolveApplyTargets(journal) {
  const journalRel = normalizeRelPath(
    `.factory/orchestration/finalizations/${journal.attemptId}.json`,
  );
  return journal.targets.map((target) => {
    if (normalizeRelPath(target.path) !== journalRel) {
      return {
        path: normalizeRelPath(target.path),
        beforeDigest: target.beforeDigest,
        afterDigest: target.afterDigest,
        afterBytes: target.afterBytes,
      };
    }
    const prepared = {
      schemaVersion: journal.schemaVersion,
      change: journal.change,
      taskId: journal.taskId,
      attemptId: journal.attemptId,
      sourceRevision: journal.sourceRevision,
      completionDate: journal.completionDate,
      phase: 'prepared',
      planDigest: journal.planDigest,
      targets: journal.targets,
    };
    // Match validateFinalizationJournal / createFinalizationJournal field order.
    const preparedBytes = `${JSON.stringify(prepared, null, 2)}\n`;
    const readyBytes = `${JSON.stringify({ ...prepared, phase: 'ready-to-commit' }, null, 2)}\n`;
    return {
      path: journalRel,
      beforeDigest: contentDigest(preparedBytes),
      afterDigest: contentDigest(readyBytes),
      afterBytes: readyBytes,
    };
  });
}

function isFinalizationCommitted(project, journal, item, targets, commit) {
  if (item.status !== 'done') return false;
  if (journal.phase !== 'ready-to-commit') {
    // Disk journal may still say prepared while apply targets already wrote ready bytes.
    const journalAbs = finalizationJournalPath(project, journal.attemptId);
    if (!fs.existsSync(journalAbs)) return false;
    try {
      const onDisk = JSON.parse(fs.readFileSync(journalAbs, 'utf8'));
      if (onDisk.phase !== 'ready-to-commit') return false;
    } catch {
      return false;
    }
  }
  for (const target of targets) {
    const absolute = path.join(project, target.path);
    const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
    if (contentDigest(current) !== target.afterDigest) return false;
  }
  if (commit) {
    const absolute = path.join(project, commit.path);
    const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
    if (contentDigest(current) !== commit.afterDigest) return false;
  }
  return true;
}
