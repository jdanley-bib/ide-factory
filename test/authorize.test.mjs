import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { actionIds, APPROVAL_ACTIONS, AUTHORIZATION_REASONS } from '../src/lib/approval-actions.mjs';
import { acquireWriterLease, isMutatingCommand, isReadOnlyCommand } from '../src/lib/writer-lease.mjs';
import { authorizes, standingMaxMs, validateScopedApproval, writeScopedApproval } from '../src/lib/risk-gates.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

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

function commitAll(dir, message = 'checkpoint') {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    git(dir, ['init']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'idefactory-test']);
  }
  git(dir, ['add', '-A']);
  if (git(dir, ['status', '--porcelain']).length > 0) git(dir, ['commit', '-m', message]);
  return git(dir, ['rev-parse', 'HEAD']);
}

function setGovernance(dir, patch) {
  const configPath = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.governance = { ...config.governance, ...patch };
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
  return { argv: [process.execPath, 'verify-principal.mjs'], timeoutMs: 5000, provider: 'local' };
}

function record(dir, overrides = {}) {
  const issuance = new Date(Date.now() - HOUR_MS).toISOString();
  return {
    schemaVersion: 1,
    change: 'demo',
    task: '1.1',
    sourceRevision: git(dir, ['rev-parse', 'HEAD']),
    action: 'accept',
    approver: 'human-1',
    issuance,
    expiry: new Date(Date.parse(issuance) + 12 * HOUR_MS).toISOString(),
    policyVersion: 1,
    ...overrides,
  };
}

async function project() {
  const dir = tempProject();
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  commitAll(dir);
  return dir;
}

function authorizeJson(dir, flags) {
  return idefactory(dir, ['authorize', ...flags, '--json']).then((result) => {
    assert.equal(result.code, 0, result.err);
    return JSON.parse(result.out);
  });
}

function treeDigest(dir) {
  const rows = [];
  const walk = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      if (name === '.git') continue;
      const full = path.join(current, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else rows.push(`${path.relative(dir, full)}:${fs.readFileSync(full, 'utf8').length}:${fs.statSync(full).mtimeMs}`);
    }
  };
  walk(dir);
  return rows.join('\n');
}

test('the action table has the six actions and the closed reason set', () => {
  assert.deepEqual(actionIds(), ['accept', 'complete', 'publish', 'deploy', 'spend', 'account']);
  assert.deepEqual(APPROVAL_ACTIONS.filter((row) => row.waivableByProfile).map((row) => row.id), ['accept', 'complete']);
  assert.deepEqual([...AUTHORIZATION_REASONS].sort(), [
    'dirty-worktree', 'expired', 'no-approval', 'policy-mismatch', 'principal-required',
    'revision-mismatch', 'revoked', 'same-approver', 'target-mismatch',
  ]);
});

test('authorize reports no-approval with the filled-in approve command and writes nothing', async () => {
  const dir = await project();
  try {
    const before = treeDigest(dir);
    const doc = await authorizeJson(dir, ['--change', 'demo', '--action', 'deploy', '--target', 'staging']);
    assert.equal(doc.authorized, false);
    assert.equal(doc.reason, 'no-approval');
    assert.match(doc.approveCommand, /--change demo --action deploy --target staging/);
    const text = await idefactory(dir, ['authorize', '--change', 'demo', '--task', '1.1', '--action', 'accept']);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /not authorized/);
    assert.match(text.out, /reason: no-approval/);
    assert.equal(treeDigest(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('authorize rejects a malformed request with a non-zero exit', async () => {
  const dir = await project();
  try {
    for (const args of [
      ['authorize', '--action', 'accept', '--task', '1.1'],
      ['authorize', '--change', 'demo', '--action', 'launch', '--target', 'x'],
      ['authorize', '--change', 'demo', '--action', 'deploy'],
      ['authorize', '--change', 'demo', '--action', 'accept'],
      ['authorize', '--change', 'demo', '--action', 'accept', '--task', '1.1', '--target', 'x'],
    ]) {
      const result = await idefactory(dir, args);
      assert.notEqual(result.code, 0, args.join(' '));
    }
    const unknown = await idefactory(dir, ['authorize', '--change', 'demo', '--action', 'launch', '--target', 'x']);
    assert.match(unknown.err, /valid actions: accept, complete, publish, deploy, spend, account/);
  } finally {
    cleanup(dir);
  }
});

test('authorize names the approval and each reason from the closed set', async () => {
  const dir = await project();
  try {
    const flags = ['--change', 'demo', '--task', '1.1', '--action', 'accept'];
    writeScopedApproval(dir, 'good', record(dir));
    let doc = await authorizeJson(dir, flags);
    assert.deepEqual([doc.authorized, doc.approvalId], [true, 'good']);

    doc = await authorizeJson(dir, [...flags, '--implementer', 'human-1']);
    assert.equal(doc.reason, 'same-approver');

    fs.writeFileSync(path.join(dir, 'dirty.txt'), 'x');
    doc = await authorizeJson(dir, flags);
    assert.equal(doc.reason, 'dirty-worktree');
    fs.unlinkSync(path.join(dir, 'dirty.txt'));

    fs.writeFileSync(path.join(dir, 'next.txt'), 'x');
    commitAll(dir, 'move head');
    doc = await authorizeJson(dir, flags);
    assert.equal(doc.reason, 'revision-mismatch');

    fs.unlinkSync(path.join(dir, '.factory/approvals/good.json'));
    writeScopedApproval(dir, 'old', record(dir, {
      issuance: new Date(Date.now() - 30 * HOUR_MS).toISOString(),
      expiry: new Date(Date.now() - 20 * HOUR_MS).toISOString(),
    }));
    doc = await authorizeJson(dir, flags);
    assert.equal(doc.reason, 'expired');

    fs.unlinkSync(path.join(dir, '.factory/approvals/old.json'));
    writeScopedApproval(dir, 'pol', record(dir, { policyVersion: 3 }));
    doc = await authorizeJson(dir, flags);
    assert.equal(doc.reason, 'policy-mismatch');
  } finally {
    cleanup(dir);
  }
});

test('policy version 2 reports principal-required for an approval without a verified principal', async () => {
  const dir = await project();
  try {
    setGovernance(dir, { policyVersion: 2 });
    commitAll(dir);
    writeScopedApproval(dir, 'v1', record(dir, { policyVersion: 2 }));
    const doc = await authorizeJson(dir, ['--change', 'demo', '--task', '1.1', '--action', 'accept']);
    assert.equal(doc.reason, 'principal-required');
  } finally {
    cleanup(dir);
  }
});

test('an external-effect approval binds to the target and ignores a false humanGate', async () => {
  const dir = await project();
  try {
    const profiles = JSON.parse(fs.readFileSync(path.join(dir, '.factory/profiles.json'), 'utf8'));
    profiles.relaxed = { checks: [], humanGate: false };
    fs.writeFileSync(path.join(dir, '.factory/profiles.json'), JSON.stringify(profiles, null, 2));
    commitAll(dir);
    writeScopedApproval(dir, 'dep', record(dir, { action: 'deploy', target: 'staging' }));

    assert.equal(authorizes(dir, { action: 'deploy', change: 'demo', task: '1.1', target: 'staging', verificationProfile: 'relaxed' }).approvalId, 'dep');
    const other = authorizes(dir, { action: 'deploy', change: 'demo', task: '1.1', target: 'production', verificationProfile: 'relaxed' });
    assert.deepEqual([other.authorized, other.reason], [false, 'target-mismatch']);
    const spend = authorizes(dir, { action: 'spend', change: 'demo', task: '1.1', target: 'staging', verificationProfile: 'relaxed' });
    assert.deepEqual([spend.authorized, spend.reason], [false, 'no-approval']);
    const accept = authorizes(dir, { action: 'accept', change: 'demo', task: '1.1', verificationProfile: 'relaxed' });
    assert.equal(accept.authorized, true);
  } finally {
    cleanup(dir);
  }
});

test('approve requires a valid target for external-effect actions and refuses it for gates', async () => {
  const dir = await project();
  try {
    const base = ['approve', 'a1', '--note', 'n', '--change', 'demo', '--task', '1.1', '--approver', 'human-1',
      '--expiry', new Date(Date.now() + HOUR_MS).toISOString()];
    const noTarget = await idefactory(dir, [...base, '--action', 'deploy']);
    assert.notEqual(noTarget.code, 0);
    assert.match(noTarget.err, /--target/);
    const badTarget = await idefactory(dir, [...base, '--action', 'deploy', '--target', 'bad target!']);
    assert.notEqual(badTarget.code, 0);
    const gateTarget = await idefactory(dir, [...base, '--action', 'accept', '--target', 'staging']);
    assert.notEqual(gateTarget.code, 0);
    const unknown = await idefactory(dir, [...base, '--action', 'launch']);
    assert.match(unknown.err, /valid actions: accept, complete, publish, deploy, spend, account/);
    assert.equal(fs.existsSync(path.join(dir, '.factory/approvals/a1.json')), false);

    const ok = await idefactory(dir, [...base, '--action', 'deploy', '--target', 'staging']);
    assert.equal(ok.code, 0, ok.err);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.factory/approvals/a1.json'), 'utf8')).target, 'staging');
  } finally {
    cleanup(dir);
  }
});

test('a standing authorization needs policy version 2 and an external-effect action', async () => {
  const dir = await project();
  try {
    const args = ['approve', 's1', '--note', 'n', '--change', 'demo', '--action', 'deploy', '--target', 'staging',
      '--standing', '--approver', 'ada', '--principal-provider', 'local', '--principal-subject', 'ada',
      '--expiry', new Date(Date.now() + HOUR_MS).toISOString()];
    const v1 = await idefactory(dir, args);
    assert.notEqual(v1.code, 0);
    assert.match(v1.err, /policy version 2/);

    setGovernance(dir, { policyVersion: 2, principalVerifier: writeVerifier(dir) });
    commitAll(dir);
    const gate = await idefactory(dir, args.map((part) => (part === 'deploy' ? 'accept' : part)).filter((part) => part !== '--target' && part !== 'staging'));
    assert.notEqual(gate.code, 0);
    const withTask = await idefactory(dir, [...args, '--task', '1.1']);
    assert.notEqual(withTask.code, 0);
    assert.equal(fs.existsSync(path.join(dir, '.factory/approvals/s1.json')), false);
  } finally {
    cleanup(dir);
  }
});

test('a standing authorization is capped by governance.standingMaxHours', async () => {
  const dir = await project();
  try {
    setGovernance(dir, { policyVersion: 2, principalVerifier: writeVerifier(dir), standingMaxHours: 2 });
    commitAll(dir);
    const make = (hours) => ['approve', `s-${hours}`, '--note', 'n', '--change', 'demo', '--action', 'deploy',
      '--target', 'staging', '--standing', '--approver', 'ada', '--principal-provider', 'local',
      '--principal-subject', 'ada', '--expiry', new Date(Date.now() + hours * HOUR_MS).toISOString()];
    const tooLong = await idefactory(dir, make(3));
    assert.notEqual(tooLong.code, 0);
    assert.match(tooLong.err, /2 hours/);
    const fine = await idefactory(dir, make(1));
    assert.equal(fine.code, 0, fine.err);

    setGovernance(dir, { standingMaxHours: 99999 });
    const outOfRange = await idefactory(dir, make(200));
    assert.notEqual(outOfRange.code, 0);
    assert.match(outOfRange.err, /168 hours/);
  } finally {
    cleanup(dir);
  }
});

test('standing authorization survives HEAD moving, is target-bound, and revoke ends it', async () => {
  const dir = await project();
  try {
    setGovernance(dir, { policyVersion: 2, principalVerifier: writeVerifier(dir) });
    commitAll(dir);
    const approved = await idefactory(dir, ['approve', 'stand', '--note', 'staging deploys', '--change', 'demo',
      '--action', 'deploy', '--target', 'staging', '--standing', '--approver', 'ada',
      '--principal-provider', 'local', '--principal-subject', 'ada',
      '--expiry', new Date(Date.now() + 2 * HOUR_MS).toISOString()]);
    assert.equal(approved.code, 0, approved.err);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, '.factory/approvals/stand.json'), 'utf8'));
    assert.equal(stored.schemaVersion, 3);
    assert.equal(stored.task, undefined);
    assert.equal(stored.sourceRevision, undefined);
    commitAll(dir);

    fs.writeFileSync(path.join(dir, 'moved.txt'), 'x');
    commitAll(dir, 'move head');
    fs.writeFileSync(path.join(dir, 'dirty.txt'), 'dirty');

    const flags = ['--change', 'demo', '--action', 'deploy'];
    let doc = await authorizeJson(dir, [...flags, '--target', 'staging']);
    assert.deepEqual([doc.authorized, doc.approvalId], [true, 'stand']);
    doc = await authorizeJson(dir, [...flags, '--target', 'production']);
    assert.equal(doc.reason, 'target-mismatch');
    doc = await authorizeJson(dir, ['--change', 'demo', '--action', 'publish', '--target', 'staging']);
    assert.equal(doc.reason, 'no-approval');
    doc = await authorizeJson(dir, ['--change', 'other', '--action', 'deploy', '--target', 'staging']);
    assert.equal(doc.reason, 'no-approval');

    const before = fs.readFileSync(path.join(dir, '.factory/approvals/stand.json'), 'utf8');
    const decisionsBefore = fs.readFileSync(path.join(dir, '.factory/decisions.md'), 'utf8');
    const unknownRevoke = await idefactory(dir, ['revoke', 'nope', '--note', 'x', '--revoker', 'ada', '--principal-provider', 'local', '--principal-subject', 'ada']);
    assert.notEqual(unknownRevoke.code, 0);
    assert.equal(fs.existsSync(path.join(dir, '.factory/approvals/nope.revoked.json')), false);

    const revoked = await idefactory(dir, ['revoke', 'stand', '--note', 'window closed', '--revoker', 'ada', '--principal-provider', 'local', '--principal-subject', 'ada']);
    assert.equal(revoked.code, 0, revoked.err);
    assert.equal(fs.readFileSync(path.join(dir, '.factory/approvals/stand.json'), 'utf8'), before);
    assert.match(fs.readFileSync(path.join(dir, '.factory/decisions.md'), 'utf8'), /revoked stand/);
    assert.notEqual(fs.readFileSync(path.join(dir, '.factory/decisions.md'), 'utf8'), decisionsBefore);
    const events = fs.readFileSync(path.join(dir, '.factory/observability/events.jsonl'), 'utf8');
    assert.match(events, /approval\.revoked/);
    doc = await authorizeJson(dir, [...flags, '--target', 'staging']);
    assert.equal(doc.reason, 'revoked');

    const again = await idefactory(dir, ['revoke', 'stand', '--note', 'again', '--revoker', 'ada', '--principal-provider', 'local', '--principal-subject', 'ada']);
    assert.notEqual(again.code, 0);
  } finally {
    cleanup(dir);
  }
});

test('revoke under policy version 2 needs a verified principal', async () => {
  const dir = await project();
  try {
    writeScopedApproval(dir, 'g1', record(dir));
    setGovernance(dir, { policyVersion: 2, principalVerifier: writeVerifier(dir) });
    const refused = await idefactory(dir, ['revoke', 'g1', '--note', 'n', '--revoker', 'mallory', '--principal-provider', 'local', '--principal-subject', 'mallory']);
    assert.notEqual(refused.code, 0);
    assert.equal(fs.existsSync(path.join(dir, '.factory/approvals/g1.revoked.json')), false);
  } finally {
    cleanup(dir);
  }
});

function textsMissingActions(texts, ids) {
  const missing = [];
  for (const [name, text] of Object.entries(texts)) {
    for (const action of ids) {
      if (!text.includes(`\`${action}\``) && !text.includes(action)) missing.push(`${name}: ${action}`);
      else if (name !== 'help' && !text.includes(`\`${action}\``)) missing.push(`${name}: ${action}`);
    }
  }
  return missing;
}

function surfaceTexts() {
  const help = spawnSync(process.execPath, [path.join(repoRoot, 'src/cli.mjs'), 'help', 'approve'], { encoding: 'utf8' });
  return {
    governance: fs.readFileSync(path.join(repoRoot, 'templates/factory/governance.md'), 'utf8'),
    readme: fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8'),
    skill: fs.readFileSync(path.join(repoRoot, 'templates/skills/factory-governance/SKILL.md'), 'utf8'),
    help: help.stdout,
  };
}

test('every surface names the same action list and names authorize', () => {
  const texts = surfaceTexts();
  assert.deepEqual(textsMissingActions(texts, actionIds()), []);
  for (const name of ['governance', 'readme', 'skill']) assert.match(texts[name], /authorize/, name);
});

test('a row missing from a surface fails the consistency check and names the surface', () => {
  const missing = textsMissingActions(surfaceTexts(), [...actionIds(), 'fake-row']);
  assert.deepEqual(missing.sort(), [
    'governance: fake-row', 'help: fake-row', 'readme: fake-row', 'skill: fake-row',
  ]);
});

test('every action validates and an unknown action lists the valid ones', async () => {
  const dir = await project();
  try {
    for (const action of actionIds()) {
      const external = APPROVAL_ACTIONS.find((row) => row.id === action).kind === 'external-effect';
      const validated = validateScopedApproval(record(dir, { action, ...(external ? { target: 'staging' } : {}) }));
      assert.equal(validated.action, action);
    }
    assert.throws(() => validateScopedApproval(record(dir, { action: 'launch' })), /valid actions: accept, complete, publish, deploy, spend, account/);
    assert.throws(() => validateScopedApproval(record(dir, { action: 'deploy' })), /requires a valid target/);
  } finally {
    cleanup(dir);
  }
});

test('standingMaxMs defaults to 168 hours when nothing is configured', async () => {
  const dir = await project();
  try {
    assert.equal(standingMaxMs(dir), 168 * HOUR_MS);
    setGovernance(dir, { standingMaxHours: 24 });
    assert.equal(standingMaxMs(dir), 24 * HOUR_MS);
    setGovernance(dir, { standingMaxHours: 0 });
    assert.equal(standingMaxMs(dir), 168 * HOUR_MS);
  } finally {
    cleanup(dir);
  }
});

test('authorize is read-only for the lease and revoke is refused during a lease conflict', async () => {
  const dir = await project();
  try {
    assert.equal(isReadOnlyCommand('authorize'), true);
    assert.equal(isMutatingCommand('authorize'), false);
    assert.equal(isMutatingCommand('revoke'), true);
    writeScopedApproval(dir, 'g1', record(dir));
    acquireWriterLease(dir, 'complete');
    const during = await authorizeJson(dir, ['--change', 'demo', '--task', '1.1', '--action', 'accept']);
    assert.equal(during.authorized, true);
    const revoked = await idefactory(dir, ['revoke', 'g1', '--note', 'n']);
    assert.notEqual(revoked.code, 0);
    assert.match(`${revoked.err}${revoked.out}`, /writer lease held/);
    assert.equal(fs.existsSync(path.join(dir, '.factory/approvals/g1.revoked.json')), false);
  } finally {
    cleanup(dir);
  }
});

test('a standing authorization is refused without a verified principal', async () => {
  const dir = await project();
  try {
    setGovernance(dir, { policyVersion: 2, principalVerifier: writeVerifier(dir) });
    commitAll(dir);
    const result = await idefactory(dir, ['approve', 's9', '--note', 'n', '--change', 'demo', '--action', 'deploy',
      '--target', 'staging', '--standing', '--approver', 'ada', '--expiry', new Date(Date.now() + HOUR_MS).toISOString()]);
    assert.notEqual(result.code, 0);
    assert.equal(fs.existsSync(path.join(dir, '.factory/approvals/s9.json')), false);
  } finally {
    cleanup(dir);
  }
});
