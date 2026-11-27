import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  closeLatestRunSession,
  createRunSession,
  resolveNewSessionBudgets,
} from '../src/lib/run-session.mjs';
import { updateWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { azDb, azEnv, azLog, readJsonLines, writeChange } from './az-helpers.mjs';

const ORG = 'https://dev.azure.com/contoso';
const CHANGE = 'one-click-checkout';

function readConfig(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.factory', 'config.json'), 'utf8'));
}

function boardRecord(dir, change = CHANGE) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.factory', 'boards', `${change}.json`), 'utf8'));
}

async function setupBoard(dir) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  assert.equal((await idefactory(dir, ['setup', '--governance', 'lightweight', '--no-test'])).code, 0);
  const configured = await idefactory(dir, [
    'board', 'configure', '--organization', ORG, '--project', 'Shop', '--transport', 'az',
  ]);
  assert.equal(configured.code, 0, configured.err || configured.out);
  writeChange(dir, CHANGE);
}

function workItem(dir, id) {
  return azDb(dir).workItems[String(id)];
}

test('board commands fail without board config and never call the client', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeChange(dir, CHANGE);
    const env = azEnv(dir);
    for (const args of [
      ['board', 'publish', CHANGE],
      ['board', 'comment', CHANGE, '--message', 'hi', '--key', 'k'],
      ['board', 'transition', CHANGE, '--to', 'in-progress'],
      ['board', 'report', CHANGE],
    ]) {
      const result = await idefactory(dir, args, env);
      assert.notEqual(result.code, 0, args.join(' '));
      assert.match(result.err, /board is not configured/);
    }
    assert.equal(azLog(dir).length, 0);
  } finally {
    cleanup(dir);
  }
});

test('board configure fills defaults and refuses a missing project', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const before = fs.readFileSync(path.join(dir, '.factory', 'config.json'), 'utf8');
    const missing = await idefactory(dir, ['board', 'configure', '--organization', ORG]);
    assert.notEqual(missing.code, 0);
    assert.equal(fs.readFileSync(path.join(dir, '.factory', 'config.json'), 'utf8'), before);

    const ok = await idefactory(dir, [
      'board', 'configure', '--organization', `${ORG}/`, '--project', 'Shop',
      '--state-ready', 'Factory Ready',
    ]);
    assert.equal(ok.code, 0, ok.err);
    const { board } = readConfig(dir);
    assert.equal(board.provider, 'azure-devops');
    assert.equal(board.transport, 'mcp');
    assert.equal(board.organization, ORG);
    assert.equal(board.workItemType, 'User Story');
    assert.equal(board.tag, 'factory');
    assert.equal(board.changeField, 'Custom.OpenSpecChange');
    assert.equal(board.branchField, 'Custom.FactoryBranch');
    assert.equal(board.runUrlField, 'Custom.FactoryRunUrl');
    assert.equal(board.states.ready, 'Factory Ready');
    assert.equal(board.states.inProgress, 'In Progress');
    assert.equal(board.states.readyForHumanReview, 'Ready for Human Review');
  } finally {
    cleanup(dir);
  }
});

test('board publish creates one story and updates it on the second publish', async () => {
  const dir = tempProject();
  try {
    await setupBoard(dir);
    const env = azEnv(dir, { ADO_TOKEN: 'secret-board-token' });

    const missing = await idefactory(dir, ['board', 'publish', 'no-such-change'], env);
    assert.notEqual(missing.code, 0);
    assert.equal(azLog(dir).length, 0);

    const first = await idefactory(dir, ['board', 'publish', CHANGE], env);
    assert.equal(first.code, 0, first.err || first.out);
    fs.appendFileSync(path.join(dir, 'openspec', 'changes', CHANGE, 'tasks.md'), '- [ ] 1.3 Third task\n');
    const second = await idefactory(dir, ['board', 'publish', CHANGE], env);
    assert.equal(second.code, 0, second.err || second.out);

    const log = azLog(dir);
    assert.equal(log.filter((argv) => argv.slice(0, 3).join(' ') === 'boards work-item create').length, 1);
    assert.equal(log.filter((argv) => argv.slice(0, 3).join(' ') === 'boards work-item update').length, 1);
    for (const argv of log) assert.ok(!argv.join(' ').includes('secret-board-token'));
    for (const entry of readJsonLines(path.join(dir, 'az-env.log'))) assert.equal(entry.pat, 'present');

    const record = boardRecord(dir);
    assert.equal(record.change, CHANGE);
    assert.equal(record.workItem.id, 100);
    assert.equal(record.workItem.url, `${ORG}/Shop/_workitems/edit/100`);
    assert.equal(record.state, 'new');

    const story = workItem(dir, 100);
    assert.equal(story.fields['System.WorkItemType'], 'User Story');
    assert.equal(story.fields['System.Title'], CHANGE);
    assert.equal(story.fields['System.Tags'], 'factory');
    assert.equal(story.fields['Custom.OpenSpecChange'], CHANGE);
    const description = story.fields['System.Description'];
    assert.match(description, /&lt;faster&gt; checkout &amp; fewer steps/);
    assert.match(description, /1\.3 Third task/);
    assert.doesNotMatch(description, /<faster>/);

    const third = await idefactory(dir, ['board', 'publish', CHANGE], env);
    assert.equal(third.code, 0);
    assert.equal(azLog(dir).length, log.length, 'unchanged description sends nothing');
  } finally {
    cleanup(dir);
  }
});

test('board transition accepts only agent states and comments post once per key', async () => {
  const dir = tempProject();
  try {
    await setupBoard(dir);
    const env = azEnv(dir);
    assert.equal((await idefactory(dir, ['board', 'publish', CHANGE], env)).code, 0);
    const calls = azLog(dir).length;

    for (const to of ['ready', 'new', 'done', 'closed', 'Ready for Factory']) {
      const refused = await idefactory(dir, ['board', 'transition', CHANGE, '--to', to], env);
      assert.notEqual(refused.code, 0, to);
    }
    assert.equal(azLog(dir).length, calls);

    const moved = await idefactory(dir, [
      'board', 'transition', CHANGE, '--to', 'waiting', '--note', 'Needs approval for 1.2',
    ], env);
    assert.equal(moved.code, 0, moved.err);
    assert.equal(workItem(dir, 100).fields['System.State'], 'Waiting on Human');
    assert.deepEqual(workItem(dir, 100).comments, ['Needs approval for 1.2']);
    assert.equal(boardRecord(dir).state, 'waiting');

    assert.equal((await idefactory(dir, ['board', 'comment', CHANGE, '--message', 'hello', '--key', 'greet'], env)).code, 0);
    assert.equal((await idefactory(dir, ['board', 'comment', CHANGE, '--message', 'hello', '--key', 'greet'], env)).code, 0);
    assert.deepEqual(workItem(dir, 100).comments, ['Needs approval for 1.2', 'hello']);
  } finally {
    cleanup(dir);
  }
});

test('board report posts done tasks once and mirrors gates and pull requests', async () => {
  const dir = tempProject();
  try {
    await setupBoard(dir);
    const env = azEnv(dir);
    assert.equal((await idefactory(dir, ['sync-tasks', CHANGE])).code, 0);
    assert.equal((await idefactory(dir, ['board', 'publish', CHANGE], env)).code, 0);

    updateWorkItem(dir, CHANGE, '1.1', { status: 'done', attemptId: 'attempt-one' });
    assert.equal((await idefactory(dir, ['board', 'report', CHANGE], env)).code, 0);
    assert.equal((await idefactory(dir, ['board', 'report', CHANGE], env)).code, 0);
    let story = workItem(dir, 100);
    const taskComments = story.comments.filter((text) => /1\.1/.test(text));
    assert.equal(taskComments.length, 1);
    assert.match(taskComments[0], /attempt-one/);
    assert.equal(story.fields['System.State'], 'In Progress');

    createRunSession(dir, { change: CHANGE, budgets: resolveNewSessionBudgets({}, {}) });
    closeLatestRunSession(dir, CHANGE, 'human-gate');
    assert.equal((await idefactory(dir, ['board', 'report', CHANGE], env)).code, 0);
    story = workItem(dir, 100);
    assert.equal(story.fields['System.State'], 'Waiting on Human');
    assert.match(story.comments.at(-1), /human-gate/);

    fs.writeFileSync(path.join(dir, 'HALT'), 'stop\n');
    const halted = await idefactory(dir, ['board', 'report', CHANGE], env);
    assert.equal(halted.code, 0, halted.err);
    assert.equal(workItem(dir, 100).fields['System.State'], 'Blocked');
    assert.ok(fs.existsSync(path.join(dir, 'HALT')), 'report never clears HALT');
    fs.unlinkSync(path.join(dir, 'HALT'));

    fs.mkdirSync(path.join(dir, '.factory', 'pull-requests'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.factory', 'pull-requests', `${CHANGE}.json`), JSON.stringify({
      change: CHANGE,
      branch: `factory/${CHANGE}`,
      pullRequest: { number: 4, url: `${ORG}/Shop/_git/web/pullrequest/4` },
    }));
    assert.equal((await idefactory(dir, ['board', 'report', CHANGE], env)).code, 0);
    assert.equal(workItem(dir, 100).fields['System.State'], 'In Review');

    updateWorkItem(dir, CHANGE, '1.2', { status: 'done', attemptId: 'attempt-two' });
    assert.equal((await idefactory(dir, ['board', 'report', CHANGE], env)).code, 0);
    assert.equal((await idefactory(dir, ['board', 'report', CHANGE], env)).code, 0);
    story = workItem(dir, 100);
    assert.equal(story.fields['System.State'], 'Ready for Human Review');
    assert.equal(story.relations.length, 1, 'pull request is linked once');
    assert.equal(story.relations[0].url, `${ORG}/Shop/_git/web/pullrequest/4`);
    for (const text of story.comments) assert.doesNotMatch(text, /stdout|npm test output/);
  } finally {
    cleanup(dir);
  }
});

test('doctor stays green without board, forge, or ADO_TOKEN and rejects bad integration config', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.equal((await idefactory(dir, ['setup', '--governance', 'lightweight', '--no-test'])).code, 0);
    const healthy = await idefactory(dir, ['doctor'], { ADO_TOKEN: '', AZURE_DEVOPS_EXT_PAT: '' });
    assert.equal(healthy.code, 0, healthy.out);

    const configFile = path.join(dir, '.factory', 'config.json');
    const config = readConfig(dir);
    config.board = {
      provider: 'azure-devops',
      organization: ORG,
      project: 'Shop',
      states: { ready: 'In Progress', inProgress: 'In Progress' },
    };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    const collision = await idefactory(dir, ['doctor']);
    assert.notEqual(collision.code, 0);
    assert.match(collision.out, /board/);

    delete config.board;
    config.forge = { provider: 'azure-devops', organization: ORG, project: 'Shop' };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    const forge = await idefactory(dir, ['doctor']);
    assert.notEqual(forge.code, 0);
    assert.match(forge.out, /forge\.repository/);
  } finally {
    cleanup(dir);
  }
});
