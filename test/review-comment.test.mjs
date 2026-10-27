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

function securityCheckingAttempt(id, change) {
  return {
    id,
    change,
    taskId: '1.2',
    state: 'security-checking',
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
  };
}

async function openRecordedPullRequest(dir, change, forgeEnv) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  ensureCleanGitCommit(dir);
  const opened = await idefactory(dir, ['pr', 'open', change], forgeEnv);
  assert.equal(opened.code, 0, opened.err || opened.out);
  assert.ok(
    fs.existsSync(path.join(dir, '.factory', 'pull-requests', `${change}.json`)),
    'pull request record must exist before the security-reviewer handoff',
  );
}

test('security-reviewer handoff stores securityReview and posts one stub comment', async () => {
  const dir = tempProject();
  const change = 'demo-security-review-comment';
  const attemptId = 'cccccccc-dddd-4eee-8fff-000000000002';
  const verdict = 'ACCEPT';
  const role = 'security-reviewer';
  const logPath = path.join(dir, 'forge-argv.log');
  const dbPath = path.join(dir, 'forge-db.json');
  try {
    const forgeEnv = {
      IDEFACTORY_FORGE: fakeForge,
      IDEFACTORY_FORGE_LOG: logPath,
      IDEFACTORY_FORGE_DB: dbPath,
    };
    await openRecordedPullRequest(dir, change, forgeEnv);
    writeAttempt(dir, securityCheckingAttempt(attemptId, change));

    const commentsBefore = commentBodies(readArgvLog(logPath)).length;
    const handedOff = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'awaiting-review',
      '--evidence', JSON.stringify({ verdict }),
    ], forgeEnv);
    assert.equal(handedOff.code, 0, handedOff.err || handedOff.out);

    const stored = JSON.parse(fs.readFileSync(
      path.join(dir, '.factory', 'attempts', `${attemptId}.json`),
      'utf8',
    ));
    assert.equal(stored.state, 'awaiting-review');
    assert.equal(
      stored.evidence.review ?? null,
      null,
      'security verdict must stay off evidence.review',
    );
    assert.equal(stored.evidence.securityReview?.verdict, verdict);
    assert.equal(
      stored.evidence.securityReview?.role,
      role,
      'handoff must store evidence.securityReview.role as security-reviewer',
    );

    const bodies = commentBodies(readArgvLog(logPath));
    assert.equal(
      bodies.length,
      commentsBefore + 1,
      'security-reviewer verdict with a pull request record must post exactly one comment',
    );
    assert.match(bodies.at(-1), new RegExp(role));
    assert.match(bodies.at(-1), new RegExp(verdict));
    assert.match(bodies.at(-1), new RegExp(attemptId));
    assertSafeForgeArgv(readArgvLog(logPath));
  } finally {
    cleanup(dir);
  }
});

test('security-reviewer handoff with no verdict writes nothing and posts nothing', async () => {
  const dir = tempProject();
  const change = 'demo-security-review-missing';
  const attemptId = 'dddddddd-eeee-4fff-8000-111111111111';
  const logPath = path.join(dir, 'forge-argv.log');
  const dbPath = path.join(dir, 'forge-db.json');
  try {
    const forgeEnv = {
      IDEFACTORY_FORGE: fakeForge,
      IDEFACTORY_FORGE_LOG: logPath,
      IDEFACTORY_FORGE_DB: dbPath,
    };
    await openRecordedPullRequest(dir, change, forgeEnv);
    writeAttempt(dir, securityCheckingAttempt(attemptId, change));

    const commentsBefore = commentBodies(readArgvLog(logPath)).length;
    const handedOff = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'awaiting-review',
      '--evidence', JSON.stringify({}),
    ], forgeEnv);
    assert.equal(handedOff.code, 0, handedOff.err || handedOff.out);

    const stored = JSON.parse(fs.readFileSync(
      path.join(dir, '.factory', 'attempts', `${attemptId}.json`),
      'utf8',
    ));
    assert.equal(stored.state, 'awaiting-review');
    assert.equal(stored.evidence.review ?? null, null);
    assert.equal(
      stored.evidence.securityReview ?? null,
      null,
      'a handoff with no verdict must not invent a security-reviewer verdict',
    );
    assert.equal(
      commentBodies(readArgvLog(logPath)).length,
      commentsBefore,
      'a handoff with no verdict must not post to the forge',
    );
    assertSafeForgeArgv(readArgvLog(logPath));
  } finally {
    cleanup(dir);
  }
});

function awaitingReviewAttempt(id, change) {
  return {
    id,
    change,
    taskId: '1.3',
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
  };
}

test('second store of the same attempt and reviewer role does not post again', async () => {
  const dir = tempProject();
  const change = 'demo-review-comment-dedupe';
  const attemptId = 'eeeeeeee-ffff-4000-8000-222222222222';
  const verdict = 'ACCEPT';
  const role = 'reviewer';
  const logPath = path.join(dir, 'forge-argv.log');
  const dbPath = path.join(dir, 'forge-db.json');
  try {
    const forgeEnv = {
      IDEFACTORY_FORGE: fakeForge,
      IDEFACTORY_FORGE_LOG: logPath,
      IDEFACTORY_FORGE_DB: dbPath,
    };
    await openRecordedPullRequest(dir, change, forgeEnv);
    writeAttempt(dir, awaitingReviewAttempt(attemptId, change));

    const accepted = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'accepted',
      '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict }),
    ], forgeEnv);
    assert.equal(accepted.code, 0, accepted.err || accepted.out);
    assert.equal(commentBodies(readArgvLog(logPath)).length, 1);

    const again = await idefactory(dir, ['pr', 'comment', attemptId], forgeEnv);
    assert.equal(again.code, 0, again.err || again.out);

    const bodies = commentBodies(readArgvLog(logPath));
    assert.equal(
      bodies.length,
      1,
      'storing the same attempt and reviewer role again must not post a second comment',
    );
    assert.match(bodies[0], new RegExp(role));
    assert.match(bodies[0], new RegExp(verdict));
    assert.match(bodies[0], new RegExp(attemptId));
    assertSafeForgeArgv(readArgvLog(logPath));

    const record = JSON.parse(fs.readFileSync(
      path.join(dir, '.factory', 'pull-requests', `${change}.json`),
      'utf8',
    ));
    const pair = record.postedVerdicts.filter(
      (item) => item.attemptId === attemptId && item.role === role,
    );
    assert.equal(pair.length, 1, 'postedVerdicts keeps one entry for that attempt and role');
  } finally {
    cleanup(dir);
  }
});

test('accept stores the reviewer verdict when no pull request record exists and does not call the forge', async () => {
  const dir = tempProject();
  const change = 'demo-accept-without-pr';
  const attemptId = 'ffffffff-0000-4111-8222-333333333333';
  const verdict = 'ACCEPT';
  const role = 'reviewer';
  const logPath = path.join(dir, 'forge-argv.log');
  const dbPath = path.join(dir, 'forge-db.json');
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const forgeEnv = {
      IDEFACTORY_FORGE: fakeForge,
      IDEFACTORY_FORGE_LOG: logPath,
      IDEFACTORY_FORGE_DB: dbPath,
    };
    assert.equal(
      fs.existsSync(path.join(dir, '.factory', 'pull-requests', `${change}.json`)),
      false,
    );
    writeAttempt(dir, awaitingReviewAttempt(attemptId, change));

    const accepted = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'accepted',
      '--evidence', JSON.stringify({ reviewerId: 'reviewer-1', verdict }),
    ], forgeEnv);
    assert.equal(accepted.code, 0, accepted.err || accepted.out);

    const stored = JSON.parse(fs.readFileSync(
      path.join(dir, '.factory', 'attempts', `${attemptId}.json`),
      'utf8',
    ));
    assert.equal(stored.evidence.review?.verdict, verdict);
    assert.equal(stored.evidence.review?.role, role);
    assert.equal(
      readArgvLog(logPath).length,
      0,
      'accept with no pull request record must not call the forge',
    );
  } finally {
    cleanup(dir);
  }
});

test('security-reviewer handoff stores a verdict when no pull request record exists and does not call the forge', async () => {
  const dir = tempProject();
  const change = 'demo-security-without-pr';
  const attemptId = '11111111-2222-4333-8444-555555555555';
  const verdict = 'ACCEPT';
  const role = 'security-reviewer';
  const logPath = path.join(dir, 'forge-argv.log');
  const dbPath = path.join(dir, 'forge-db.json');
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const forgeEnv = {
      IDEFACTORY_FORGE: fakeForge,
      IDEFACTORY_FORGE_LOG: logPath,
      IDEFACTORY_FORGE_DB: dbPath,
    };
    assert.equal(
      fs.existsSync(path.join(dir, '.factory', 'pull-requests', `${change}.json`)),
      false,
    );
    writeAttempt(dir, securityCheckingAttempt(attemptId, change));

    const handedOff = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'awaiting-review',
      '--evidence', JSON.stringify({ verdict }),
    ], forgeEnv);
    assert.equal(handedOff.code, 0, handedOff.err || handedOff.out);

    const stored = JSON.parse(fs.readFileSync(
      path.join(dir, '.factory', 'attempts', `${attemptId}.json`),
      'utf8',
    ));
    assert.equal(stored.evidence.review ?? null, null);
    assert.equal(stored.evidence.securityReview?.verdict, verdict);
    assert.equal(stored.evidence.securityReview?.role, role);
    assert.equal(
      readArgvLog(logPath).length,
      0,
      'a security-reviewer verdict with no pull request record must not call the forge',
    );
  } finally {
    cleanup(dir);
  }
});
