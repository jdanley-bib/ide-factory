import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { azDb, azEnv, azLog, readJsonLines, writeAzDb, writeChange } from './az-helpers.mjs';

const ORG = 'https://dev.azure.com/contoso';
const CHANGE = 'one-click-checkout';
const RUN_URL = 'https://cursor.com/agents/bc-example';

async function publishedStory(dir) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  assert.equal((await idefactory(dir, [
    'board', 'configure', '--organization', ORG, '--project', 'Shop', '--transport', 'az',
  ])).code, 0);
  writeChange(dir, CHANGE);
  const published = await idefactory(dir, ['board', 'publish', CHANGE], azEnv(dir));
  assert.equal(published.code, 0, published.err || published.out);
  return 100;
}

function humanMoves(dir, id, state, fields = {}) {
  const db = azDb(dir);
  const item = db.workItems[String(id)];
  item.fields['System.State'] = state;
  Object.assign(item.fields, fields);
  item.rev += 1;
  writeAzDb(dir, db);
  return item.rev;
}

async function claim(dir, id, extra = []) {
  const result = await idefactory(dir, [
    'board', 'claim', CHANGE, '--work-item', String(id), '--run-url', RUN_URL, '--json', ...extra,
  ], azEnv(dir));
  return { ...result, json: result.code === 0 ? JSON.parse(result.out) : null };
}

function story(dir, id) {
  return azDb(dir).workItems[String(id)];
}

function updatesFor(dir) {
  return azLog(dir).filter((argv) => argv.slice(0, 3).join(' ') === 'boards work-item update');
}

test('first claim starts, sets branch and run URL, and a repeated revision is a duplicate', async () => {
  const dir = tempProject();
  try {
    const id = await publishedStory(dir);
    const revision = humanMoves(dir, id, 'Ready for Factory');

    const first = await claim(dir, id);
    assert.equal(first.code, 0, first.err || first.out);
    assert.equal(first.json.decision, 'start');
    assert.equal(first.json.revision, revision);
    assert.equal(first.json.next, `idefactory run --change ${CHANGE} --until human-gate`);
    const claimed = story(dir, id);
    assert.equal(claimed.fields['System.State'], 'In Progress');
    assert.equal(claimed.fields['Custom.FactoryBranch'], `factory/${CHANGE}`);
    assert.equal(claimed.fields['Custom.FactoryRunUrl'], RUN_URL);
    assert.match(claimed.comments.at(-1), new RegExp(`factory/${CHANGE}`));
    assert.match(claimed.comments.at(-1), new RegExp(RUN_URL));

    const record = JSON.parse(fs.readFileSync(path.join(dir, '.factory', 'boards', `${CHANGE}.json`), 'utf8'));
    assert.equal(record.state, 'in-progress');
    assert.equal(record.claims.length, 1);
    assert.equal(record.claims[0].revision, revision);

    const events = readJsonLines(path.join(dir, '.factory', 'observability', 'events.jsonl'))
      .filter((event) => event.type === 'board-claim');
    assert.equal(events.length, 1);
    assert.equal(events[0].decision, 'start');
    assert.equal(events[0].change, CHANGE);
    assert.equal(events[0].workItemId, id);
    assert.equal(events[0].revision, revision);

    const db = azDb(dir);
    db.workItems[String(id)].fields['System.State'] = 'Ready for Factory';
    db.workItems[String(id)].rev = revision;
    writeAzDb(dir, db);
    const updates = updatesFor(dir).length;
    const duplicate = await claim(dir, id, ['--revision', String(revision)]);
    assert.equal(duplicate.code, 0, duplicate.err);
    assert.equal(duplicate.json.decision, 'duplicate');
    assert.equal(duplicate.json.next, null);
    assert.equal(updatesFor(dir).length, updates, 'duplicate writes nothing');
  } finally {
    cleanup(dir);
  }
});

test('a story outside the ready state is not-ready and nothing is written', async () => {
  const dir = tempProject();
  try {
    const id = await publishedStory(dir);
    const updates = updatesFor(dir).length;
    const result = await claim(dir, id);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.json.decision, 'not-ready');
    assert.equal(result.json.next, null);
    assert.equal(updatesFor(dir).length, updates);
  } finally {
    cleanup(dir);
  }
});

test('claim fails without a write for a mismatched change field, a missing tag, or a missing change', async () => {
  const dir = tempProject();
  try {
    const id = await publishedStory(dir);
    humanMoves(dir, id, 'Ready for Factory', { 'Custom.OpenSpecChange': 'another-change' });
    const updates = updatesFor(dir).length;
    const mismatch = await claim(dir, id);
    assert.notEqual(mismatch.code, 0);
    assert.match(mismatch.err, /another-change/);

    humanMoves(dir, id, 'Ready for Factory', { 'Custom.OpenSpecChange': CHANGE, 'System.Tags': 'ui; checkout' });
    const untagged = await claim(dir, id);
    assert.notEqual(untagged.code, 0);
    assert.match(untagged.err, /tag/);

    fs.rmSync(path.join(dir, 'openspec', 'changes', CHANGE), { recursive: true });
    humanMoves(dir, id, 'Ready for Factory', { 'System.Tags': 'factory' });
    const missing = await claim(dir, id);
    assert.notEqual(missing.code, 0);
    assert.match(missing.err, /OpenSpec change not found/);
    assert.equal(updatesFor(dir).length, updates);
  } finally {
    cleanup(dir);
  }
});

test('only a story returned to ready after a human stop resumes with --new-run', async () => {
  const dir = tempProject();
  try {
    const id = await publishedStory(dir);
    humanMoves(dir, id, 'Ready for Factory');
    assert.equal((await claim(dir, id)).json.decision, 'start');

    humanMoves(dir, id, 'Ready for Factory');
    const skipped = await claim(dir, id);
    assert.equal(skipped.json.decision, 'skip');
    assert.equal(skipped.json.next, null);
    assert.equal(story(dir, id).fields['System.State'], 'In Progress', 'skip returns the story to its state');
    assert.match(story(dir, id).comments.at(-1), /already/i);

    assert.equal((await idefactory(dir, [
      'board', 'transition', CHANGE, '--to', 'waiting', '--note', 'human-gate on 1.2',
    ], azEnv(dir))).code, 0);
    humanMoves(dir, id, 'Ready for Factory');
    const resumed = await claim(dir, id);
    assert.equal(resumed.json.decision, 'resume');
    assert.equal(resumed.json.next, `idefactory run --change ${CHANGE} --until human-gate --new-run`);
    assert.equal(story(dir, id).fields['System.State'], 'In Progress');
  } finally {
    cleanup(dir);
  }
});

test('HALT turns a claim into halted and moves the story to blocked', async () => {
  const dir = tempProject();
  try {
    const id = await publishedStory(dir);
    humanMoves(dir, id, 'Ready for Factory');
    fs.writeFileSync(path.join(dir, 'HALT'), 'stop\n');
    const result = await claim(dir, id);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.json.decision, 'halted');
    assert.equal(result.json.next, null);
    assert.equal(story(dir, id).fields['System.State'], 'Blocked');
    assert.ok(fs.existsSync(path.join(dir, 'HALT')));
  } finally {
    cleanup(dir);
  }
});

test('claim adopts a story a human created with the change field and tag', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.equal((await idefactory(dir, [
      'board', 'configure', '--organization', ORG, '--project', 'Shop', '--transport', 'az',
    ])).code, 0);
    writeChange(dir, CHANGE);
    writeAzDb(dir, {
      workItems: {
        42: {
          id: 42,
          rev: 3,
          fields: {
            'System.State': 'Ready for Factory',
            'System.Tags': 'checkout; factory',
            'Custom.OpenSpecChange': CHANGE,
          },
          comments: [],
          relations: [],
        },
      },
    });
    const result = await claim(dir, 42);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.json.decision, 'start');
    const record = JSON.parse(fs.readFileSync(path.join(dir, '.factory', 'boards', `${CHANGE}.json`), 'utf8'));
    assert.equal(record.workItem.id, 42);
  } finally {
    cleanup(dir);
  }
});
