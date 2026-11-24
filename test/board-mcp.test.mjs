import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { updateWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { azEnv, azLog, readJsonLines, writeChange } from './az-helpers.mjs';

const ORG = 'https://dev.azure.com/contoso';
const CHANGE = 'one-click-checkout';
const RUN_URL = 'https://cursor.com/agents/bc-example';

function recordFile(dir) {
  return path.join(dir, '.factory', 'boards', `${CHANGE}.json`);
}

function readRecord(dir) {
  return JSON.parse(fs.readFileSync(recordFile(dir), 'utf8'));
}

function planIdFrom(output) {
  const match = output.match(/plan-[0-9a-f]{12}/);
  assert.ok(match, `no plan id in: ${output}`);
  return match[0];
}

function readPlan(dir, id) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.factory', 'mcp', `${id}.json`), 'utf8'));
}

function envWithToken(dir) {
  return azEnv(dir, { ADO_TOKEN: 'secret-ado-token-value' });
}

function assertNoAzureCall(dir) {
  assert.deepEqual(azLog(dir), [], 'the mcp transport must not run the Azure CLI');
  assert.equal(fs.existsSync(path.join(dir, 'az-env.log')), false);
}

async function configured(dir) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  assert.equal((await idefactory(dir, ['setup', '--governance', 'lightweight', '--no-test'])).code, 0);
  assert.equal((await idefactory(dir, [
    'board', 'configure', '--organization', ORG, '--project', 'Shop',
  ])).code, 0);
  writeChange(dir, CHANGE);
}

async function publishAndAck(dir, id = 42) {
  const published = await idefactory(dir, ['board', 'publish', CHANGE], envWithToken(dir));
  assert.equal(published.code, 0, published.err || published.out);
  const acked = await idefactory(dir, ['mcp', 'ack', planIdFrom(published.out), '--result', JSON.stringify({ workItemId: id })]);
  assert.equal(acked.code, 0, acked.err || acked.out);
}

function writeSnapshot(dir, { id = 42, rev = 7, state = 'Ready for Factory', tags = 'factory', change = CHANGE } = {}) {
  const file = path.join(dir, 'story.json');
  fs.writeFileSync(file, JSON.stringify({
    id,
    rev,
    fields: {
      'System.State': state,
      'System.Tags': tags,
      'Custom.OpenSpecChange': change,
    },
  }));
  return file;
}

async function claim(dir, extra = []) {
  const result = await idefactory(dir, [
    'board', 'claim', CHANGE, '--work-item', '42', '--run-url', RUN_URL, '--json', ...extra,
  ], envWithToken(dir));
  return { ...result, json: result.code === 0 ? JSON.parse(result.out) : null };
}

test('publish prints a create plan, stores the record only at ack, and starts no Azure CLI', async () => {
  const dir = tempProject();
  try {
    await configured(dir);
    const published = await idefactory(dir, ['board', 'publish', CHANGE], envWithToken(dir));
    assert.equal(published.code, 0, published.err || published.out);
    assert.match(published.out, /wit_work_item_write/);
    assert.match(published.out, /idefactory mcp ack plan-[0-9a-f]{12} --result/);
    assert.equal(fs.existsSync(recordFile(dir)), false);

    const plan = readPlan(dir, planIdFrom(published.out));
    assert.equal(plan.operations.length, 1);
    const args = plan.operations[0].arguments;
    assert.equal(args.action, 'create');
    assert.equal(args.orgName, 'contoso');
    assert.equal(args.project, 'Shop');
    assert.equal(args.workItemType, 'User Story');
    const byName = Object.fromEntries(args.fields.map((field) => [field.name, field]));
    assert.equal(byName['System.Title'].value, CHANGE);
    assert.equal(byName['System.Tags'].value, 'factory');
    assert.equal(byName['Custom.OpenSpecChange'].value, CHANGE);
    assert.equal(byName['System.Description'].format, 'Html');
    assert.match(byName['System.Description'].value, /&lt;faster&gt;/);
    assertNoAzureCall(dir);

    const again = await idefactory(dir, ['board', 'publish', CHANGE], envWithToken(dir));
    assert.equal(planIdFrom(again.out), plan.id, 'planning twice yields the same plan');

    const acked = await idefactory(dir, ['mcp', 'ack', plan.id, '--result', '{"workItemId": 42}']);
    assert.equal(acked.code, 0, acked.err || acked.out);
    const record = readRecord(dir);
    assert.deepEqual(record.workItem, { id: 42, url: `${ORG}/Shop/_workitems/edit/42` });
    assert.equal(record.state, 'new');

    const unchanged = await idefactory(dir, ['board', 'publish', CHANGE], envWithToken(dir));
    assert.match(unchanged.out, /Unchanged/);
    fs.appendFileSync(path.join(dir, 'openspec', 'changes', CHANGE, 'tasks.md'), '- [ ] 1.3 Third task\n');
    const updated = await idefactory(dir, ['board', 'publish', CHANGE], envWithToken(dir));
    const update = readPlan(dir, planIdFrom(updated.out)).operations[0].arguments;
    assert.equal(update.action, 'update');
    assert.equal(update.id, 42);
    assert.ok(update.updates.some((entry) => entry.path === '/fields/System.Description' && /1\.3/.test(entry.value)));
    assertNoAzureCall(dir);
  } finally {
    cleanup(dir);
  }
});

test('comment is keyed and transition refuses the ready state, both as plans', async () => {
  const dir = tempProject();
  try {
    await configured(dir);
    await publishAndAck(dir);
    const comment = await idefactory(dir, ['board', 'comment', CHANGE, '--message', 'Looking good', '--key', 'k1'], envWithToken(dir));
    assert.equal(comment.code, 0, comment.err || comment.out);
    const commentPlan = readPlan(dir, planIdFrom(comment.out));
    assert.deepEqual(commentPlan.operations[0], {
      tool: 'wit_work_item_comment_write',
      arguments: {
        action: 'add', orgName: 'contoso', project: 'Shop', workItemId: 42, comment: 'Looking good',
      },
    });
    assert.deepEqual(readRecord(dir).comments, []);
    assert.equal((await idefactory(dir, ['mcp', 'ack', commentPlan.id])).code, 0);
    assert.deepEqual(readRecord(dir).comments, ['k1']);
    const repeat = await idefactory(dir, ['board', 'comment', CHANGE, '--message', 'Looking good', '--key', 'k1'], envWithToken(dir));
    assert.match(repeat.out, /already posted/);

    const ready = await idefactory(dir, ['board', 'transition', CHANGE, '--to', 'ready'], envWithToken(dir));
    assert.notEqual(ready.code, 0);
    const waiting = await idefactory(dir, ['board', 'transition', CHANGE, '--to', 'waiting', '--note', 'Needs a call'], envWithToken(dir));
    const operations = readPlan(dir, planIdFrom(waiting.out)).operations;
    assert.deepEqual(operations[0].arguments.updates, [
      { op: 'Add', path: '/fields/System.State', value: 'Waiting on Human' },
    ]);
    assert.equal(operations[1].arguments.comment, 'Needs a call');
    assertNoAzureCall(dir);
  } finally {
    cleanup(dir);
  }
});

test('claim needs a snapshot and names the MCP read to run', async () => {
  const dir = tempProject();
  try {
    await configured(dir);
    await publishAndAck(dir);
    const result = await claim(dir);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /--snapshot/);
    assert.match(result.err, /wit_work_item/);
    assertNoAzureCall(dir);
  } finally {
    cleanup(dir);
  }
});

test('a start claim plans a revision-tested update and records at ack', async () => {
  const dir = tempProject();
  try {
    await configured(dir);
    await publishAndAck(dir);
    const snapshot = writeSnapshot(dir, { rev: 7 });
    const started = await claim(dir, ['--snapshot', snapshot]);
    assert.equal(started.code, 0, started.err || started.out);
    assert.equal(started.json.decision, 'start');
    assert.equal(started.json.revision, 7);
    assert.equal(started.json.next, `idefactory run --change ${CHANGE} --until human-gate`);

    const [update, comment] = started.json.plan.operations;
    assert.equal(update.tool, 'wit_work_item_write');
    assert.deepEqual(update.arguments.updates[0], { op: 'Test', path: '/rev', value: 7 });
    assert.deepEqual(update.arguments.updates.slice(1), [
      { op: 'Add', path: '/fields/System.State', value: 'In Progress' },
      { op: 'Add', path: '/fields/Custom.FactoryBranch', value: `factory/${CHANGE}` },
      { op: 'Add', path: '/fields/Custom.FactoryRunUrl', value: RUN_URL },
    ]);
    assert.equal(comment.tool, 'wit_work_item_comment_write');
    assert.match(comment.arguments.comment, new RegExp(`factory/${CHANGE}`));

    assert.equal(readRecord(dir).claims.length, 0, 'the record changes only at ack');
    const events = () => readJsonLines(path.join(dir, '.factory', 'observability', 'events.jsonl'));
    assert.equal(events().filter((event) => event.type === 'board-claim').length, 0);

    assert.equal((await idefactory(dir, ['mcp', 'ack', started.json.plan.id])).code, 0);
    const record = readRecord(dir);
    assert.equal(record.state, 'in-progress');
    assert.deepEqual(record.claims.map((entry) => [entry.revision, entry.decision]), [[7, 'start']]);
    assert.deepEqual(events().filter((event) => event.type === 'board-claim').map((event) => event.decision), ['start']);

    const duplicate = await claim(dir, ['--snapshot', snapshot]);
    assert.equal(duplicate.json.decision, 'duplicate');
    assert.equal(duplicate.json.plan, null);
    assertNoAzureCall(dir);
  } finally {
    cleanup(dir);
  }
});

test('not-ready, a tag or change mismatch, and a missing rev produce no plan', async () => {
  const dir = tempProject();
  try {
    await configured(dir);
    await publishAndAck(dir);
    const notReady = await claim(dir, ['--snapshot', writeSnapshot(dir, { state: 'New' })]);
    assert.equal(notReady.json.decision, 'not-ready');
    assert.equal(notReady.json.plan, null);

    const mismatch = await claim(dir, ['--snapshot', writeSnapshot(dir, { change: 'other-change' })]);
    assert.notEqual(mismatch.code, 0);
    assert.match(mismatch.err, /not one-click-checkout/);
    const untagged = await claim(dir, ['--snapshot', writeSnapshot(dir, { tags: 'bug' })]);
    assert.notEqual(untagged.code, 0);
    assert.match(untagged.err, /missing the factory tag/);

    const noRev = path.join(dir, 'norev.json');
    fs.writeFileSync(noRev, JSON.stringify({ id: 42, fields: { 'System.State': 'Ready for Factory', 'System.Tags': 'factory', 'Custom.OpenSpecChange': CHANGE } }));
    const missing = await claim(dir, ['--snapshot', noRev]);
    assert.notEqual(missing.code, 0);
    assert.match(missing.err, /no usable revision|no rev/);

    const otherItem = await claim(dir, ['--snapshot', writeSnapshot(dir, { id: 99 })]);
    assert.notEqual(otherItem.code, 0);
    assert.match(otherItem.err, /snapshot is work item 99/);

    assert.deepEqual(fs.existsSync(path.join(dir, '.factory', 'mcp')) ? fs.readdirSync(path.join(dir, '.factory', 'mcp')) : [], []);
    assertNoAzureCall(dir);
  } finally {
    cleanup(dir);
  }
});

test('resume and skip decisions follow the acknowledged state', async () => {
  const dir = tempProject();
  try {
    await configured(dir);
    await publishAndAck(dir);
    const first = await claim(dir, ['--snapshot', writeSnapshot(dir, { rev: 7 })]);
    assert.equal((await idefactory(dir, ['mcp', 'ack', first.json.plan.id])).code, 0);

    const skipped = await claim(dir, ['--snapshot', writeSnapshot(dir, { rev: 9 })]);
    assert.equal(skipped.json.decision, 'skip');
    assert.equal(skipped.json.next, null);
    assert.deepEqual(skipped.json.plan.operations[0].arguments.updates[0], { op: 'Test', path: '/rev', value: 9 });
    assert.equal((await idefactory(dir, ['mcp', 'ack', skipped.json.plan.id])).code, 0);
    assert.equal(readRecord(dir).state, 'in-progress');

    const waiting = await idefactory(dir, ['board', 'transition', CHANGE, '--to', 'waiting'], envWithToken(dir));
    assert.equal((await idefactory(dir, ['mcp', 'ack', planIdFrom(waiting.out)])).code, 0);
    const resumed = await claim(dir, ['--snapshot', writeSnapshot(dir, { rev: 12 })]);
    assert.equal(resumed.json.decision, 'resume');
    assert.equal(resumed.json.next, `idefactory run --change ${CHANGE} --until human-gate --new-run`);
    assertNoAzureCall(dir);
  } finally {
    cleanup(dir);
  }
});

test('HALT turns a claim into a blocked plan', async () => {
  const dir = tempProject();
  try {
    await configured(dir);
    await publishAndAck(dir);
    assert.equal((await idefactory(dir, ['halt'])).code, 0);
    const halted = await claim(dir, ['--snapshot', writeSnapshot(dir, { rev: 7 })]);
    assert.equal(halted.json.decision, 'halted');
    assert.equal(halted.json.next, null);
    assert.deepEqual(halted.json.plan.operations[0].arguments.updates.slice(1), [
      { op: 'Add', path: '/fields/System.State', value: 'Blocked' },
    ]);
  } finally {
    cleanup(dir);
  }
});

test('report plans done-task comments, the state move, and the pull request link in one plan', async () => {
  const dir = tempProject();
  try {
    await configured(dir);
    await publishAndAck(dir);
    assert.equal((await idefactory(dir, ['sync-tasks', CHANGE])).code, 0);
    updateWorkItem(dir, CHANGE, '1.1', { status: 'done', attemptId: 'attempt-1' });
    const prFile = path.join(dir, '.factory', 'pull-requests', `${CHANGE}.json`);
    fs.mkdirSync(path.dirname(prFile), { recursive: true });
    fs.writeFileSync(prFile, JSON.stringify({
      change: CHANGE,
      branch: `factory/${CHANGE}`,
      pullRequest: { number: 5, url: `${ORG}/Shop/_git/web/pullrequest/5` },
    }));

    const report = await idefactory(dir, ['board', 'report', CHANGE], envWithToken(dir));
    assert.equal(report.code, 0, report.err || report.out);
    const plan = readPlan(dir, planIdFrom(report.out));
    const tools = plan.operations.map((operation) => `${operation.tool}:${operation.arguments.action}`);
    assert.deepEqual(tools, [
      'wit_work_item_comment_write:add',
      'wit_work_item_write:update',
      'wit_work_item_comment_write:add',
      'wit_work_item_link_write:link',
    ]);
    assert.match(plan.operations[0].arguments.comment, /task 1\.1 done\. Attempt attempt-1/);
    assert.equal(plan.operations[3].arguments.url, `${ORG}/Shop/_git/web/pullrequest/5`);
    assert.equal(plan.operations[3].arguments.linkType, 'hyperlink');
    assert.deepEqual(readRecord(dir).comments, []);

    assert.equal((await idefactory(dir, ['mcp', 'ack', plan.id])).code, 0);
    const record = readRecord(dir);
    assert.equal(record.comments.length, 1);
    assert.equal(record.linkedPullRequests.length, 1);
    const again = await idefactory(dir, ['board', 'report', CHANGE], envWithToken(dir));
    assert.equal(again.code, 0, again.err || again.out);
    assert.match(again.out, /is (in-review|ready-for-human-review)/);
    assertNoAzureCall(dir);
  } finally {
    cleanup(dir);
  }
});

test('the default transport never reads ADO_TOKEN and doctor stays green', async () => {
  const dir = tempProject();
  try {
    await configured(dir);
    const config = JSON.parse(fs.readFileSync(path.join(dir, '.factory', 'config.json'), 'utf8'));
    assert.equal(config.board.transport, 'mcp');
    assert.equal((await idefactory(dir, ['doctor'])).code, 0);
    const bad = await idefactory(dir, ['board', 'configure', '--transport', 'carrier-pigeon']);
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /board\.transport/);
  } finally {
    cleanup(dir);
  }
});
