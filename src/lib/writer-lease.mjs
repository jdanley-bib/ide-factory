import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const WRITER_LEASE_SCHEMA_VERSION = 1;
export const WRITER_LEASE_TTL_MS = 5 * 60 * 1000;
export const LEASE_HELD = 'LEASE_HELD';

const READ_ONLY = new Set(['status', 'doctor', 'help', 'attempt show']);
const MUTATING = new Set([
  'init',
  'upgrade',
  'sync-tasks',
  'next',
  'run',
  'attempt start',
  'attempt transition',
  'verify run',
  'verify import',
  'complete',
  'approve',
  'reject',
  'lockout create',
  'lockout resolve',
  'resume',
]);

/**
 * Absolute path to the project writer lease directory.
 * @param {string} project
 * @returns {string}
 */
export function writerLeaseDir(project) {
  return path.join(project, '.factory', 'orchestration', 'writer.lease');
}

/**
 * @param {string} command
 * @returns {boolean}
 */
export function isReadOnlyCommand(command) {
  return READ_ONLY.has(normalizeCommand(command));
}

/**
 * @param {string} command
 * @returns {boolean}
 */
export function isMutatingCommand(command) {
  return MUTATING.has(normalizeCommand(command));
}

/**
 * @param {string} project
 * @returns {object|null}
 */
export function readWriterLease(project) {
  const file = path.join(writerLeaseDir(project), 'owner.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Atomically acquire the schema version 1 writer lease.
 * @param {string} project
 * @param {string} command
 * @param {{ now?: () => number, leaseId?: string }} [options]
 * @returns {object}
 */
export function acquireWriterLease(project, command, options = {}) {
  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();
  const orchestration = path.join(project, '.factory', 'orchestration');
  fs.mkdirSync(orchestration, { recursive: true });

  const leaseDir = writerLeaseDir(project);
  try {
    fs.mkdirSync(leaseDir);
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      const owner = safeReadOwner(leaseDir);
      throw leaseHeldError(owner);
    }
    throw error;
  }

  const acquiredAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + WRITER_LEASE_TTL_MS).toISOString();
  const owner = {
    schemaVersion: WRITER_LEASE_SCHEMA_VERSION,
    leaseId: options.leaseId || randomUUID(),
    command: normalizeCommand(command),
    pid: process.pid,
    hostname: os.hostname(),
    acquiredAt,
    expiresAt,
  };
  fs.writeFileSync(
    path.join(leaseDir, 'owner.json'),
    `${JSON.stringify(owner, null, 2)}\n`,
  );
  return owner;
}

/**
 * Remove the lease directory only when the stored lease id still matches.
 * @param {string} project
 * @param {string} leaseId
 * @returns {boolean} true when removed
 */
export function releaseWriterLease(project, leaseId) {
  if (typeof leaseId !== 'string' || leaseId.length === 0) return false;
  const leaseDir = writerLeaseDir(project);
  const owner = safeReadOwner(leaseDir);
  if (!owner || owner.leaseId !== leaseId) return false;
  fs.rmSync(leaseDir, { recursive: true, force: true });
  return true;
}

/**
 * Acquire the writer lease, run fn, and release the matching lease id in finally.
 * @template T
 * @param {string} project
 * @param {string} command
 * @param {(lease: object) => T|Promise<T>} fn
 * @param {{ now?: () => number, leaseId?: string }} [options]
 * @returns {Promise<T>}
 */
export async function withWriterLease(project, command, fn, options = {}) {
  const lease = acquireWriterLease(project, command, options);
  try {
    return await fn(lease);
  } finally {
    releaseWriterLease(project, lease.leaseId);
  }
}

/**
 * Run a read-only command without acquiring or removing the writer lease.
 * @template T
 * @param {string} project
 * @param {string} command
 * @param {() => T|Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withReadOnlyCommand(project, command, fn) {
  if (!isReadOnlyCommand(command)) {
    throw new Error(`command is not read-only: ${command}`);
  }
  return fn();
}

function normalizeCommand(command) {
  return String(command || '').trim().replace(/\s+/g, ' ');
}

function safeReadOwner(leaseDir) {
  const file = path.join(leaseDir, 'owner.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function leaseHeldError(owner) {
  const error = new Error(
    owner?.leaseId
      ? `writer lease held (leaseId=${owner.leaseId}, command=${owner.command || 'unknown'})`
      : 'writer lease held',
  );
  error.code = LEASE_HELD;
  error.owner = owner;
  return error;
}
