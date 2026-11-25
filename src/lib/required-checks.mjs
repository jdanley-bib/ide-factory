import fs from 'node:fs';
import path from 'node:path';
import { readText } from './layout.mjs';
import {
  commandDigest,
  gitSnapshot,
  recordValidity,
  validateCheckRecord,
} from './verification-evidence.mjs';

const DEFAULT_PROFILE = 'frontend-low';
export const MISSING_RECORD_PREFIX = 'Missing passing check evidence for:';

export function readProfiles(project) {
  const file = path.join(project, '.factory', 'profiles.json');
  if (!fs.existsSync(file)) return {};
  let parsed;
  try {
    parsed = JSON.parse(readText(file));
  } catch {
    throw new Error('invalid .factory/profiles.json');
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/**
 * The checks an attempt must pass: the item's verification profile plus the item's own list.
 * An undefined profile name refuses rather than falling back to `unit`.
 */
export function requiredChecksFor(project, item) {
  const name = item?.factory?.verificationProfile || DEFAULT_PROFILE;
  const profiles = readProfiles(project);
  const fromProfile = Object.prototype.hasOwnProperty.call(profiles, name)
    ? profiles[name]?.checks
    : undefined;
  if (!Array.isArray(fromProfile)) {
    throw new Error(`unknown verification profile "${name}"; define it in .factory/profiles.json`);
  }
  const own = Array.isArray(item?.factory?.checks) ? item.factory.checks : [];
  return [...new Set([...fromProfile, ...own])];
}

export function readCheckRegistry(project) {
  const registryPath = path.join(project, '.factory', 'checks.json');
  if (!fs.existsSync(registryPath)) {
    throw new Error('missing check registry: .factory/checks.json');
  }
  let rawRegistry;
  try {
    rawRegistry = JSON.parse(readText(registryPath));
  } catch {
    throw new Error('invalid check registry JSON');
  }
  if (!rawRegistry || typeof rawRegistry !== 'object' || Array.isArray(rawRegistry)) {
    throw new Error('invalid check registry');
  }
  return rawRegistry.checks && typeof rawRegistry.checks === 'object' && !Array.isArray(rawRegistry.checks)
    ? rawRegistry.checks
    : {};
}

/**
 * Judge one required kind from the attempt's records. Any valid record passes; otherwise the
 * newest record's verdict is the state and reason. A kind with no record is `missing`.
 */
export function evaluateCheckKind(attempt, kind, rawEntry, {
  project,
  snapshot,
  requireCleanWorktree = true,
}) {
  const results = [
    ...(attempt.evidence?.verification || []),
    ...(attempt.evidence?.security || []),
  ];
  const candidates = results.filter((entry) => entry.kind === kind || entry.check === kind);
  const registryDigest = commandDigest(rawEntry.argv);
  let newest = null;
  for (const record of candidates) {
    let verdict;
    try {
      validateCheckRecord(record);
      verdict = recordValidity(record, {
        project,
        attemptId: attempt.id,
        entry: { argv: rawEntry.argv, commandDigest: registryDigest, cwdPolicy: rawEntry.cwdPolicy, timeoutMs: rawEntry.timeoutMs, artifacts: rawEntry.artifacts || [] },
        snapshot,
        requireCleanWorktree,
      });
    } catch (error) {
      verdict = { valid: false, kind: 'untrusted', reason: error.message };
    }
    if (verdict.valid) return { passed: true, state: 'valid', reason: null };
    newest = verdict;
  }
  if (!newest) return { passed: false, state: 'missing', reason: `${MISSING_RECORD_PREFIX} ${kind}` };
  return { passed: false, state: newest.kind, reason: newest.reason };
}

function assertMappedKind(rawChecks, kind) {
  const rawEntry = rawChecks[kind];
  if (rawEntry === undefined) {
    throw new Error(`Unknown or unmapped check kind: ${kind}`);
  }
  if (!Array.isArray(rawEntry?.argv) || rawEntry.argv.length === 0) {
    throw new Error(`Check kind has no argv mapping: ${kind}`);
  }
  if (!rawEntry.argv.every((part) => typeof part === 'string' && part.length > 0)) {
    throw new Error(`Check kind has no argv mapping: ${kind}`);
  }
  return rawEntry;
}

/**
 * Return the required kinds without a passing record, in order, each with its reason. Throws for
 * a kind the registry does not map. With stopAtFirst, the list holds at most one entry.
 */
export function unpassedChecks(attempt, required, {
  rawChecks,
  project,
  stopAtFirst = false,
  requireCleanWorktree = true,
  snapshot = gitSnapshot(project),
}) {
  const unpassed = [];
  for (const kind of required) {
    const rawEntry = assertMappedKind(rawChecks, kind);
    const verdict = evaluateCheckKind(attempt, kind, rawEntry, { project, snapshot, requireCleanWorktree });
    if (!verdict.passed) {
      unpassed.push({ kind, reason: verdict.reason });
      if (stopAtFirst) break;
    }
  }
  return unpassed;
}

/**
 * Per-kind state for `verify status`, judged by the same rule as the gates.
 */
export function checkStates(attempt, required, {
  rawChecks,
  project,
  requireCleanWorktree = true,
  snapshot = gitSnapshot(project),
}) {
  return required.map((kind) => {
    const rawEntry = rawChecks[kind];
    if (rawEntry === undefined) {
      return { kind, state: 'missing', reason: `Unknown or unmapped check kind: ${kind}` };
    }
    const verdict = evaluateCheckKind(attempt, kind, assertMappedKind(rawChecks, kind), {
      project,
      snapshot,
      requireCleanWorktree,
    });
    return { kind, state: verdict.state, reason: verdict.reason };
  });
}

/** Required kinds with their reasons when no record passes the current gate. Used by review handoff and review entry. */
export function missingCheckReasons(project, attempt, item) {
  const required = requiredChecksFor(project, item);
  const rawChecks = readCheckRegistry(project);
  return unpassedChecks(attempt, required, { rawChecks, project });
}

export function missingChecks(project, attempt, item) {
  return missingCheckReasons(project, attempt, item).map((entry) => entry.kind);
}

/**
 * Return null when the record passes from attestation facts.
 * Ignores any caller-supplied `passed` boolean.
 */
export function attestationFailureReason(record, { attemptId, registryDigest, headSha }) {
  if (record.issuer !== 'cli' && record.issuer !== 'import') {
    return 'verification-command attestation requires issuer cli or import';
  }
  if (record.exitCode !== 0) {
    return `attestation exit code must be 0 for: ${record.kind || 'check'}`;
  }
  if (record.timedOut !== false) {
    return 'attestation must not be timedOut';
  }
  if (record.commandDigest !== registryDigest) {
    return 'attestation commandDigest does not match current registry argv';
  }
  if (record.attemptId !== attemptId) {
    return 'attestation attemptId does not match attempt';
  }
  if (record.sourceRevision !== headSha) {
    return 'attestation sourceRevision does not match current clean HEAD';
  }
  return null;
}
