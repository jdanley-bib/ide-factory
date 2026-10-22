import fs from 'node:fs';
import path from 'node:path';
import { readText, writeText } from './layout.mjs';
import {
  commandDigest,
  isSecurityPatternedCheck,
  resolveGitBinding,
  validateCheckRecord,
} from './verification-evidence.mjs';

const SUPPORTED_SCHEMA_VERSION = 1;
const DEFAULT_POLICY_VERSION = 1;
const MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;
const ALLOWED_ACTIONS = new Set(['accept', 'complete']);

const REQUIRED_FIELDS = [
  'schemaVersion',
  'change',
  'task',
  'sourceRevision',
  'action',
  'approver',
  'issuance',
  'expiry',
  'policyVersion',
];

/**
 * Validate a schema version 1 scoped approval record.
 * Rejects missing scope fields, actions other than accept/complete,
 * expiry more than 24 hours after issuance, and approver === implementer.
 *
 * @param {unknown} record
 * @param {{ implementerId?: string }} [options]
 * @returns {object}
 */
export function validateScopedApproval(record, options = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('approval must be an object');
  }

  for (const field of REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      throw new Error(`approval missing required scope field: ${field}`);
    }
  }

  if (record.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`unsupported approval schema version: ${record.schemaVersion}`);
  }

  requireNonEmptyString(record, 'change');
  requireNonEmptyString(record, 'task');
  requireNonEmptyString(record, 'sourceRevision');
  requireNonEmptyString(record, 'approver');
  requireNonEmptyString(record, 'issuance');
  requireNonEmptyString(record, 'expiry');

  if (!ALLOWED_ACTIONS.has(record.action)) {
    throw new Error('approval action must be "accept" or "complete"');
  }

  if (!Number.isInteger(record.policyVersion) || record.policyVersion <= 0) {
    throw new Error('approval policyVersion must be a positive integer');
  }

  const issuedAt = Date.parse(record.issuance);
  const expiresAt = Date.parse(record.expiry);
  if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt)) {
    throw new Error('approval issuance and expiry must be valid ISO timestamps');
  }
  if (expiresAt <= issuedAt) {
    throw new Error('approval expiry must be later than issuance');
  }
  if (expiresAt - issuedAt > MAX_LIFETIME_MS) {
    throw new Error('approval expiry must be no more than 24 hours after issuance');
  }

  const implementerId = options.implementerId;
  if (
    typeof implementerId === 'string'
    && implementerId.length > 0
    && record.approver === implementerId
  ) {
    throw new Error('approval approver must differ from the implementer');
  }

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    change: record.change,
    task: record.task,
    sourceRevision: record.sourceRevision,
    action: record.action,
    approver: record.approver,
    issuance: record.issuance,
    expiry: record.expiry,
    policyVersion: record.policyVersion,
    ...(typeof record.note === 'string' ? { note: record.note } : {}),
  };
}

/**
 * Validate then write a scoped approval JSON file under `.factory/approvals/`.
 * On validation failure, writes nothing.
 *
 * @param {string} project
 * @param {string} id
 * @param {unknown} record
 * @param {{ implementerId?: string }} [options]
 * @returns {string} path written
 */
export function writeScopedApproval(project, id, record, options = {}) {
  const approval = validateScopedApproval(record, options);
  if (!id || typeof id !== 'string') {
    throw new Error('approval id is required');
  }
  const approvalsDir = path.join(project, '.factory', 'approvals');
  const file = path.join(approvalsDir, `${id}.json`);
  writeText(file, JSON.stringify(approval, null, 2));
  return file;
}

function requireNonEmptyString(record, field) {
  if (typeof record[field] !== 'string' || record[field].length === 0) {
    throw new Error(`approval ${field} must be a non-empty string`);
  }
}

/**
 * Read profiles[verificationProfile].humanGate.
 * Missing profile or a non-boolean humanGate is treated as true (fail closed).
 *
 * @param {string} project
 * @param {string|undefined} verificationProfile
 * @returns {boolean}
 */
export function isHumanGateRequired(project, verificationProfile) {
  const profilesPath = path.join(project, '.factory', 'profiles.json');
  let profiles = {};
  if (fs.existsSync(profilesPath)) {
    try {
      profiles = JSON.parse(readText(profilesPath));
    } catch {
      profiles = {};
    }
  }
  const profile = profiles[verificationProfile];
  if (!profile || typeof profile.humanGate !== 'boolean') {
    return true;
  }
  return profile.humanGate;
}

/**
 * Whether accept/complete may proceed for this work item's verification profile.
 * When the gate is required, a scoped JSON approval must match change, task,
 * action, current clean HEAD, policy version, lifetime, and a distinct approver.
 *
 * @param {string} project
 * @param {{
 *   action: 'accept'|'complete',
 *   verificationProfile?: string,
 *   change?: string,
 *   task?: string,
 *   implementerId?: string,
 *   now?: Date|number,
 * }} scope
 * @returns {boolean}
 */
export function humanGateAllows(project, scope) {
  if (!scope || (scope.action !== 'accept' && scope.action !== 'complete')) {
    return false;
  }
  if (!isHumanGateRequired(project, scope.verificationProfile)) {
    return true;
  }
  return hasMatchingScopedApproval(project, scope);
}

/**
 * @param {string} project
 * @param {{
 *   action: 'accept'|'complete',
 *   change?: string,
 *   task?: string,
 *   implementerId?: string,
 *   now?: Date|number,
 * }} scope
 * @returns {boolean}
 */
function hasMatchingScopedApproval(project, scope) {
  if (typeof scope.change !== 'string' || scope.change.length === 0) return false;
  if (typeof scope.task !== 'string' || scope.task.length === 0) return false;

  const { sourceRevision, worktreeClean } = resolveGitBinding(project);
  if (!worktreeClean || !sourceRevision) return false;

  const policyVersion = readPolicyVersion(project);
  const nowMs = resolveNowMs(scope.now);
  const approvalsDir = path.join(project, '.factory', 'approvals');
  if (!fs.existsSync(approvalsDir)) return false;

  for (const name of fs.readdirSync(approvalsDir)) {
    if (!name.endsWith('.json')) continue;
    let record;
    try {
      record = JSON.parse(readText(path.join(approvalsDir, name)));
      validateScopedApproval(record, { implementerId: scope.implementerId });
    } catch {
      continue;
    }
    if (record.change !== scope.change) continue;
    if (record.task !== scope.task) continue;
    if (record.action !== scope.action) continue;
    if (record.sourceRevision !== sourceRevision) continue;
    if (record.policyVersion !== policyVersion) continue;
    if (
      typeof scope.implementerId === 'string'
      && scope.implementerId.length > 0
      && record.approver === scope.implementerId
    ) {
      continue;
    }
    const issuedAt = Date.parse(record.issuance);
    const expiresAt = Date.parse(record.expiry);
    if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt)) continue;
    if (nowMs < issuedAt || nowMs >= expiresAt) continue;
    return true;
  }
  return false;
}

function readPolicyVersion(project) {
  const configPath = path.join(project, '.factory', 'config.json');
  if (!fs.existsSync(configPath)) return DEFAULT_POLICY_VERSION;
  try {
    const config = JSON.parse(readText(configPath));
    const version = config?.governance?.policyVersion;
    if (Number.isInteger(version) && version > 0) return version;
  } catch {
    // fall through to default
  }
  return DEFAULT_POLICY_VERSION;
}

function resolveNowMs(now) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === 'number' && Number.isFinite(now)) return now;
  return Date.now();
}

export function requiresSecurityStage(item) {
  // verificationProfile alone does not trigger the security stage.
  if (!item?.factory) return false;
  if (item.factory.securityProfile === 'security-sensitive') return true;
  return (item.factory.checks || []).some((check) => isSecurityPatternedCheck(check));
}

/**
 * Required CLI security evidence kinds for security-stage work.
 * When the profile is security-sensitive and no check is security-patterned,
 * the required kind is threat-review.
 */
export function requiredSecurityKinds(item) {
  if (!requiresSecurityStage(item)) return [];
  const patterned = [...new Set(
    (item.factory?.checks || []).filter((check) => isSecurityPatternedCheck(check)),
  )];
  if (patterned.length > 0) return patterned;
  return ['threat-review'];
}

/**
 * Fail closed unless each required kind has a passing CLI security record
 * bound to this attempt and the current clean HEAD. Red and unverified
 * caller-written rows do not count.
 */
export function assertPassingCliSecurityEvidence(project, attempt, item) {
  const required = requiredSecurityKinds(item);
  if (required.length === 0) return;

  const registryPath = path.join(project, '.factory', 'checks.json');
  if (!fs.existsSync(registryPath)) {
    throw new Error('security evidence requires check registry: .factory/checks.json');
  }
  let rawRegistry;
  try {
    rawRegistry = JSON.parse(readText(registryPath));
  } catch {
    throw new Error('invalid check registry JSON');
  }
  const rawChecks = rawRegistry?.checks && typeof rawRegistry.checks === 'object'
    && !Array.isArray(rawRegistry.checks)
    ? rawRegistry.checks
    : {};

  const { sourceRevision: headSha, worktreeClean } = resolveGitBinding(project);
  if (!worktreeClean || !headSha) {
    throw new Error('security evidence requires a clean git worktree at the current HEAD');
  }

  const security = attempt.evidence?.security || [];
  const red = attempt.evidence?.red;

  for (const kind of required) {
    const rawEntry = rawChecks[kind];
    if (rawEntry === undefined) {
      throw new Error(`Missing passing CLI security evidence for: ${kind}`);
    }
    if (!Array.isArray(rawEntry?.argv) || rawEntry.argv.length === 0) {
      throw new Error(`Security check kind has no argv mapping: ${kind}`);
    }
    if (!rawEntry.argv.every((part) => typeof part === 'string' && part.length > 0)) {
      throw new Error(`Security check kind has no argv mapping: ${kind}`);
    }
    const registryDigest = commandDigest(rawEntry.argv);

    const candidates = security.filter((entry) => entry.kind === kind || entry.check === kind);
    let passed = false;
    let failureReason = null;
    for (const record of candidates) {
      if (red && recordsMatch(red, record)) {
        failureReason = failureReason || `red result is not security evidence for: ${kind}`;
        continue;
      }
      try {
        validateCheckRecord(record);
      } catch {
        continue;
      }
      const reason = cliSecurityFailureReason(record, {
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
      throw new Error(failureReason || `Missing passing CLI security evidence for: ${kind}`);
    }
  }
}

function cliSecurityFailureReason(record, { attemptId, registryDigest, headSha }) {
  if (record.issuer !== 'cli') {
    return 'security evidence requires issuer cli';
  }
  if (record.exitCode !== 0) {
    return `security attestation exit code must be 0 for: ${record.kind || 'check'}`;
  }
  if (record.timedOut !== false) {
    return 'security attestation must not be timedOut';
  }
  if (record.passed !== true) {
    return `security attestation must be a pass for: ${record.kind || 'check'}`;
  }
  if (record.commandDigest !== registryDigest) {
    return 'security attestation commandDigest does not match current registry argv';
  }
  if (record.attemptId !== attemptId) {
    return 'security attestation attemptId does not match attempt';
  }
  if (record.sourceRevision !== headSha) {
    return 'security attestation sourceRevision does not match current clean HEAD';
  }
  return null;
}

function recordsMatch(a, b) {
  if (!a || !b) return false;
  return a.kind === b.kind
    && a.attemptId === b.attemptId
    && a.commandDigest === b.commandDigest
    && a.exitCode === b.exitCode
    && a.logDigest === b.logDigest
    && a.startedAt === b.startedAt
    && a.finishedAt === b.finishedAt;
}
