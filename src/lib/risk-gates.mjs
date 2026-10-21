import fs from 'node:fs';
import path from 'node:path';
import { readText, writeText } from './layout.mjs';

const SUPPORTED_SCHEMA_VERSION = 1;
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
 * Fail-closed for 2.1: when the gate is required, no approval authorizes yet
 * (matching success/mismatch matrix is task 2.2).
 *
 * @param {string} project
 * @param {{ action: 'accept'|'complete', verificationProfile?: string }} scope
 * @returns {boolean}
 */
export function humanGateAllows(project, scope) {
  if (!scope || (scope.action !== 'accept' && scope.action !== 'complete')) {
    return false;
  }
  if (!isHumanGateRequired(project, scope.verificationProfile)) {
    return true;
  }
  return false;
}
