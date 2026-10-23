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

test('pr open records one pull request per change; second open updates the same record', async () => {
  const dir = tempProject();
  const change = 'demo-outer-loop';
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

    const first = await idefactory(dir, ['pr', 'open', change], forgeEnv);
    assert.equal(first.code, 0, first.err || first.out);

    const recordPath = path.join(dir, '.factory', 'pull-requests', `${change}.json`);
    assert.ok(fs.existsSync(recordPath), 'first open must write a local pull request record');
    const firstRecord = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    assert.equal(firstRecord.change, change);
    assert.equal(firstRecord.branch, `factory/${change}`);
    assert.equal(typeof firstRecord.pullRequest?.number, 'number');
    assert.ok(firstRecord.pullRequest.number > 0);
    const firstNumber = firstRecord.pullRequest.number;

    const afterFirst = readArgvLog(logPath);
    assert.equal(
      afterFirst.filter((argv) => argv[0] === 'pr' && argv[1] === 'create').length,
      1,
      'first open must issue exactly one forge create',
    );
    assertSafeForgeArgv(afterFirst);

    const second = await idefactory(dir, ['pr', 'open', change], forgeEnv);
    assert.equal(second.code, 0, second.err || second.out);

    const secondRecord = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    assert.equal(secondRecord.change, change);
    assert.equal(secondRecord.branch, `factory/${change}`);
    assert.equal(
      secondRecord.pullRequest.number,
      firstNumber,
      'second open must keep the same pull request identity',
    );

    const afterSecond = readArgvLog(logPath);
    assert.equal(
      afterSecond.filter((argv) => argv[0] === 'pr' && argv[1] === 'create').length,
      1,
      'second open must not create another pull request',
    );
    assert.equal(
      afterSecond.filter((argv) => argv[0] === 'pr' && argv[1] === 'edit').length,
      1,
      'second open must update the existing pull request',
    );
    assertSafeForgeArgv(afterSecond);

    const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', `factory/${change}`], {
      cwd: dir,
      encoding: 'utf8',
      shell: false,
    });
    assert.equal(branch.status, 0, `stable branch factory/${change} must exist`);
  } finally {
    cleanup(dir);
  }
});

function bodyFromCreateArgv(argvLists) {
  const create = argvLists.find((argv) => argv[0] === 'pr' && argv[1] === 'create');
  assert.ok(create, 'expected a forge pr create argv');
  const index = create.indexOf('--body');
  assert.ok(index >= 0 && create[index + 1], 'create argv must include --body');
  return create[index + 1];
}

test('pr open body links source revision and attempt id; omits check logs and env values', async () => {
  const dir = tempProject();
  const change = 'demo-body-links';
  const attemptId = '11111111-2222-4333-8444-555555555555';
  const logPath = path.join(dir, 'forge-argv.log');
  const dbPath = path.join(dir, 'forge-db.json');
  const checkLogMarker = 'CHECK_LOG_SHOULD_NOT_APPEAR_IN_BODY';
  const envMarker = 'ENV_VALUE_SHOULD_NOT_APPEAR_IN_BODY';
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.mkdirSync(path.join(dir, 'openspec/changes', change), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'openspec/changes', change, 'tasks.md'),
      '- [ ] 1.1 Body links\n',
    );
    assert.equal((await idefactory(dir, ['sync-tasks', change])).code, 0);

    const head = ensureCleanGitCommit(dir);
    fs.mkdirSync(path.join(dir, '.factory', 'attempts'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.factory', 'attempts', `${attemptId}.json`),
      `${JSON.stringify({
        id: attemptId,
        change,
        taskId: '1.1',
        state: 'awaiting-review',
        implementerRole: 'engineer',
        implementerId: 'engineer-body',
        reviewerId: null,
        modelProfile: 'coding-standard',
        evidence: {
          red: null,
          verification: [{
            schemaVersion: 1,
            kind: 'unit',
            exitCode: 0,
            passed: true,
            issuer: 'cli',
            sourceRevision: head,
            logDigest: 'sha256:deadbeef',
            stdout: checkLogMarker,
          }],
          security: [],
          review: null,
          changedFiles: [],
          baseRev: null,
        },
        history: [],
        createdAt: '2026-10-23T00:00:00.000Z',
        updatedAt: '2026-10-23T00:00:00.000Z',
      }, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(dir, '.factory', 'attempts', `${attemptId}.unit.log`),
      `${checkLogMarker}\nnpm test output that must stay out of the pull request body\n`,
    );

    const opened = await idefactory(dir, ['pr', 'open', change], {
      IDEFACTORY_FORGE: fakeForge,
      IDEFACTORY_FORGE_LOG: logPath,
      IDEFACTORY_FORGE_DB: dbPath,
      IDEFACTORY_TEST_SECRET: envMarker,
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    });
    assert.equal(opened.code, 0, opened.err || opened.out);

    const body = bodyFromCreateArgv(readArgvLog(logPath));
    assert.match(body, new RegExp(change));
    assert.match(body, new RegExp(head));
    assert.match(body, new RegExp(attemptId));
    assert.doesNotMatch(body, new RegExp(checkLogMarker));
    assert.doesNotMatch(body, new RegExp(envMarker));
    assert.doesNotMatch(body, /IDEFACTORY_TEST_SECRET/);
  } finally {
    cleanup(dir);
  }
});

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

test('pr comment posts the stored verdict and role; missing verdict writes nothing', async () => {
  const dir = tempProject();
  const change = 'demo-stored-verdict';
  const storedAttemptId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const missingAttemptId = 'ffffffff-1111-4222-8333-444444444444';
  const storedVerdict = 'ACCEPT';
  const storedRole = 'security-reviewer';
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

    const storedFile = writeAttempt(dir, {
      id: storedAttemptId,
      change,
      taskId: '1.1',
      state: 'accepted',
      implementerRole: 'engineer',
      implementerId: 'engineer-pr-loop',
      reviewerId: 'reviewer-stored',
      modelProfile: 'coding-standard',
      evidence: {
        red: null,
        verification: [],
        security: [],
        review: {
          verdict: storedVerdict,
          role: storedRole,
          reviewerId: 'reviewer-stored',
          notes: '',
        },
        changedFiles: [],
        baseRev: null,
      },
      history: [],
      createdAt: '2026-10-23T00:00:00.000Z',
      updatedAt: '2026-10-23T00:00:00.000Z',
    });
    const storedBefore = fs.readFileSync(storedFile, 'utf8');

    const posted = await idefactory(dir, ['pr', 'comment', storedAttemptId], forgeEnv);
    assert.equal(posted.code, 0, posted.err || posted.out);
    assert.equal(fs.readFileSync(storedFile, 'utf8'), storedBefore, 'posting must not rewrite the attempt');

    const bodies = commentBodies(readArgvLog(logPath));
    assert.equal(bodies.length, 1, 'forge receives one comment for the stored verdict');
    assert.match(bodies[0], new RegExp(storedVerdict));
    assert.match(bodies[0], new RegExp(storedRole));
    assertSafeForgeArgv(readArgvLog(logPath));

    const record = JSON.parse(fs.readFileSync(
      path.join(dir, '.factory', 'pull-requests', `${change}.json`),
      'utf8',
    ));
    assert.ok(
      record.postedVerdicts.some((item) => item.verdict === storedVerdict && item.role === storedRole
        && item.attemptId === storedAttemptId),
      'local record stores the posted verdict',
    );

    const missingFile = writeAttempt(dir, {
      id: missingAttemptId,
      change,
      taskId: '1.2',
      state: 'awaiting-review',
      implementerRole: 'engineer',
      implementerId: 'engineer-pr-loop',
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
      createdAt: '2026-10-23T00:00:00.000Z',
      updatedAt: '2026-10-23T00:00:00.000Z',
    });
    const missingBefore = fs.readFileSync(missingFile, 'utf8');
    const commentsBefore = commentBodies(readArgvLog(logPath)).length;

    const missing = await idefactory(dir, ['pr', 'comment', missingAttemptId], forgeEnv);
    assert.notEqual(missing.code, 0, 'missing verdict must exit non-zero');
    assert.equal(fs.readFileSync(missingFile, 'utf8'), missingBefore, 'missing verdict must not write a verdict');
    assert.equal(
      commentBodies(readArgvLog(logPath)).length,
      commentsBefore,
      'missing verdict must not post to the forge',
    );
    const afterMissing = JSON.parse(fs.readFileSync(missingFile, 'utf8'));
    assert.equal(afterMissing.evidence.review, null);
  } finally {
    cleanup(dir);
  }
});
