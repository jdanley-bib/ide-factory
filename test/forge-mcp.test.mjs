import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { isDeliverableChange } from '../src/lib/pull-request.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { azEnv, azLog, commitAll } from './az-helpers.mjs';

const ORG = 'https://dev.azure.com/contoso';
const CHANGE = 'one-click-checkout';
const ATTEMPT = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001';

const COMPLETION_ARGUMENTS = ['autoComplete', 'bypassReason', 'vote', 'status', 'mergeStrategy', 'deleteSourceBranch'];

function recordFile(dir) {
  return path.join(dir, '.factory', 'pull-requests', `${CHANGE}.json`);
}

function planIdFrom(output) {
  const match = output.match(/plan-[0-9a-f]{12}/);
  assert.ok(match, `no plan id in: ${output}`);
  return match[0];
}

function readPlan(dir, id) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.factory', 'mcp', `${id}.json`), 'utf8'));
}

function assertNoAzureCall(dir) {
  assert.deepEqual(azLog(dir), []);
  assert.equal(fs.existsSync(path.join(dir, 'az-env.log')), false);
}

async function azureProject(dir, extra = []) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  const configured = await idefactory(dir, [
    'forge', 'configure', '--provider', 'azure-devops',
    '--organization', ORG, '--project', 'Shop', '--repository', 'web', ...extra,
  ]);
  assert.equal(configured.code, 0, configured.err || configured.out);
  commitAll(dir);
}

function writeAttempt(dir, state = 'accepted') {
  fs.mkdirSync(path.join(dir, '.factory', 'attempts'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.factory', 'attempts', `${ATTEMPT}.json`), JSON.stringify({
    id: ATTEMPT,
    change: CHANGE,
    taskId: '1.1',
    state,
    implementerRole: 'engineer',
    implementerId: 'engineer-a',
    reviewerId: 'reviewer-b',
    modelProfile: 'coding-standard',
    evidence: {
      red: null,
      verification: [],
      security: [],
      review: { verdict: 'ACCEPT', role: 'reviewer', reviewerId: 'reviewer-b' },
      changedFiles: [],
      baseRev: null,
    },
    history: [],
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
  }, null, 2));
}

function writeBoardRecord(dir, id) {
  fs.mkdirSync(path.join(dir, '.factory', 'boards'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.factory', 'boards', `${CHANGE}.json`), JSON.stringify({
    change: CHANGE,
    workItem: { id },
  }));
}

test('forge configure defaults the Azure transport to mcp and the target branch to main', async () => {
  const dir = tempProject();
  try {
    await azureProject(dir);
    const config = JSON.parse(fs.readFileSync(path.join(dir, '.factory', 'config.json'), 'utf8'));
    assert.equal(config.forge.transport, 'mcp');
    assert.equal(config.forge.targetBranch, 'main');
    const bad = await idefactory(dir, [
      'forge', 'configure', '--provider', 'azure-devops',
      '--organization', ORG, '--project', 'Shop', '--repository', 'web', '--transport', 'ftp',
    ]);
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /forge\.transport/);
  } finally {
    cleanup(dir);
  }
});

test('pr open prints a create plan with the target branch and linked story, and ack stores the web URL', async () => {
  const dir = tempProject();
  try {
    await azureProject(dir, ['--target-branch', 'release']);
    writeBoardRecord(dir, 42);
    const env = azEnv(dir, { ADO_TOKEN: 'secret-ado-token-value' });
    const opened = await idefactory(dir, ['pr', 'open', CHANGE], env);
    assert.equal(opened.code, 0, opened.err || opened.out);
    assert.match(opened.out, /repo_pull_request_write/);
    assert.equal(fs.existsSync(recordFile(dir)), false);

    const plan = readPlan(dir, planIdFrom(opened.out));
    assert.equal(plan.operations.length, 1);
    const args = plan.operations[0].arguments;
    assert.equal(args.action, 'create');
    assert.equal(args.orgName, 'contoso');
    assert.equal(args.project, 'Shop');
    assert.equal(args.repositoryId, 'web');
    assert.equal(args.sourceRefName, `refs/heads/factory/${CHANGE}`);
    assert.equal(args.targetRefName, 'refs/heads/release');
    assert.equal(args.title, CHANGE);
    assert.equal(args.workItems, '42');
    assert.match(args.description, new RegExp(`# ${CHANGE}`));
    for (const name of COMPLETION_ARGUMENTS) assert.equal(name in args, false, name);
    assertNoAzureCall(dir);

    const missing = await idefactory(dir, ['mcp', 'ack', plan.id, '--result', '{}']);
    assert.notEqual(missing.code, 0);
    assert.match(missing.err, /pullRequestId/);
    const acked = await idefactory(dir, ['mcp', 'ack', plan.id, '--result', '{"pullRequestId": 3}']);
    assert.equal(acked.code, 0, acked.err || acked.out);
    const record = JSON.parse(fs.readFileSync(recordFile(dir), 'utf8'));
    assert.equal(record.provider, 'azure-devops');
    assert.equal(record.pullRequest.number, 3);
    assert.equal(record.pullRequest.url, `${ORG}/Shop/_git/web/pullrequest/3`);
    assert.equal(isDeliverableChange(dir, CHANGE), true);

    const second = await idefactory(dir, ['pr', 'open', CHANGE], env);
    assert.equal(second.code, 0, second.err || second.out);
    const update = readPlan(dir, planIdFrom(second.out)).operations[0].arguments;
    assert.deepEqual(Object.keys(update).sort(), [
      'action', 'description', 'orgName', 'project', 'pullRequestId', 'repositoryId',
    ]);
    assert.equal(update.pullRequestId, 3);
    assertNoAzureCall(dir);
  } finally {
    cleanup(dir);
  }
});

test('a pull request description over 4000 characters is truncated in the plan', async () => {
  const dir = tempProject();
  try {
    await azureProject(dir);
    const attempts = path.join(dir, '.factory', 'attempts');
    fs.mkdirSync(attempts, { recursive: true });
    for (let index = 0; index < 120; index += 1) {
      const id = `bbbbbbbb-bbbb-4ccc-8ddd-${String(index).padStart(12, '0')}`;
      fs.writeFileSync(path.join(attempts, `${id}.json`), JSON.stringify({
        id, change: CHANGE, taskId: '1.1', state: 'accepted', evidence: {}, history: [],
      }));
    }
    commitAll(dir);
    const opened = await idefactory(dir, ['pr', 'open', CHANGE], azEnv(dir));
    assert.equal(opened.code, 0, opened.err || opened.out);
    const { description } = readPlan(dir, planIdFrom(opened.out)).operations[0].arguments;
    assert.ok(description.length <= 4000, `description is ${description.length} characters`);
    assert.match(description, /Truncated for Azure DevOps/);
  } finally {
    cleanup(dir);
  }
});

test('pr comment prints one thread plan and ack records the verdict once', async () => {
  const dir = tempProject();
  try {
    await azureProject(dir);
    const env = azEnv(dir);
    const opened = await idefactory(dir, ['pr', 'open', CHANGE], env);
    assert.equal((await idefactory(dir, ['mcp', 'ack', planIdFrom(opened.out), '--result', '{"pullRequestId": 3}'])).code, 0);
    writeAttempt(dir);

    const posted = await idefactory(dir, ['pr', 'comment', ATTEMPT], env);
    assert.equal(posted.code, 0, posted.err || posted.out);
    const plan = readPlan(dir, planIdFrom(posted.out));
    assert.equal(plan.operations.length, 1);
    assert.equal(plan.operations[0].tool, 'repo_pull_request_thread_write');
    const args = plan.operations[0].arguments;
    assert.equal(args.action, 'create');
    assert.equal(args.pullRequestId, 3);
    assert.equal(args.repositoryId, 'web');
    assert.match(args.content, /Verdict: ACCEPT/);
    assert.match(args.content, new RegExp(ATTEMPT));
    assert.deepEqual(JSON.parse(fs.readFileSync(recordFile(dir), 'utf8')).postedVerdicts, []);

    assert.equal((await idefactory(dir, ['mcp', 'ack', plan.id])).code, 0);
    assert.equal(JSON.parse(fs.readFileSync(recordFile(dir), 'utf8')).postedVerdicts.length, 1);
    const again = await idefactory(dir, ['pr', 'comment', ATTEMPT], env);
    assert.equal(again.code, 0, again.err || again.out);
    assert.doesNotMatch(again.out, /plan-[0-9a-f]{12}/);
    assertNoAzureCall(dir);
  } finally {
    cleanup(dir);
  }
});

test('an attempt transition does not post a verdict by itself with the mcp transport', async () => {
  const dir = tempProject();
  try {
    await azureProject(dir);
    const env = azEnv(dir);
    const opened = await idefactory(dir, ['pr', 'open', CHANGE], env);
    assert.equal((await idefactory(dir, ['mcp', 'ack', planIdFrom(opened.out), '--result', '{"pullRequestId": 3}'])).code, 0);
    writeAttempt(dir, 'security-checking');
    const file = path.join(dir, '.factory', 'attempts', `${ATTEMPT}.json`);
    const attempt = JSON.parse(fs.readFileSync(file, 'utf8'));
    attempt.evidence.review = null;
    fs.writeFileSync(file, JSON.stringify(attempt));

    const handedOff = await idefactory(dir, [
      'attempt', 'transition', ATTEMPT, 'awaiting-review', '--evidence', JSON.stringify({ verdict: 'ACCEPT' }),
    ], env);
    assert.equal(handedOff.code, 0, handedOff.err || handedOff.out);
    assert.deepEqual(JSON.parse(fs.readFileSync(recordFile(dir), 'utf8')).postedVerdicts, []);
    assert.deepEqual(fs.readdirSync(path.join(dir, '.factory', 'mcp')), []);
    assertNoAzureCall(dir);
  } finally {
    cleanup(dir);
  }
});

test('pr capture reads a threads file, stores one human comment once, and skips system comments', async () => {
  const dir = tempProject();
  try {
    await azureProject(dir);
    const env = azEnv(dir);
    const opened = await idefactory(dir, ['pr', 'open', CHANGE], env);
    assert.equal((await idefactory(dir, ['mcp', 'ack', planIdFrom(opened.out), '--result', '{"pullRequestId": 3}'])).code, 0);

    const missing = await idefactory(dir, ['pr', 'capture', CHANGE], env);
    assert.notEqual(missing.code, 0);
    assert.match(missing.err, /--threads-file/);
    assert.match(missing.err, /repo_pull_request_thread/);

    const threads = path.join(dir, 'threads.json');
    fs.writeFileSync(threads, JSON.stringify({
      value: [{
        id: 7,
        comments: [
          {
            id: 1,
            content: 'Please rename the button',
            commentType: 'text',
            author: { uniqueName: 'human@contoso.com' },
            publishedDate: '2026-11-19T10:00:00Z',
          },
          { id: 2, content: 'Policy updated', commentType: 'system', author: { uniqueName: 'bot@contoso.com' } },
        ],
      }],
    }));
    for (let run = 0; run < 2; run += 1) {
      const captured = await idefactory(dir, ['pr', 'capture', CHANGE, '--threads-file', threads], env);
      assert.equal(captured.code, 0, captured.err || captured.out);
    }
    const record = JSON.parse(fs.readFileSync(recordFile(dir), 'utf8'));
    assert.equal(record.capturedComments.length, 1);
    assert.equal(record.capturedComments[0].id, '7:1');
    assert.equal(record.capturedComments[0].author, 'human@contoso.com');
    assert.equal(record.capturedComments[0].body, 'Please rename the button');
    assertNoAzureCall(dir);
  } finally {
    cleanup(dir);
  }
});

test('GitHub stays the default and still calls gh, not plans', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    commitAll(dir);
    const forgeLog = path.join(dir, 'forge-argv.log');
    const opened = await idefactory(dir, ['pr', 'open', CHANGE], {
      IDEFACTORY_FORGE: path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'support', 'fake-forge.mjs'),
      IDEFACTORY_FORGE_LOG: forgeLog,
      IDEFACTORY_FORGE_DB: path.join(dir, 'forge-db.json'),
    });
    assert.equal(opened.code, 0, opened.err || opened.out);
    assert.doesNotMatch(opened.out, /plan-[0-9a-f]{12}/);
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'mcp')), false);
  } finally {
    cleanup(dir);
  }
});
