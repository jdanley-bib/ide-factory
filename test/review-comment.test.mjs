import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

const fakeForge = path.join(repoRoot, 'support/fake-forge.mjs');

const FORBIDDEN_ARGV = [
  /\bmerge\b/i,
  /\brulesets\b/i,
  /branches\/.+\/protection/i,
  /api\.github\.com/i,
  /\bgh\s+api\b/i,
];

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

function readArgvLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertSafeForgeArgv(argvLists) {
  assert.ok(argvLists.length > 0, 'stub forge must record at least one argv');
  for (const argv of argvLists) {
    assert.ok(Array.isArray(argv), 'each stub log entry must be an argv array');
    const joined = argv.join(' ');
    for (const pattern of FORBIDDEN_ARGV) {
      assert.doesNotMatch(
        joined,
        pattern,
        `stub argv must not merge or call forge admin API: ${joined}`,
      );
    }
  }
}

function writeAttempt(dir, attempt) {
  fs.mkdirSync(path.join(dir, '.factory', 'attempts'), { recursive: true });
  const file = path.join(dir, '.factory', 'attempts', `${attempt.id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(attempt, null, 2)}\n`);
  return file;
}

function commentBodies(argvLists) {
  return argvLists
    .filter((argv) => argv[0] === 'pr' && argv[1] === 'comment')
    .map((argv) => {
      const index = argv.indexOf('--body');
      return index >= 0 ? argv[index + 1] : '';
    });
}

test('accept stores reviewer role and posts one stub comment with role, verdict, and attempt id', async () => {
  const dir = tempProject();
  const change = 'demo-accept-review-comment';
  const attemptId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
  const verdict = 'ACCEPT';
  const role = 'reviewer';
  const logPath = path.join(dir, 'forge-argv.log');
  const dbPath = path.join(dir, 'forge-db.json');
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    ensureCleanGitCommit(dir);

    const forgeEnv = {
      IDEFACTORY_FORGE: fakeForge,
      IDEFACTORY_FORGE_LOG: logPath,
      IDEFACTORY_FORGE_DB: dbPath,
    };
    const opened = await idefactory(dir, ['pr', 'open', change], forgeEnv);
    assert.equal(opened.code, 0, opened.err || opened.out);
    assert.ok(
      fs.existsSync(path.join(dir, '.factory', 'pull-requests', `${change}.json`)),
      'pull request record must exist before accept',
    );

    writeAttempt(dir, {
      id: attemptId,
      change,
      taskId: '1.1',
      state: 'awaiting-review',
      implementerRole: 'engineer',
      implementerId: 'engineer-review-comment',
      reviewerId: null,
      modelProfile: 'coding-standard',
      evidence: {
        red: null,
        verification: [],
        security: [],
        review: null,
        changedFiles: [],
        baseRev: null,
      },
      history: [],
      createdAt: '2026-10-27T00:00:00.000Z',
      updatedAt: '2026-10-27T00:00:00.000Z',
    });

    const commentsBefore = commentBodies(readArgvLog(logPath)).length;
    const accepted = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'accepted',
      '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict }),
    ], forgeEnv);
    assert.equal(accepted.code, 0, accepted.err || accepted.out);

    const stored = JSON.parse(fs.readFileSync(
      path.join(dir, '.factory', 'attempts', `${attemptId}.json`),
      'utf8',
    ));
    assert.equal(stored.state, 'accepted');
    assert.equal(stored.evidence.review?.verdict, verdict);
    assert.equal(
      stored.evidence.review?.role,
      role,
      'accept must store evidence.review.role as reviewer',
    );

    const bodies = commentBodies(readArgvLog(logPath));
    assert.equal(
      bodies.length,
      commentsBefore + 1,
      'accept with a pull request record must post exactly one comment',
    );
    assert.match(bodies.at(-1), new RegExp(role));
    assert.match(bodies.at(-1), new RegExp(verdict));
    assert.match(bodies.at(-1), new RegExp(attemptId));
    assertSafeForgeArgv(readArgvLog(logPath));
  } finally {
    cleanup(dir);
  }
});
