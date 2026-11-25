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
  if (entry.spawnError) return `spawn error ${entry.spawnError}`;
  if (entry.classification === 'vacuous-red' || entry.exitCode === 127) return `exit code ${entry.exitCode}`;
  return `no tests reported, exit code ${entry.exitCode}`;
}
