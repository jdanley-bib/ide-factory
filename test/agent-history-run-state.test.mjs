import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { completeWorkItem } from '../src/lib/complete.mjs';
import { humanGateAllows } from '../src/lib/risk-gates.mjs';
import { resolveGitBinding } from '../src/lib/verification-evidence.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
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

function ensureFactoryGitignore(dir) {
  const file = path.join(dir, '.gitignore');
  const lines = [
    '.factory/attempts/*',
    '!.factory/attempts/.gitkeep',
    '.factory/work/',
    '.factory/ledger.jsonl',
    '.factory/orchestration/*',
    '!.factory/orchestration/.gitkeep',
  ];
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const extras = lines.filter((line) => !existing.split('\n').includes(line));
  if (extras.length > 0) {
    fs.writeFileSync(
      file,
      `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${extras.join('\n')}\n`,
    );
  }
}

function ensureCleanGitCommit(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    git(dir, ['init']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'idefactory-test']);
  }
  ensureFactoryGitignore(dir);
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

function setPolicyVersion(dir, version) {
  const configPath = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.governance.policyVersion = version;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function writeUnitCheck(dir, exitCode = 0) {
  const registry = {
    schemaVersion: 1,
    checks: {
      unit: {
        argv: [process.execPath, '-e', `process.exit(${exitCode})`],
        cwdPolicy: 'project',
        timeoutMs: 5000,
        artifacts: [],
      },
    },
  };
  fs.writeFileSync(path.join(dir, '.factory/checks.json'), `${JSON.stringify(registry, null, 2)}\n`);
}

function writeCheckRegistry(dir, exitByKind) {
  const checks = {};
  for (const [kind, code] of Object.entries(exitByKind)) {
    checks[kind] = {
      argv: [process.execPath, '-e', `process.exit(${code})`],
      cwdPolicy: 'project',
      timeoutMs: 30_000,
      artifacts: [],
    };
  }
  fs.writeFileSync(
    path.join(dir, '.factory/checks.json'),
    `${JSON.stringify({ schemaVersion: 1, checks }, null, 2)}\n`,
  );
}

function appendHistory(dir, role) {
  const historyPath = path.join(dir, `.factory/agents/${role}/history.md`);
  fs.appendFileSync(historyPath, `\n# session note ${role}\n`);
  return historyPath;
}

async function seedVerifyFixture(dir) {
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
  return { attempt, head };
}

async function seedCompleteFixture(dir) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  const configPath = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.governance.policyVersion = 1;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'openspec/changes/demo/tasks.md'),
    [
      '- [ ] 1.1 Add parser',
      '  factory:',
      '    kind: general',
      '    checks: [unit]',
      '    verificationProfile: frontend-low',
      '    roles: [engineer, reviewer, scribe]',
      '',
    ].join('\n'),
  );
  assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
  const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
  assert.equal(started.code, 0, started.err);
  const attempt = JSON.parse(started.out);

  writeCheckRegistry(dir, { unit: 1 });
  assert.equal((await idefactory(dir, [
    'verify', 'run', attempt.id, '--check', 'unit', '--red',
  ])).code, 0);
  assert.equal((await idefactory(dir, [
    'attempt', 'transition', attempt.id, 'implementing',
    '--evidence', JSON.stringify({ implementerId: 'engineer-1' }),
  ])).code, 0);
  assert.equal((await idefactory(dir, [
    'attempt', 'transition', attempt.id, 'red-confirmed',
    '--evidence', '{}',
  ])).code, 0);

  writeCheckRegistry(dir, { unit: 0 });
  ensureCleanGitCommit(dir);
  assert.equal((await idefactory(dir, [
    'verify', 'run', attempt.id, '--check', 'unit',
  ])).code, 0);
  assert.equal((await idefactory(dir, [
    'attempt', 'transition', attempt.id, 'verifying',
    '--evidence', '{}',
  ])).code, 0);
  assert.equal((await idefactory(dir, [
    'attempt', 'transition', attempt.id, 'awaiting-review',
    '--evidence', '{}',
  ])).code, 0);
  assert.equal((await idefactory(dir, [
    'attempt', 'transition', attempt.id, 'accepted',
    '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict: 'ACCEPT' }),
  ])).code, 0);

  return attempt;
}

async function assertHistoryAlonePasses(dir, role) {
  const { attempt, head } = await seedVerifyFixture(dir);
  appendHistory(dir, role);

  const binding = resolveGitBinding(dir);
  assert.equal(binding.worktreeClean, true);
  assert.equal(binding.sourceRevision, head);

  const verified = await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit']);
  assert.equal(verified.code, 0, verified.err);
  const stored = JSON.parse(fs.readFileSync(path.join(dir, `.factory/attempts/${attempt.id}.json`), 'utf8'));
  const record = stored.evidence.verification.at(-1);
  assert.equal(record.passed, true);
  assert.equal(record.sourceRevision, head);
}

test('engineer history alone stays clean and verify records a pass', async () => {
  const dir = tempProject();
  try {
    await assertHistoryAlonePasses(dir, 'engineer');
  } finally {
    cleanup(dir);
  }
});

test('reviewer history alone stays clean and verify records a pass', async () => {
  const dir = tempProject();
  try {
    await assertHistoryAlonePasses(dir, 'reviewer');
  } finally {
    cleanup(dir);
  }
});

test('accept approval authorizes accept when only an agent history is extra dirt', async () => {
  const dir = tempProject();
  try {
    const { head } = await seedVerifyFixture(dir);
    const before = git(dir, ['rev-parse', 'HEAD']);
    assert.equal(before, head);

    const approved = await idefactory(dir, [
      'approve', 'gate-accept', '--note', 'reviewed',
      '--change', 'demo', '--task', '1.1', '--action', 'accept',
      '--approver', 'ada',
      '--expiry', new Date(Date.now() + HOUR_MS).toISOString(),
    ]);
    assert.equal(approved.code, 0, approved.err + approved.out);
    appendHistory(dir, 'engineer');

    assert.equal(humanGateAllows(dir, {
      action: 'accept',
      verificationProfile: 'release',
      change: 'demo',
      task: '1.1',
      implementerId: 'engineer-1',
    }), true);
    const binding = resolveGitBinding(dir);
    assert.equal(binding.worktreeClean, true);
    assert.equal(binding.sourceRevision, before);
  } finally {
    cleanup(dir);
  }
});

test('complete approval authorizes complete when only an agent history is extra dirt', async () => {
  const dir = tempProject();
  try {
    const { head } = await seedVerifyFixture(dir);
    const before = git(dir, ['rev-parse', 'HEAD']);
    assert.equal(before, head);

    const approved = await idefactory(dir, [
      'approve', 'gate-complete', '--note', 'reviewed',
      '--change', 'demo', '--task', '1.1', '--action', 'complete',
      '--approver', 'ada',
      '--expiry', new Date(Date.now() + HOUR_MS).toISOString(),
    ]);
    assert.equal(approved.code, 0, approved.err + approved.out);
    appendHistory(dir, 'reviewer');

    assert.equal(humanGateAllows(dir, {
      action: 'complete',
      verificationProfile: 'release',
      change: 'demo',
      task: '1.1',
      implementerId: 'engineer-1',
    }), true);
    const binding = resolveGitBinding(dir);
    assert.equal(binding.worktreeClean, true);
    assert.equal(binding.sourceRevision, before);
  } finally {
    cleanup(dir);
  }
});

test('completeWorkItem finishes with only engineer history dirty on frontend-low', async () => {
  const dir = tempProject();
  try {
    const attempt = await seedCompleteFixture(dir);
    appendHistory(dir, 'engineer');

    const result = completeWorkItem(dir, 'demo', '1.1', attempt.id, {});
    assert.equal(result.item.status, 'done');
    assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'done');
  } finally {
    cleanup(dir);
  }
});

test('charter edit keeps the worktree dirty and verify does not pass', async () => {
  const dir = tempProject();
  try {
    const { attempt } = await seedVerifyFixture(dir);
    fs.appendFileSync(path.join(dir, '.factory/agents/engineer/charter.md'), '\n# charter edit\n');

    const binding = resolveGitBinding(dir);
    assert.equal(binding.worktreeClean, false);

    const verified = await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit']);
    assert.equal(verified.code, 0, verified.err);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, `.factory/attempts/${attempt.id}.json`), 'utf8'));
    const record = stored.evidence.verification.at(-1);
    assert.equal(record.passed, false);
  } finally {
    cleanup(dir);
  }
});

test('identity note edit keeps the worktree dirty and verify does not pass', async () => {
  const dir = tempProject();
  try {
    const { attempt } = await seedVerifyFixture(dir);
    fs.appendFileSync(path.join(dir, '.factory/identity/now.md'), '\n# identity edit\n');

    const binding = resolveGitBinding(dir);
    assert.equal(binding.worktreeClean, false);

    const verified = await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit']);
    assert.equal(verified.code, 0, verified.err);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, `.factory/attempts/${attempt.id}.json`), 'utf8'));
    const record = stored.evidence.verification.at(-1);
    assert.equal(record.passed, false);
  } finally {
    cleanup(dir);
  }
});

test('nested notes/history.md keeps the worktree dirty and verify does not pass', async () => {
  const dir = tempProject();
  try {
    const { attempt } = await seedVerifyFixture(dir);
    const nestedDir = path.join(dir, '.factory/agents/engineer/notes');
    fs.mkdirSync(nestedDir, { recursive: true });
    const nested = path.join(nestedDir, 'history.md');
    fs.writeFileSync(nested, '# nested\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-m', 'add nested history']);
    fs.appendFileSync(nested, '\n# nested edit\n');

    const binding = resolveGitBinding(dir);
    assert.equal(binding.worktreeClean, false);

    const verified = await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit']);
    assert.equal(verified.code, 0, verified.err);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, `.factory/attempts/${attempt.id}.json`), 'utf8'));
    const record = stored.evidence.verification.at(-1);
    assert.equal(record.passed, false);
  } finally {
    cleanup(dir);
  }
});

test('product source next to a history file keeps the worktree dirty and verify does not pass', async () => {
  const dir = tempProject();
  try {
    const { attempt } = await seedVerifyFixture(dir);
    appendHistory(dir, 'engineer');
    fs.writeFileSync(path.join(dir, 'product.txt'), 'edit\n');

    const binding = resolveGitBinding(dir);
    assert.equal(binding.worktreeClean, false);

    const verified = await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit']);
    assert.equal(verified.code, 0, verified.err);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, `.factory/attempts/${attempt.id}.json`), 'utf8'));
    const record = stored.evidence.verification.at(-1);
    assert.equal(record.passed, false);
  } finally {
    cleanup(dir);
  }
});

test('git check-ignore does not ignore engineer history.md', async () => {
  const dir = tempProject();
  try {
    await seedVerifyFixture(dir);
    const ignored = spawnSync('git', ['check-ignore', '-q', '--', '.factory/agents/engineer/history.md'], {
      cwd: dir,
      encoding: 'utf8',
      shell: false,
    });
    assert.notEqual(ignored.status, 0, 'agent history files must stay visible to git');
  } finally {
    cleanup(dir);
  }
});
