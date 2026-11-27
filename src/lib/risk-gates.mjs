import fs from 'node:fs';
import path from 'node:path';
import {
  actionRow,
  DEFAULT_STANDING_MAX_HOURS,
  isExternalEffectAction,
  MAX_STANDING_MAX_HOURS,
  TARGET_FORMAT,
  unknownActionMessage,
} from './approval-actions.mjs';
import { readText, writeText } from './layout.mjs';
import { readPolicyVersion } from './principal.mjs';
import {
  commandDigest,
  gitSnapshot,
  isSecurityPatternedCheck,
  recordValidity,
  resolveGitBinding,
  validateCheckRecord,
} from './verification-evidence.mjs';

const SUPPORTED_SCHEMA_VERSION = 1;
const MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;

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
 * Maximum lifetime of a standing authorization, from governance.standingMaxHours in
 * .factory/config.json. An absent or out-of-range value falls back to the default.
 */
export function standingMaxMs(project) {
  let hours = DEFAULT_STANDING_MAX_HOURS;
  try {
    const config = JSON.parse(readText(path.join(project, '.factory', 'config.json')));
    const value = config?.governance?.standingMaxHours;
    if (Number.isInteger(value) && value >= 1 && value <= MAX_STANDING_MAX_HOURS) hours = value;
  } catch {
    // no readable config: the default applies
  }
  return hours * 60 * 60 * 1000;
}

/**
 * Validate a scoped approval record: schema version 1 or 2 (task and revision bound, with a target
 * for external-effect actions) or schema version 3 (standing, external-effect only).
 * Rejects missing scope fields, unknown actions, lifetimes above the maximum, and approver === implementer.
 *
 * @param {unknown} record
 * @param {{ implementerId?: string, standingMaxMs?: number }} [options]
 * @returns {object}
 */
export function validateScopedApproval(record, options = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('approval must be an object');
  }
  if (record.schemaVersion === 3) return validateStandingApproval(record, options);

  for (const field of REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      throw new Error(`approval missing required scope field: ${field}`);
    }
  }

  if (record.schemaVersion !== 1 && record.schemaVersion !== 2) {
    throw new Error(`unsupported approval schema version: ${record.schemaVersion}`);
  }

  requireNonEmptyString(record, 'change');
  requireNonEmptyString(record, 'task');
  requireNonEmptyString(record, 'sourceRevision');
  requireNonEmptyString(record, 'approver');
  requireNonEmptyString(record, 'issuance');
  requireNonEmptyString(record, 'expiry');

  if (!actionRow(record.action)) {
    throw new Error(`approval ${unknownActionMessage(record.action)}`);
  }
  if (isExternalEffectAction(record.action)) {
    if (typeof record.target !== 'string' || !TARGET_FORMAT.test(record.target)) {
      throw new Error(`approval for ${record.action} requires a valid target`);
    }
  }

  if (!Number.isInteger(record.policyVersion) || record.policyVersion <= 0) {
    throw new Error('approval policyVersion must be a positive integer');
  }

  checkLifetime(record, MAX_LIFETIME_MS, '24 hours');

  const implementerId = options.implementerId;
  if (
    typeof implementerId === 'string'
    && implementerId.length > 0
    && record.approver === implementerId
  ) {
    throw new Error('approval approver must differ from the implementer');
  }

  if (record.schemaVersion === 2) validatePrincipal(record);

  return {
    schemaVersion: record.schemaVersion,
    change: record.change,
    task: record.task,
    sourceRevision: record.sourceRevision,
    action: record.action,
    ...(isExternalEffectAction(record.action) ? { target: record.target } : {}),
    approver: record.approver,
    issuance: record.issuance,
    expiry: record.expiry,
    policyVersion: record.policyVersion,
    ...(record.schemaVersion === 2 ? { principal: { ...record.principal } } : {}),
    ...(typeof record.note === 'string' ? { note: record.note } : {}),
  };
}

function checkLifetime(record, maxMs, label) {
  const issuedAt = Date.parse(record.issuance);
  const expiresAt = Date.parse(record.expiry);
  if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt)) {
    throw new Error('approval issuance and expiry must be valid ISO timestamps');
  }
  if (expiresAt <= issuedAt) {
    throw new Error('approval expiry must be later than issuance');
  }
  if (expiresAt - issuedAt > maxMs) {
    throw new Error(`approval expiry must be no more than ${label} after issuance`);
  }
}

function validatePrincipal(record) {
  const principal = record.principal;
  if (!principal || typeof principal !== 'object' || Array.isArray(principal)) {
    throw new Error('approval principal is required');
  }
  for (const field of ['provider', 'subject', 'issuer', 'verifiedAt']) {
    if (typeof principal[field] !== 'string' || principal[field].length === 0) {
      throw new Error(`approval principal ${field} must be a non-empty string`);
    }
  }
  if (record.approver !== principal.subject) {
    throw new Error('approval approver must equal the verified principal subject');
  }
}

function validateStandingApproval(record, options) {
  for (const field of ['change', 'action', 'target', 'approver', 'issuance', 'expiry']) {
    if (typeof record[field] !== 'string' || record[field].length === 0) {
      throw new Error(`standing authorization missing required field: ${field}`);
    }
  }
  if (record.standing !== true) throw new Error('standing authorization must set standing: true');
  if (!actionRow(record.action)) throw new Error(`standing authorization ${unknownActionMessage(record.action)}`);
  if (!isExternalEffectAction(record.action)) {
    throw new Error(`a standing authorization applies only to external-effect actions, not ${record.action}`);
  }
  if (!TARGET_FORMAT.test(record.target)) throw new Error('standing authorization requires a valid target');
  if (!Number.isInteger(record.policyVersion) || record.policyVersion < 2) {
    throw new Error('a standing authorization needs governance policy version 2');
  }
  if (record.task !== undefined || record.sourceRevision !== undefined) {
    throw new Error('a standing authorization is not bound to a task or revision');
  }
  const maxMs = options.standingMaxMs ?? DEFAULT_STANDING_MAX_HOURS * 60 * 60 * 1000;
  checkLifetime(record, maxMs, `${Math.round(maxMs / 3_600_000)} hours`);
  validatePrincipal(record);
  return {
    schemaVersion: 3,
    standing: true,
    change: record.change,
    action: record.action,
    target: record.target,
    approver: record.approver,
    issuance: record.issuance,
    expiry: record.expiry,
    policyVersion: record.policyVersion,
    principal: { ...record.principal },
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
  const approval = validateScopedApproval(record, {
    standingMaxMs: standingMaxMs(project),
    ...options,
  });
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
 * Wrapper over authorizes() for the two gate actions.
 */
export function humanGateAllows(project, scope) {
  if (!scope || (scope.action !== 'accept' && scope.action !== 'complete')) {
    return false;
  }
  return authorizes(project, scope).authorized;
}

const REASON_RANK = ['revoked', 'expired', 'policy-mismatch', 'principal-required', 'same-approver', 'revision-mismatch'];

function revokedIds(project) {
  const dir = path.join(project, '.factory', 'approvals');
  const ids = new Set();
  if (!fs.existsSync(dir)) return ids;
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.revoked.json')) ids.add(name.slice(0, -'.revoked.json'.length));
  }
  return ids;
}

/**
 * Decide whether an action is authorized now. Read-only.
 *
 * @param {string} project
 * @param {{
 *   action: string,
 *   change?: string,
 *   task?: string,
 *   target?: string,
 *   verificationProfile?: string,
 *   implementerId?: string,
 *   now?: Date|number,
 * }} scope
 * @returns {{ authorized: boolean, approvalId?: string, reason?: string, waived?: boolean }}
 */
export function authorizes(project, scope) {
  const row = actionRow(scope?.action);
  if (!row) return { authorized: false, reason: 'no-approval' };
  if (row.waivableByProfile && !isHumanGateRequired(project, scope.verificationProfile)) {
    return { authorized: true, waived: true };
  }
  if (typeof scope.change !== 'string' || scope.change.length === 0) {
    return { authorized: false, reason: 'no-approval' };
  }
  const external = row.kind === 'external-effect';
  if (!external && (typeof scope.task !== 'string' || scope.task.length === 0)) {
    return { authorized: false, reason: 'no-approval' };
  }
  if (external && (typeof scope.target !== 'string' || scope.target.length === 0)) {
    return { authorized: false, reason: 'no-approval' };
  }

  const { sourceRevision, worktreeClean } = resolveGitBinding(project);
  const cleanHead = Boolean(worktreeClean && sourceRevision);
  const policyVersion = readPolicyVersion(project);
  const nowMs = resolveNowMs(scope.now);
  const dir = path.join(project, '.factory', 'approvals');
  if (!fs.existsSync(dir)) {
    return { authorized: false, reason: !external && !cleanHead ? 'dirty-worktree' : 'no-approval' };
  }
  const revoked = revokedIds(project);
  const maxStanding = standingMaxMs(project);

  let best = null;
  let targetMismatch = false;
  let sawTaskBound = false;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json') || name.endsWith('.revoked.json')) continue;
    const id = name.slice(0, -'.json'.length);
    let record;
    try {
      record = JSON.parse(readText(path.join(dir, name)));
      validateScopedApproval(record, { standingMaxMs: maxStanding });
    } catch {
      continue;
    }
    if (record.change !== scope.change || record.action !== scope.action) continue;
    const standing = record.schemaVersion === 3;
    if (!standing && record.task !== scope.task) continue;
    if (external && record.target !== scope.target) {
      targetMismatch = true;
      continue;
    }
    if (!standing) sawTaskBound = true;

    let reason = null;
    const issuedAt = Date.parse(record.issuance);
    const expiresAt = Date.parse(record.expiry);
    if (revoked.has(id)) reason = 'revoked';
    else if (nowMs < issuedAt || nowMs >= expiresAt) reason = 'expired';
    else if (record.policyVersion !== policyVersion) reason = 'policy-mismatch';
    else if (policyVersion >= 2 && (record.schemaVersion < 2 || record.principal?.subject !== record.approver)) {
      reason = 'principal-required';
    } else if (
      typeof scope.implementerId === 'string'
      && scope.implementerId.length > 0
      && record.approver === scope.implementerId
    ) reason = 'same-approver';
    else if (!standing && cleanHead && record.sourceRevision !== sourceRevision) reason = 'revision-mismatch';
    if (!reason && !standing && !cleanHead) continue;
    if (!reason) return { authorized: true, approvalId: id };
    if (!best || REASON_RANK.indexOf(reason) < REASON_RANK.indexOf(best)) best = reason;
  }

  if (!cleanHead && (!external || sawTaskBound)) return { authorized: false, reason: 'dirty-worktree' };
  if (best) return { authorized: false, reason: best };
  if (targetMismatch) return { authorized: false, reason: 'target-mismatch' };
  return { authorized: false, reason: 'no-approval' };
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

  const snapshot = gitSnapshot(project);
  if (!snapshot.worktreeClean || !snapshot.head) {
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
      const reason = securityRecordReason(record, {
        project,
        attemptId: attempt.id,
        registryDigest,
        argv: rawEntry.argv,
        cwdPolicy: rawEntry.cwdPolicy,
        timeoutMs: rawEntry.timeoutMs,
        artifacts: rawEntry.artifacts || [],
        snapshot,
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

function securityRecordReason(record, context) {
  if (record.issuer !== 'cli') return 'security evidence requires issuer cli';
  const verdict = recordValidity(record, {
    project: context.project,
    attemptId: context.attemptId,
    entry: {
      argv: context.argv,
      commandDigest: context.registryDigest,
      cwdPolicy: context.cwdPolicy,
      timeoutMs: context.timeoutMs,
      artifacts: context.artifacts,
    },
    snapshot: context.snapshot,
  });
  return verdict.valid ? null : verdict.reason;
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
