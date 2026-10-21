import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
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

function scopedApproveArgs(id, note) {
  return [
    'approve', id, '--note', note,
    '--change', 'demo',
    '--task', '1.1',
    '--action', 'accept',
    '--approver', 'bc-approver-9',
    '--expiry', new Date(Date.now() + 12 * HOUR_MS).toISOString(),
  ];
}

test('doctor requires .factory/governance.md and does not require GOLDEN_RULES.md', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.equal(fs.existsSync(path.join(dir, 'GOLDEN_RULES.md')), false);
    assert.equal((await idefactory(dir, ['doctor'])).code, 0);
    fs.unlinkSync(path.join(dir, '.factory/governance.md'));
    const missing = await idefactory(dir, ['doctor']);
    assert.notEqual(missing.code, 0);
    assert.match(`${missing.out}${missing.err}`, /governance\.md/);
    assert.doesNotMatch(`${missing.out}${missing.err}`, /GOLDEN_RULES/);
    fs.writeFileSync(path.join(dir, 'GOLDEN_RULES.md'), 'legacy\n');
    const withLegacy = await idefactory(dir, ['doctor']);
    assert.notEqual(withLegacy.code, 0);
    assert.match(`${withLegacy.out}${withLegacy.err}`, /governance\.md/);
    assert.doesNotMatch(`${withLegacy.out}${withLegacy.err}`, /GOLDEN_RULES/);
  } finally {
    cleanup(dir);
  }
});

test('approve and reject append, and lockout writes a note', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    ensureCleanGitCommit(dir);
    const first = await idefactory(dir, scopedApproveArgs('spend-ok', 'allowed for test'));
    assert.equal(first.code, 0, first.err);
    ensureCleanGitCommit(dir);
    const second = await idefactory(dir, scopedApproveArgs('second-ok', 'also allowed'));
    assert.equal(second.code, 0, second.err);
    const decisions = fs.readFileSync(path.join(dir, '.factory/decisions.md'), 'utf8');
    assert.match(decisions, /spend-ok/);
    assert.match(decisions, /second-ok/);
    const approvals = fs.readdirSync(path.join(dir, '.factory/approvals')).filter((name) => name.endsWith('.json'));
    const bodies = approvals.map((name) => fs.readFileSync(path.join(dir, '.factory/approvals', name), 'utf8')).join('\n');
    assert.match(bodies, /allowed for test/);
    const rejected = await idefactory(dir, ['reject', 'nope', '--note', 'not this']);
    assert.equal(rejected.code, 0, rejected.err);
    const after = fs.readFileSync(path.join(dir, '.factory/decisions.md'), 'utf8');
    assert.match(after, /rejected/);
    assert.match(after, /nope/);
    assert.match(after, /spend-ok/);
    const locked = await idefactory(dir, ['lockout', '--agent', 'engineer', '--reviewer', 'reviewer', '--reason', 'tests failed']);
    assert.equal(locked.code, 0, locked.err);
    const notes = fs.readdirSync(path.join(dir, '.factory/orchestration')).filter((name) => name.endsWith('.md'));
    assert.equal(notes.length, 1);
    const note = fs.readFileSync(path.join(dir, '.factory/orchestration', notes[0]), 'utf8');
    assert.match(note, /Agent: engineer/);
    assert.match(note, /tests failed/);
    assert.equal(fs.existsSync(path.join(dir, 'app.js')), false);
  } finally {
    cleanup(dir);
  }
});
