import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { humanGateAllows } from '../src/lib/risk-gates.mjs';
import { resolveGitBinding } from '../src/lib/verification-evidence.mjs';
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

function commitAll(dir) {
  git(dir, ['init']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'idefactory-test']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-m', 'checkpoint']);
  return git(dir, ['rev-parse', 'HEAD']);
}

function setPolicyVersion(dir, version) {
  const configPath = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.governance.policyVersion = version;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function writeUnitCheck(dir) {
  const registry = {
    schemaVersion: 1,
    checks: {
      unit: {
        argv: [process.execPath, '-e', 'process.exit(0)'],
        cwdPolicy: 'project',
        timeoutMs: 5000,
        artifacts: [],
      },
    },
  };
  fs.writeFileSync(path.join(dir, '.factory/checks.json'), `${JSON.stringify(registry, null, 2)}\n`);
}

test('approval files and decisions.md stay bound to the current HEAD', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    setPolicyVersion(dir, 1);
    writeUnitCheck(dir);
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), '- [ ] 1.1 Item\n');
    assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    const attempt = JSON.parse(started.out);
    const head = commitAll(dir);

    const ignored = spawnSync('git', ['check-ignore', '-q', '--', '.factory/approvals/gate.json'], {
      cwd: dir,
      encoding: 'utf8',
      shell: false,
    });
    assert.notEqual(ignored.status, 0, 'approval files must stay visible to git');

    fs.mkdirSync(path.join(dir, '.factory/approvals'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.factory/approvals/manual.json'), '{}\n');
    let binding = resolveGitBinding(dir);
    assert.equal(binding.worktreeClean, true);
    assert.equal(binding.sourceRevision, head);
    const approvalOnly = await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit']);
    assert.equal(approvalOnly.code, 0, approvalOnly.err);
    let stored = JSON.parse(fs.readFileSync(path.join(dir, `.factory/attempts/${attempt.id}.json`), 'utf8'));
    let record = stored.evidence.verification.at(-1);
    assert.equal(record.passed, true);
    assert.equal(record.sourceRevision, head);
    fs.rmSync(path.join(dir, '.factory/approvals/manual.json'));

    fs.appendFileSync(path.join(dir, '.factory/decisions.md'), '\nmanual note\n');
    binding = resolveGitBinding(dir);
    assert.equal(binding.worktreeClean, true);
    assert.equal(binding.sourceRevision, head);
    const decisionsOnly = await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit']);
    assert.equal(decisionsOnly.code, 0, decisionsOnly.err);
    stored = JSON.parse(fs.readFileSync(path.join(dir, `.factory/attempts/${attempt.id}.json`), 'utf8'));
    record = stored.evidence.verification.at(-1);
    assert.equal(record.passed, true);
    assert.equal(record.sourceRevision, head);

    fs.writeFileSync(path.join(dir, 'product.txt'), 'edit\n');
    binding = resolveGitBinding(dir);
    assert.equal(binding.worktreeClean, false);
    const productDirty = await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit']);
    assert.equal(productDirty.code, 0, productDirty.err);
    stored = JSON.parse(fs.readFileSync(path.join(dir, `.factory/attempts/${attempt.id}.json`), 'utf8'));
    record = stored.evidence.verification.at(-1);
    assert.equal(record.passed, false);
    fs.rmSync(path.join(dir, 'product.txt'));
    git(dir, ['checkout', '--', '.factory/decisions.md']);

    const before = git(dir, ['rev-parse', 'HEAD']);
    const approved = await idefactory(dir, [
      'approve', 'gate-1', '--note', 'reviewed',
      '--change', 'demo', '--task', '1.1', '--action', 'accept',
      '--approver', 'ada',
      '--expiry', new Date(Date.now() + HOUR_MS).toISOString(),
    ]);
    assert.equal(approved.code, 0, approved.err + approved.out);
    assert.equal(git(dir, ['rev-parse', 'HEAD']), before);
    const porcelain = git(dir, ['status', '--porcelain']);
    assert.match(porcelain, /\.factory\/approvals\/gate-1\.json/);
    assert.match(porcelain, /\.factory\/decisions\.md/);
    assert.equal(humanGateAllows(dir, {
      action: 'accept',
      verificationProfile: 'release',
      change: 'demo',
      task: '1.1',
      implementerId: 'engineer-1',
    }), true);
    binding = resolveGitBinding(dir);
    assert.equal(binding.worktreeClean, true);
    assert.equal(binding.sourceRevision, before);
  } finally {
    cleanup(dir);
  }
});
