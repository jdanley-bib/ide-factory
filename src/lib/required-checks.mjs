import fs from 'node:fs';
import path from 'node:path';
import { readText } from './layout.mjs';
import { isRequiredTestKind } from './red-evidence.mjs';
import { configuredPrincipalProvider, readPolicyVersion } from './principal.mjs';
import { isHumanGateRequired } from './risk-gates.mjs';
import { listWorkItems } from './work.mjs';
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

const REQUIREMENTS_SCHEMA_VERSION = 1;
const GATE_ACTIONS = ['accept', 'complete'];

function tryReadRegistry(project) {
  try {
    return { checks: readCheckRegistry(project), error: null };
  } catch (error) {
    return { checks: {}, error: error.message };
  }
}

function argvMapped(entry) {
  return Array.isArray(entry?.argv)
    && entry.argv.length > 0
    && entry.argv.every((part) => typeof part === 'string' && part.length > 0);
}

function gateSatisfiable(project) {
  if (readPolicyVersion(project) < 2) return { satisfiable: true, reason: null };
  try {
    configuredPrincipalProvider(project);
    return { satisfiable: true, reason: null };
  } catch (error) {
    return { satisfiable: false, reason: error.message };
  }
}

/**
 * The one requirement set for a work item: its checks with their sources, the kinds that need
 * red evidence, the human decisions it will need, its dependencies, and any problems that would
 * strand an attempt. Never throws for an item defect; problems are returned instead.
 */
export function resolveRequirements(project, item) {
  const problems = [];
  const profileName = item?.factory?.verificationProfile || DEFAULT_PROFILE;
  const profiles = readProfiles(project);
  const fromProfile = Object.prototype.hasOwnProperty.call(profiles, profileName)
    ? profiles[profileName]?.checks
    : undefined;
  if (!Array.isArray(fromProfile)) {
    problems.push({
      id: `undefined-profile:${profileName}`,
      invariant: `the verification profile "${profileName}" must be defined`,
      fix: '.factory/profiles.json',
      message: `unknown verification profile "${profileName}"; define it in .factory/profiles.json`,
    });
  }
  const own = Array.isArray(item?.factory?.checks) ? item.factory.checks : [];
  const byKind = new Map();
  const add = (kind, source) => {
    if (!byKind.has(kind)) byKind.set(kind, []);
    if (!byKind.get(kind).includes(source)) byKind.get(kind).push(source);
  };
  for (const kind of Array.isArray(fromProfile) ? fromProfile : []) add(kind, 'profile');
  for (const kind of own) add(kind, 'item');
  const checks = [...byKind].map(([kind, sources]) => ({ kind, sources }));

  const registry = tryReadRegistry(project);
  if (registry.error) {
    problems.push({
      id: 'check-registry',
      invariant: 'the check registry must exist and be valid JSON',
      fix: '.factory/checks.json',
      message: `${registry.error}; fix .factory/checks.json`,
    });
  } else {
    for (const { kind } of checks) {
      if (!argvMapped(registry.checks[kind])) {
        problems.push({
          id: `unmapped-kind:${kind}`,
          invariant: `the required check kind ${kind} must have a registered argv`,
          fix: '.factory/checks.json',
          message: `required check kind ${kind} has no argv in the check registry; map it in .factory/checks.json`,
        });
      }
    }
  }

  const lightweight = item?.factory?.taskType === 'lightweight';
  const redKinds = lightweight ? [] : checks.map((entry) => entry.kind).filter((kind) => isRequiredTestKind(kind));

  const gateRequired = isHumanGateRequired(project, profileName);
  const gate = gateRequired ? gateSatisfiable(project) : { satisfiable: true, reason: null };
  const humanDecisions = GATE_ACTIONS.map((action) => ({
    action,
    required: gateRequired,
    satisfiable: gate.satisfiable,
  }));
  if (gateRequired && !gate.satisfiable) {
    problems.push({
      id: 'unsatisfiable-gate',
      invariant: `the ${profileName} profile requires a human gate, but the policy cannot verify an approver`,
      fix: '.factory/config.json governance.principalVerifier (or set humanGate false in .factory/profiles.json)',
      message: `human gate for profile "${profileName}" cannot be satisfied: ${gate.reason}; configure governance.principalVerifier in .factory/config.json or set humanGate false in .factory/profiles.json`,
    });
  }

  const siblings = item?.change ? listWorkItems(project, item.change) : [];
  const dependencies = (Array.isArray(item?.dependencies) ? item.dependencies : []).map((id) => {
    const found = siblings.find((entry) => entry.id === id);
    return { id, exists: Boolean(found), status: found?.status || null };
  });
  for (const dep of dependencies) {
    if (!dep.exists) {
      problems.push({
        id: `missing-dependency:${dep.id}`,
        invariant: `the dependency ${dep.id} must exist in ${item.change}`,
        fix: `openspec/changes/${item.change}/tasks.md (then idefactory sync-tasks ${item.change})`,
        message: `dependency ${dep.id} does not exist in ${item.change}; fix tasks.md and run idefactory sync-tasks ${item.change}`,
      });
    }
  }

  return {
    schemaVersion: REQUIREMENTS_SCHEMA_VERSION,
    change: item?.change || null,
    taskId: item?.id || null,
    taskClass: lightweight ? 'lightweight' : 'code',
    verificationProfile: profileName,
    checks,
    redKinds,
    humanDecisions,
    dependencies,
    problems,
  };
}

/**
 * The checks an attempt must pass: the item's verification profile plus the item's own list.
 * An undefined profile name refuses rather than falling back to `unit`.
 */
export function requiredChecksFor(project, item) {
  const resolved = resolveRequirements(project, item);
  const profileProblem = resolved.problems.find((problem) => problem.id.startsWith('undefined-profile:'));
  if (profileProblem) throw new Error(profileProblem.message);
  return resolved.checks.map((entry) => entry.kind);
}

/** The kinds that need a red for this item, from the full requirement set. */
export function redKindsFor(project, item) {
  if (!project) {
    if (item?.factory?.taskType === 'lightweight') return [];
    return (Array.isArray(item?.factory?.checks) ? item.factory.checks : []).filter(isRequiredTestKind);
  }
  return resolveRequirements(project, item).redKinds;
}

/** One line per problem, naming the invariant and where to fix it. */
export function describeProblems(problems) {
  return problems.map((problem) => `- ${problem.message}`);
}

export function assertNoRequirementProblems(project, item) {
  const { problems } = resolveRequirements(project, item);
  if (problems.length) {
    throw new Error(
      `requirement problems for ${item.change}/${item.id}; no attempt started:\n${describeProblems(problems).join('\n')}`,
    );
  }
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
