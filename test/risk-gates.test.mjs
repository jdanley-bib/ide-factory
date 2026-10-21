import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'idefactory-test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'idefactory-test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function ensureCleanGitCommit(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    git(dir, ['init']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'idefactory-test']);
  }
  git(dir, ['add', '-A']);
  const porcelain = spawnSync('git', ['status', '--porcelain'], {
    cwd: dir,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(porcelain.status, 0, porcelain.stderr || porcelain.stdout);
  if (porcelain.stdout.trim().length > 0) {
    git(dir, ['commit', '-m', 'checkpoint']);
  }
  return git(dir, ['rev-parse', 'HEAD']);
}

function scopeFlags(overrides = {}) {
  const expiry = new Date(Date.now() + 12 * HOUR_MS).toISOString();
  return {
    change: 'enforce-risk-gates-and-security-stage',
    task: '1.2',
    action: 'accept',
    approver: APPROVER,
    expiry,
    ...overrides,
  };
}

function approveArgs(id, note, scope) {
  const args = ['approve', id, '--note', note];
  for (const [key, value] of Object.entries(scope)) {
    if (value === undefined) continue;
    args.push(`--${key}`, String(value));
  }
  return args;
}

function decisionsText(dir) {
  return fs.readFileSync(path.join(dir, '.factory', 'decisions.md'), 'utf8');
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

test('approve with id, note, and every scope field writes JSON and appends decisions', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const head = ensureCleanGitCommit(dir);
    const beforeDecisions = decisionsText(dir);
    const id = 'scoped-accept-ok';
    const note = 'human accepts this step';
    const scope = scopeFlags();
    const result = await idefactory(dir, approveArgs(id, note, scope));
    assert.equal(result.code, 0, result.err + result.out);

    const jsonPath = path.join(dir, '.factory', 'approvals', `${id}.json`);
    assert.equal(fs.existsSync(jsonPath), true, 'expected JSON approval file');
    const written = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.equal(written.note, note);
    assert.equal(written.change, scope.change);
    assert.equal(written.task, scope.task);
    assert.equal(written.action, scope.action);
    assert.equal(written.approver, scope.approver);
    assert.equal(written.expiry, scope.expiry);
    assert.equal(written.sourceRevision, head);
    assert.equal(written.schemaVersion, 1);
    assert.equal(written.policyVersion, 1);
    assert.equal(typeof written.issuance, 'string');
    assert.match(decisionsText(dir), new RegExp(id));
    assert.notEqual(decisionsText(dir), beforeDecisions);
  } finally {
    cleanup(dir);
  }
});

test('approve with id and note but a scope field omitted writes nothing', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    ensureCleanGitCommit(dir);
    const beforeFiles = approvalFiles(dir);
    const beforeDecisions = decisionsText(dir);
    const id = 'incomplete-scope';
    const scope = scopeFlags();
    delete scope.task;
    const result = await idefactory(dir, approveArgs(id, 'note only incomplete', scope));
    assert.notEqual(result.code, 0);
    assert.deepEqual(approvalFiles(dir), beforeFiles);
    assert.equal(decisionsText(dir), beforeDecisions);
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'approvals', `${id}.json`)), false);
  } finally {
    cleanup(dir);
  }
});

test('approve on a dirty non-run-state tree writes nothing', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    ensureCleanGitCommit(dir);
    fs.writeFileSync(path.join(dir, 'dirty.txt'), 'uncommitted source\n');
    const beforeFiles = approvalFiles(dir);
    const beforeDecisions = decisionsText(dir);
    const id = 'dirty-tree';
    const result = await idefactory(dir, approveArgs(id, 'should refuse', scopeFlags()));
    assert.notEqual(result.code, 0);
    assert.deepEqual(approvalFiles(dir), beforeFiles);
    assert.equal(decisionsText(dir), beforeDecisions);
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'approvals', `${id}.json`)), false);
  } finally {
    cleanup(dir);
  }
});
