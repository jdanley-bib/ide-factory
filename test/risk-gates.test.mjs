import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  validateScopedApproval,
  writeScopedApproval,
} from '../src/lib/risk-gates.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

const IMPLEMENTER = 'bc-engineer-1';
const APPROVER = 'bc-approver-9';
const HOUR_MS = 60 * 60 * 1000;

function validApproval(overrides = {}) {
  const issuance = '2026-10-21T18:00:00.000Z';
  return {
    schemaVersion: 1,
    change: 'enforce-risk-gates-and-security-stage',
    task: '1.1',
    sourceRevision: 'abc123def456',
    action: 'accept',
    approver: APPROVER,
    issuance,
    expiry: new Date(Date.parse(issuance) + 12 * HOUR_MS).toISOString(),
    policyVersion: 1,
    note: 'scoped accept',
    ...overrides,
  };
}

function approvalFiles(dir) {
  const root = path.join(dir, '.factory', 'approvals');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((name) => name !== '.gitkeep');
}

test('schema version 1 approval records required scope fields', () => {
  const input = validApproval({ action: 'complete' });
  const approval = validateScopedApproval(input, { implementerId: IMPLEMENTER });

  assert.equal(approval.schemaVersion, 1);
  assert.equal(approval.change, 'enforce-risk-gates-and-security-stage');
  assert.equal(approval.task, '1.1');
  assert.equal(approval.sourceRevision, 'abc123def456');
  assert.equal(approval.action, 'complete');
  assert.equal(approval.approver, APPROVER);
  assert.equal(approval.issuance, input.issuance);
  assert.equal(approval.expiry, input.expiry);
  assert.equal(approval.policyVersion, 1);
});

test('missing scope field is rejected without writing a file', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const before = approvalFiles(dir);
    const fields = [
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
    for (const field of fields) {
      const input = validApproval();
      delete input[field];
      assert.throws(
        () => writeScopedApproval(dir, 'missing-field', input, { implementerId: IMPLEMENTER }),
        /missing|required|scope|field/i,
        `expected rejection for missing ${field}`,
      );
    }
    assert.deepEqual(approvalFiles(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('action other than accept or complete is rejected without writing a file', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const before = approvalFiles(dir);
    assert.throws(
      () => writeScopedApproval(
        dir,
        'bad-action',
        validApproval({ action: 'reject' }),
        { implementerId: IMPLEMENTER },
      ),
      /action|accept|complete/i,
    );
    assert.deepEqual(approvalFiles(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('expiry more than 24 hours after issuance is rejected without writing a file', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const before = approvalFiles(dir);
    const issuance = '2026-10-21T18:00:00.000Z';
    assert.throws(
      () => writeScopedApproval(
        dir,
        'too-long',
        validApproval({
          issuance,
          expiry: new Date(Date.parse(issuance) + 24 * HOUR_MS + 1).toISOString(),
        }),
        { implementerId: IMPLEMENTER },
      ),
      /expir|24|lifetime|hours/i,
    );
    assert.deepEqual(approvalFiles(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('approver equal to implementer is rejected without writing a file', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const before = approvalFiles(dir);
    assert.throws(
      () => writeScopedApproval(
        dir,
        'self-approve',
        validApproval({ approver: IMPLEMENTER }),
        { implementerId: IMPLEMENTER },
      ),
      /approver|implementer/i,
    );
    assert.deepEqual(approvalFiles(dir), before);
  } finally {
    cleanup(dir);
  }
});
