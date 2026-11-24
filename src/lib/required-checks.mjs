import fs from 'node:fs';
import path from 'node:path';
import { readText } from './layout.mjs';
import { commandDigest, resolveGitBinding, validateCheckRecord } from './verification-evidence.mjs';

const DEFAULT_PROFILE = 'frontend-low';

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
 * Return the required kinds without a passing attestation, in order. Throws for a kind the
 * registry does not map. With stopAtFirst, the list holds at most one entry.
 */
export function unpassedChecks(attempt, required, { rawChecks, headSha, stopAtFirst = false }) {
  const results = [
    ...(attempt.evidence?.verification || []),
    ...(attempt.evidence?.security || []),
  ];
  const unpassed = [];
  for (const kind of required) {
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
    const registryDigest = commandDigest(rawEntry.argv);

    const candidates = results.filter((entry) => entry.kind === kind || entry.check === kind);
    let passed = false;
    let failureReason = null;
    for (const record of candidates) {
      try {
        validateCheckRecord(record);
      } catch (error) {
        if (/exitCode/i.test(error.message)) {
          failureReason = failureReason || 'check record requires exitCode';
        }
        continue;
      }
      const reason = attestationFailureReason(record, {
        attemptId: attempt.id,
        registryDigest,
        headSha,
      });
      if (!reason) {
        passed = true;
        break;
      }
      failureReason = failureReason || reason;
    }
    if (!passed) {
      unpassed.push({ kind, reason: failureReason || `Missing passing check evidence for: ${kind}` });
      if (stopAtFirst) break;
    }
  }
  return unpassed;
}

/** Required kinds with no passing record at the current HEAD. Used by review handoff and review entry. */
export function missingChecks(project, attempt, item) {
  const required = requiredChecksFor(project, item);
  const rawChecks = readCheckRegistry(project);
  const { sourceRevision: headSha } = resolveGitBinding(project);
  return unpassedChecks(attempt, required, { rawChecks, headSha }).map((entry) => entry.kind);
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
