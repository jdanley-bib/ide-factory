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
