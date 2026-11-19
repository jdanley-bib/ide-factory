import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { assertSafeForgeArgv } from '../src/lib/forge.mjs';
import { isDeliverableChange } from '../src/lib/pull-request.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { azDb, azEnv, azLog, commitAll, readJsonLines, writeAzDb } from './az-helpers.mjs';

const ORG = 'https://dev.azure.com/contoso';

function readConfig(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.factory', 'config.json'), 'utf8'));
}

async function configureAzure(dir) {
  const result = await idefactory(dir, [
    'forge', 'configure', '--provider', 'azure-devops',
    '--organization', ORG, '--project', 'Shop', '--repository', 'web',
  ]);
  assert.equal(result.code, 0, result.err || result.out);
}

test('forge configure refuses azure-devops without a repository and an unknown provider', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const before = fs.readFileSync(path.join(dir, '.factory', 'config.json'), 'utf8');
    const missing = await idefactory(dir, [
      'forge', 'configure', '--provider', 'azure-devops', '--organization', ORG, '--project', 'Shop',
    ]);
    assert.notEqual(missing.code, 0);
    assert.match(missing.err, /repository/);
    const unknown = await idefactory(dir, ['forge', 'configure', '--provider', 'gitea']);
    assert.notEqual(unknown.code, 0);
    assert.equal(fs.readFileSync(path.join(dir, '.factory', 'config.json'), 'utf8'), before);

    await configureAzure(dir);
    assert.deepEqual(readConfig(dir).forge, {
      provider: 'azure-devops',
      organization: ORG,
      project: 'Shop',
      repository: 'web',
    });
    const back = await idefactory(dir, ['forge', 'configure', '--provider', 'github']);
    assert.equal(back.code, 0, back.err);
    assert.deepEqual(readConfig(dir).forge, { provider: 'github' });
  } finally {
    cleanup(dir);
  }
});

test('azure pr open creates once, updates on the second open, and records the web URL', async () => {
  const dir = tempProject();
  const change = 'one-click-checkout';
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    await configureAzure(dir);
    commitAll(dir);
    const env = azEnv(dir, { ADO_TOKEN: 'secret-ado-token-value' });

    const first = await idefactory(dir, ['pr', 'open', change], env);
    assert.equal(first.code, 0, first.err || first.out);
    const second = await idefactory(dir, ['pr', 'open', change], env);
    assert.equal(second.code, 0, second.err || second.out);

    const log = azLog(dir);
    const creates = log.filter((argv) => argv.slice(0, 3).join(' ') === 'repos pr create');
    const updates = log.filter((argv) => argv.slice(0, 3).join(' ') === 'repos pr update');
    assert.equal(creates.length, 1);
    assert.equal(updates.length, 1);
    assert.equal(creates[0][creates[0].indexOf('--source-branch') + 1], `factory/${change}`);
    assert.equal(creates[0][creates[0].indexOf('--repository') + 1], 'web');
    for (const argv of log) {
      assert.ok(!argv.join(' ').includes('secret-ado-token-value'), 'token must not reach argv');
    }
    for (const entry of readJsonLines(path.join(dir, 'az-env.log'))) {
      assert.equal(entry.pat, 'present');
    }

    const record = JSON.parse(fs.readFileSync(
      path.join(dir, '.factory', 'pull-requests', `${change}.json`),
      'utf8',
    ));
    assert.equal(record.provider, 'azure-devops');
    assert.equal(record.pullRequest.number, 1);
    assert.equal(record.pullRequest.url, `${ORG}/Shop/_git/web/pullrequest/1`);
    assert.equal(isDeliverableChange(dir, change), true);
  } finally {
    cleanup(dir);
  }
});

test('azure pr comment adds one thread and capture stores human comments once', async () => {
  const dir = tempProject();
  const change = 'review-loop';
  const attemptId = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001';
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    await configureAzure(dir);
    commitAll(dir);
    const env = azEnv(dir);
    assert.equal((await idefactory(dir, ['pr', 'open', change], env)).code, 0);

    fs.writeFileSync(path.join(dir, '.factory', 'attempts', `${attemptId}.json`), JSON.stringify({
      id: attemptId,
      change,
      taskId: '1.1',
      state: 'accepted',
      implementerRole: 'engineer',
      implementerId: 'engineer-a',
      reviewerId: 'reviewer-b',
      evidence: { review: { verdict: 'ACCEPT', role: 'reviewer', reviewerId: 'reviewer-b' } },
      history: [],
    }, null, 2));

    const posted = await idefactory(dir, ['pr', 'comment', attemptId], env);
    assert.equal(posted.code, 0, posted.err || posted.out);
    const again = await idefactory(dir, ['pr', 'comment', attemptId], env);
    assert.equal(again.code, 0, again.err || again.out);
    const threads = azDb(dir).threads['1'];
    assert.equal(threads.length, 1, 'one thread for the stored verdict');
    assert.match(threads[0].comments[0].content, /ACCEPT/);
    assert.match(threads[0].comments[0].content, new RegExp(attemptId));

    const db = azDb(dir);
    db.threads['1'].push({
      id: 7,
      comments: [
        {
          id: 1,
          content: 'Please rename the button',
          commentType: 'text',
          author: { uniqueName: 'human@contoso.com' },
          publishedDate: '2026-11-19T10:00:00Z',
        },
        {
          id: 2,
          content: 'Policy status changed',
          commentType: 'system',
          author: { uniqueName: 'system' },
          publishedDate: '2026-11-19T10:01:00Z',
        },
      ],
    });
    writeAzDb(dir, db);

    assert.equal((await idefactory(dir, ['pr', 'capture', change], env)).code, 0);
    assert.equal((await idefactory(dir, ['pr', 'capture', change], env)).code, 0);
    const record = JSON.parse(fs.readFileSync(
      path.join(dir, '.factory', 'pull-requests', `${change}.json`),
      'utf8',
    ));
    const human = record.capturedComments.filter((item) => item.id === '7:1');
    assert.equal(human.length, 1);
    assert.equal(human[0].author, 'human@contoso.com');
    assert.equal(human[0].body, 'Please rename the button');
    assert.ok(!record.capturedComments.some((item) => item.id === '7:2'), 'system comments are skipped');
  } finally {
    cleanup(dir);
  }
});

test('forge argv that could complete or bypass policy is refused', () => {
  for (const argv of [
    ['az', 'repos', 'pr', 'update', '--id', '1', '--auto-complete', 'true'],
    ['az', 'repos', 'pr', 'update', '--id', '1', '--status', 'completed'],
    ['az', 'repos', 'pr', 'update', '--id', '1', '--bypass-policy', 'true'],
    ['az', 'repos', 'policy', 'list'],
    ['az', 'repos', 'ref', 'delete', '--name', 'heads/main'],
    ['gh', 'pr', 'merge', '1'],
  ]) {
    assert.throws(() => assertSafeForgeArgv(argv), /must not/);
  }
  assert.doesNotThrow(() => assertSafeForgeArgv(['az', 'repos', 'pr', 'update', '--id', '1', '--description', 'x']));
});

test('github stays the default forge with no forge config', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.equal(readConfig(dir).forge, undefined);
    commitAll(dir);
    const env = azEnv(dir, { IDEFACTORY_FORGE: path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'support', 'fake-forge.mjs') });
    const opened = await idefactory(dir, ['pr', 'open', 'gh-default'], {
      ...env,
      IDEFACTORY_FORGE_LOG: path.join(dir, 'gh.log'),
      IDEFACTORY_FORGE_DB: path.join(dir, 'gh-db.json'),
    });
    assert.equal(opened.code, 0, opened.err || opened.out);
    const gh = readJsonLines(path.join(dir, 'gh.log'));
    assert.deepEqual(gh[0].slice(0, 2), ['pr', 'create']);
    assert.equal(azLog(dir).length, 0);
  } finally {
    cleanup(dir);
  }
});
