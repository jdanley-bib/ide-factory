import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { getWorkItem } from '../src/lib/work.mjs';

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

function events(dir) {
  const file = path.join(dir, '.factory/observability/events.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('approve and verify append redacted events and status does not', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const config = JSON.parse(fs.readFileSync(path.join(dir, '.factory/config.json'), 'utf8'));
    config.governance.policyVersion = 1;
    fs.writeFileSync(path.join(dir, '.factory/config.json'), JSON.stringify(config, null, 2));
    ensureCleanGitCommit(dir);
    const note = 'SUPER_SECRET_NOTE';
    const approved = await idefactory(dir, [
      'approve', 'spend-1', '--note', note,
      '--change', 'demo', '--task', '1.1', '--action', 'accept',
      '--approver', 'ada',
      '--expiry', new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ]);
    assert.equal(approved.code, 0, approved.err);
    const approvalEvents = events(dir);
    assert.equal(approvalEvents.some((event) => event.type === 'approval.issued'), true);
    assert.equal(JSON.stringify(approvalEvents).includes(note), false);

    const beforeStatus = fs.readFileSync(path.join(dir, '.factory/observability/events.jsonl'), 'utf8');
    assert.equal((await idefactory(dir, ['status', '--json'])).code, 0);
    assert.equal(fs.readFileSync(path.join(dir, '.factory/observability/events.jsonl'), 'utf8'), beforeStatus);

    fs.writeFileSync(path.join(dir, 'check.mjs'), 'console.log("SECRET_LOG_TEXT");\n');
    const registry = {
      schemaVersion: 1,
      checks: {
        unit: { argv: ['node', 'check.mjs'], cwdPolicy: 'project', timeoutMs: 5000, artifacts: [] },
      },
    };
    fs.writeFileSync(path.join(dir, '.factory/checks.json'), JSON.stringify(registry, null, 2));
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), '- [ ] 1.1 Item\n');
    assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    const attempt = JSON.parse(started.out);
    ensureCleanGitCommit(dir);
    const verified = await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit']);
    assert.equal(verified.code, 0, verified.err);
    const verifyEvent = events(dir).find((event) => event.type === 'verification.recorded');
    assert.ok(verifyEvent);
    assert.equal(typeof verifyEvent.commandDigest, 'string');
    assert.equal(verifyEvent.exitCode, 0);
    assert.equal(JSON.stringify(events(dir)).includes('SECRET_LOG_TEXT'), false);
  } finally {
    cleanup(dir);
  }
});

function writeCheckRegistry(dir, exitByKind) {
  const checks = {};
  for (const [kind, code] of Object.entries(exitByKind)) {
    checks[kind] = {
      argv: [process.execPath, '-e', `process.exit(${code})`],
      cwdPolicy: 'project',
      timeoutMs: 30000,
      artifacts: [],
    };
  }
  fs.writeFileSync(
    path.join(dir, '.factory/checks.json'),
    `${JSON.stringify({ schemaVersion: 1, checks }, null, 2)}\n`,
  );
}

test('a failed event append after completion leaves the work item done and warns', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const config = JSON.parse(fs.readFileSync(path.join(dir, '.factory/config.json'), 'utf8'));
    config.governance.policyVersion = 1;
    fs.writeFileSync(path.join(dir, '.factory/config.json'), JSON.stringify(config, null, 2));
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), '- [ ] 1.1 Add parser\n');
    assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    const attempt = JSON.parse(started.out);
    writeCheckRegistry(dir, { unit: 1 });
    assert.equal((await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit', '--red'])).code, 0);
    assert.equal((await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'implementing',
      '--evidence', JSON.stringify({ implementerId: 'engineer-1' }),
    ])).code, 0);
    assert.equal((await idefactory(dir, [
      'attempt', 'transition', attempt.id, 'red-confirmed', '--evidence', '{}',
    ])).code, 0);
    writeCheckRegistry(dir, { unit: 0 });
    ensureCleanGitCommit(dir);
    assert.equal((await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit'])).code, 0);
    for (const [state, evidence] of [
      ['verifying', {}],
      ['awaiting-review', {}],
      ['accepted', { reviewerId: 'reviewer-1', verdict: 'ACCEPT' }],
    ]) {
      const moved = await idefactory(dir, [
        'attempt', 'transition', attempt.id, state, '--evidence', JSON.stringify(evidence),
      ]);
      assert.equal(moved.code, 0, moved.err);
    }
    fs.rmSync(path.join(dir, '.factory/observability/events.jsonl'));
    fs.mkdirSync(path.join(dir, '.factory/observability/events.jsonl'));
    const completed = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attempt.id]);
    assert.match(`${completed.err}${completed.out}`, /event-log warning/);
    assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'done');
  } finally {
    cleanup(dir);
  }
});
