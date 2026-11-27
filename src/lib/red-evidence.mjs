const NO_TESTS = /no tests|0 tests|no test files found|missing script|not recognized/i;

const EXACT_TEST_KINDS = new Set(['unit', 'integration', 'playwright', 'contract']);

export function isRequiredTestKind(kind) {
  return EXACT_TEST_KINDS.has(kind) || String(kind || '').startsWith('unit-');
}

export function requiredTestKinds(checks) {
  return (Array.isArray(checks) ? checks : []).filter((kind) => isRequiredTestKind(kind));
}

/**
 * A new red lives at evidence.reds[kind]. A legacy evidence.red counts for its
 * kind only when evidence.reds is absent.
 * @param {object} attempt
 * @param {string} kind
 */
export function redForKind(attempt, kind) {
  const reds = attempt?.evidence?.reds;
  if (reds && typeof reds === 'object' && !Array.isArray(reds)) {
    return reds[kind] || null;
  }
  const legacy = attempt?.evidence?.red;
  if (legacy && typeof legacy === 'object' && legacy.kind === kind) return legacy;
  return null;
}

/**
 * Every red recorded for a kind, oldest first. An attempt with no history reads as one entry
 * per stored red. reds[kind] stays the current red and always equals the last entry.
 * @param {object} attempt
 * @param {string} kind
 * @returns {object[]}
 */
export function redHistoryFor(attempt, kind) {
  const history = attempt?.evidence?.redHistory?.[kind];
  if (Array.isArray(history) && history.length > 0) return history;
  const current = redForKind(attempt, kind);
  return current ? [current] : [];
}

/**
 * Append a red in the same object that updates the current pointer. The caller writes the
 * attempt file once. Earlier entries are never replaced.
 * @param {object} attempt
 * @param {string} kind
 * @param {object} record
 */
export function appendRed(attempt, kind, record) {
  attempt.evidence = attempt.evidence || {};
  const earlier = redHistoryFor(attempt, kind);
  attempt.evidence.redHistory = { ...(attempt.evidence.redHistory || {}), [kind]: [...earlier, record] };
  attempt.evidence.reds = { ...(attempt.evidence.reds || {}), [kind]: record };
}

export function isFailingRed(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.issuer !== 'cli') return false;
  if (record.exitCode === undefined || record.exitCode === null || record.exitCode === 0) return false;
  return true;
}

export function hasAnyFailingRed(attempt) {
  const reds = attempt?.evidence?.reds;
  if (reds && typeof reds === 'object' && !Array.isArray(reds)) {
    return Object.values(reds).some((record) => isFailingRed(record));
  }
  return isFailingRed(attempt?.evidence?.red);
}

/**
 * @param {{ spawnError?: unknown, timedOut?: boolean, exitCode?: number|null, output?: string, asRed?: boolean }} outcome
 * @returns {'infrastructure-failure'|'vacuous-red'|'passed'|'assertion-failure'}
 */
export function classifyCheckOutcome(outcome) {
  const output = outcome.output || '';
  if (outcome.spawnError || outcome.timedOut || outcome.exitCode === 127) return 'infrastructure-failure';
  if (NO_TESTS.test(output)) return 'infrastructure-failure';
  if (outcome.exitCode === 0) return outcome.asRed ? 'vacuous-red' : 'passed';
  return 'assertion-failure';
}

export function retryKey(classification, kind) {
  if (classification === 'review-rejection') return 'review-rejection';
  return `${classification}:${kind}`;
}

/**
 * Structured metadata for a red run that did not record an assertion failure.
 * Carries no raw output: only the log digest identifies what the check printed.
 */
export function redFailureDiagnostics({
  kind,
  classification,
  timedOut,
  timeoutMs,
  startedAt,
  finishedAt,
  exitCode,
  spawnError,
  executable,
  logDigest,
  recordedAt,
}) {
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  return {
    kind,
    classification,
    timedOut: Boolean(timedOut),
    timeoutMs: timeoutMs ?? null,
    durationMs,
    exitCode: exitCode ?? null,
    spawnError: spawnError ? String(spawnError.code || 'UNKNOWN') : null,
    ...(spawnError && typeof executable === 'string' ? { executable } : {}),
    logDigest,
    recordedAt,
  };
}

/**
 * Human-readable detail for the error thrown on a non-assertion red run.
 * @param {ReturnType<typeof redFailureDiagnostics>} entry
 */
export function describeRedFailure(entry) {
  if (entry.timedOut) return `timed out after ${entry.timeoutMs} ms, elapsed ${entry.durationMs} ms`;
  if (entry.spawnError) return spawnFailureDetail(entry.executable, entry.spawnError);
  if (entry.classification === 'vacuous-red' || entry.exitCode === 127) return `exit code ${entry.exitCode}`;
  return `no tests reported, exit code ${entry.exitCode}`;
}

const WINDOWS_SHIM = /\.(cmd|bat)$/i;

/**
 * Explain a failure to start a registered executable. Names the executable and
 * the platform code, and says so when a Windows batch shim cannot start without
 * a shell. Never describes a spawn failure as a test failure.
 * @param {string|undefined} executable
 * @param {string} code
 */
export function spawnFailureDetail(executable, code) {
  const named = typeof executable === 'string' && executable.length > 0 ? ` starting ${executable}` : '';
  const base = `spawn error ${code}${named}`;
  if (typeof executable === 'string' && WINDOWS_SHIM.test(executable) && (code === 'EINVAL' || code === 'ENOENT')) {
    return `${base}: ${executable} is a batch shim and cannot be started without a shell. Register the underlying executable instead.`;
  }
  return base;
}
