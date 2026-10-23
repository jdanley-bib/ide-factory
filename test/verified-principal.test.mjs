import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { completeWorkItem } from '../src/lib/complete.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

const HOUR_MS = 60 * 60 * 1000;

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
  const porcelain = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8', shell: false });
  assert.equal(porcelain.status, 0, porcelain.stderr || porcelain.stdout);
  if (porcelain.stdout.trim().length > 0) git(dir, ['commit', '-m', 'checkpoint']);
  return git(dir, ['rev-parse', 'HEAD']);
}

function setPolicy(dir, version, verifier) {
  const configPath = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.governance.policyVersion = version;
  if (verifier) config.governance.principalVerifier = verifier;
  else delete config.governance.principalVerifier;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function writeVerifier(dir) {
  fs.writeFileSync(path.join(dir, 'verify-principal.mjs'), [
    'const provider = process.env.FACTORY_PRINCIPAL_PROVIDER;',
    'const subject = process.env.FACTORY_PRINCIPAL_SUBJECT;',
    'if (subject !== "ada") process.exit(2);',
    'process.stdout.write(JSON.stringify({ provider, subject, issuer: "local-test" }));',
    '',
  ].join('\n'));
  return {
    argv: [process.execPath, 'verify-principal.mjs'],
    timeoutMs: 5000,
    provider: 'local',
  };
}

function approveArgs(note) {
  return [
    'approve', 'gate-1', '--note', note,
    '--change', 'demo', '--task', '1.1', '--action', 'accept',
    '--approver', 'ada',
    '--principal-provider', 'local',
    '--principal-subject', 'ada',
    '--expiry', new Date(Date.now() + HOUR_MS).toISOString(),
  ];
}

test('policy version 2 refuses an unconfirmed principal and stores a confirmed one', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    setPolicy(dir, 2);
    ensureCleanGitCommit(dir);
    const before = fs.readFileSync(path.join(dir, '.factory/decisions.md'), 'utf8');
    const refused = await idefactory(dir, approveArgs('no verifier'));
    assert.notEqual(refused.code, 0);
    assert.equal(fs.existsSync(path.join(dir, '.factory/approvals/gate-1.json')), false);
    assert.equal(fs.readFileSync(path.join(dir, '.factory/decisions.md'), 'utf8'), before);

    const verifier = writeVerifier(dir);
    setPolicy(dir, 2, verifier);
    ensureCleanGitCommit(dir);
    const accepted = await idefactory(dir, approveArgs('confirmed'));
    assert.equal(accepted.code, 0, accepted.err);
    const record = JSON.parse(fs.readFileSync(path.join(dir, '.factory/approvals/gate-1.json'), 'utf8'));
    assert.equal(record.schemaVersion, 2);
    assert.equal(record.approver, 'ada');
    assert.equal(record.principal.provider, 'local');
    assert.equal(record.principal.subject, 'ada');
    assert.equal(record.principal.issuer, 'local-test');
    assert.equal(typeof record.principal.verifiedAt, 'string');
  } finally {
    cleanup(dir);
  }
});

test('policy version 1 still authorizes schema 1 and policy version 2 does not', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const profiles = JSON.parse(fs.readFileSync(path.join(dir, '.factory/profiles.json'), 'utf8'));
    profiles.gated = { checks: ['unit'], humanGate: true };
    fs.writeFileSync(path.join(dir, '.factory/profiles.json'), JSON.stringify(profiles, null, 2));
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), '- [ ] 1.1 Item\n');
    assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
    const itemPath = path.join(dir, '.factory/work/items/demo--1.1.json');
    const item = JSON.parse(fs.readFileSync(itemPath, 'utf8'));
    item.factory.verificationProfile = 'gated';
    item.factory.checks = ['unit'];
    fs.writeFileSync(itemPath, JSON.stringify(item, null, 2));
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const attempt = JSON.parse(started.out);
    const attemptPath = path.join(dir, `.factory/attempts/${attempt.id}.json`);
    const stored = JSON.parse(fs.readFileSync(attemptPath, 'utf8'));
    stored.state = 'accepted';
    stored.implementerId = 'engineer-1';
    stored.reviewerId = 'reviewer-1';
    fs.writeFileSync(attemptPath, JSON.stringify(stored, null, 2));
    setPolicy(dir, 1);
    fs.writeFileSync(path.join(dir, '.gitignore'), '.factory/approvals/\n');
    const head = ensureCleanGitCommit(dir);
    const approval = {
      schemaVersion: 1,
      change: 'demo',
      task: '1.1',
      sourceRevision: head,
      action: 'complete',
      approver: 'reviewer-1',
      issuance: new Date().toISOString(),
      expiry: new Date(Date.now() + HOUR_MS).toISOString(),
      policyVersion: 1,
    };
    fs.writeFileSync(path.join(dir, '.factory/approvals/old.json'), JSON.stringify(approval, null, 2));
    assert.throws(
      () => completeWorkItem(dir, 'demo', '1.1', attempt.id),
      /evidence|check|verification/i,
    );

    setPolicy(dir, 2);
    ensureCleanGitCommit(dir);
    approval.policyVersion = 2;
    approval.sourceRevision = git(dir, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(dir, '.factory/approvals/old.json'), JSON.stringify(approval, null, 2));
    assert.throws(
      () => completeWorkItem(dir, 'demo', '1.1', attempt.id),
      /approval|principal|humanGate|scoped/i,
    );
  } finally {
    cleanup(dir);
  }
});

test('policy version 2 rejects an unverified reviewer and resolver but keeps a local implementer', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const verifier = writeVerifier(dir);
    setPolicy(dir, 2, verifier);
    const created = await idefactory(dir, [
      'lockout', 'create', '--agent', 'engineer', '--reviewer', 'reviewer', '--reason', 'block',
    ]);
    assert.equal(created.code, 0, created.err);
    const id = created.out.match(/[0-9a-f-]{36}/i)[0];
    const unresolved = await idefactory(dir, [
      'lockout', 'resolve', id, '--resolver', 'bob', '--reason', 'clear',
    ]);
    assert.notEqual(unresolved.code, 0);
    assert.match(unresolved.err, /principal|verified/i);
    const resolved = await idefactory(dir, [
      'lockout', 'resolve', id, '--resolver', 'ada', '--reason', 'clear',
    ]);
    assert.equal(resolved.code, 0, resolved.err);

    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), '- [ ] 1.1 Item\n');
    assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const attempt = JSON.parse(started.out);
    const attemptPath = path.join(dir, `.factory/attempts/${attempt.id}.json`);
    const stored = JSON.parse(fs.readFileSync(attemptPath, 'utf8'));
    stored.state = 'accepted';
    stored.implementerId = 'engineer-1';
    stored.reviewerId = 'bob';
    fs.writeFileSync(attemptPath, JSON.stringify(stored, null, 2));
    ensureCleanGitCommit(dir);
    assert.throws(
      () => completeWorkItem(dir, 'demo', '1.1', attempt.id),
      /principal|verified/i,
    );
    stored.reviewerId = 'ada';
    fs.writeFileSync(attemptPath, JSON.stringify(stored, null, 2));
    assert.throws(
      () => completeWorkItem(dir, 'demo', '1.1', attempt.id),
      /evidence|check|verification/i,
    );
  } finally {
    cleanup(dir);
  }
});
