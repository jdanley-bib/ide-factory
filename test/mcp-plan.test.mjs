import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ackPlan, createPlan, listPlans, mcpOrgName, planDir } from '../src/lib/mcp-plan.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { readJsonLines } from './az-helpers.mjs';

const commentOperation = {
  tool: 'wit_work_item_comment_write',
  arguments: { action: 'add', orgName: 'contoso', project: 'Shop', workItemId: 7, comment: 'hello' },
};

function samplePlan(overrides = {}) {
  return {
    kind: 'board-comment',
    change: 'demo',
    operations: [commentOperation],
    effects: { writes: [{ path: '.factory/boards/demo.json', json: { change: 'demo', note: 'x' } }] },
    ...overrides,
  };
}

async function project() {
  const dir = tempProject();
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  return dir;
}

test('the same plan has the same id and one file', async () => {
  const dir = await project();
  try {
    const first = createPlan(dir, samplePlan());
    const second = createPlan(dir, samplePlan());
    assert.match(first.id, /^plan-[0-9a-f]{12}$/);
    assert.equal(first.id, second.id);
    assert.deepEqual(fs.readdirSync(planDir(dir)), [`${first.id}.json`]);
    assert.deepEqual(listPlans(dir), [{ id: first.id, kind: 'board-comment', change: 'demo', operations: 1 }]);
  } finally {
    cleanup(dir);
  }
});

test('a tool or action outside the allowlist is refused and nothing is saved', async () => {
  const dir = await project();
  try {
    const refused = [
      { tool: 'repo_pull_request_thread_write', arguments: { action: 'update_status' } },
      { tool: 'wit_work_item_write', arguments: { action: 'add_child' } },
      { tool: 'repo_branch', arguments: { action: 'get' } },
    ];
    for (const operation of refused) {
      assert.throws(() => createPlan(dir, samplePlan({ operations: [operation] })), /may not call/);
    }
    assert.equal(fs.existsSync(planDir(dir)), false);
  } finally {
    cleanup(dir);
  }
});

test('pull request plans refuse completion, bypass, vote, and status arguments', async () => {
  const dir = await project();
  try {
    const base = {
      action: 'create',
      orgName: 'contoso',
      project: 'Shop',
      repositoryId: 'web',
      sourceRefName: 'refs/heads/factory/demo',
      targetRefName: 'refs/heads/main',
      title: 'demo',
    };
    for (const extra of [
      { autoComplete: true },
      { bypassReason: 'because' },
      { vote: 'Approved' },
      { status: 'Abandoned' },
      { mergeStrategy: 'Squash' },
      { deleteSourceBranch: true },
    ]) {
      const [name] = Object.keys(extra);
      assert.throws(
        () => createPlan(dir, samplePlan({
          kind: 'pr-open',
          operations: [{ tool: 'repo_pull_request_write', arguments: { ...base, ...extra } }],
        })),
        new RegExp(`may not set ${name}`),
      );
    }
    assert.throws(
      () => createPlan(dir, samplePlan({
        kind: 'pr-open',
        operations: [{
          tool: 'repo_pull_request_write',
          arguments: {
            action: 'update', orgName: 'contoso', project: 'Shop', repositoryId: 'web', pullRequestId: 3, title: 'new',
          },
        }],
      })),
      /only change the description/,
    );
    assert.equal(fs.existsSync(planDir(dir)), false);
  } finally {
    cleanup(dir);
  }
});

test('ack writes the record, appends events, and deletes the plan', async () => {
  const dir = await project();
  try {
    const plan = createPlan(dir, samplePlan());
    const acked = await idefactory(dir, ['mcp', 'ack', plan.id]);
    assert.equal(acked.code, 0, acked.err || acked.out);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.factory', 'boards', 'demo.json'), 'utf8')), {
      change: 'demo',
      note: 'x',
    });
    assert.equal(fs.existsSync(path.join(planDir(dir), `${plan.id}.json`)), false);
    const events = readJsonLines(path.join(dir, '.factory', 'observability', 'events.jsonl'))
      .filter((event) => event.type === 'mcp-ack');
    assert.equal(events.length, 1);
    assert.equal(events[0].planId, plan.id);
    assert.equal(events[0].kind, 'board-comment');

    const again = await idefactory(dir, ['mcp', 'ack', plan.id]);
    assert.notEqual(again.code, 0);
    assert.match(again.err, /No pending plan/);
  } finally {
    cleanup(dir);
  }
});

test('ack of a create plan needs its id and records it with the url', async () => {
  const dir = await project();
  try {
    const plan = createPlan(dir, samplePlan({
      kind: 'board-publish',
      effects: {
        writes: [{ path: '.factory/boards/demo.json', json: { change: 'demo', workItem: { id: null, url: null } } }],
        bind: [{
          result: 'workItemId',
          write: 0,
          pointer: ['workItem', 'id'],
          urlPointer: ['workItem', 'url'],
          urlTemplate: 'https://dev.azure.com/contoso/Shop/_workitems/edit/{id}',
        }],
      },
    }));
    const missing = await idefactory(dir, ['mcp', 'ack', plan.id, '--result', '{}']);
    assert.notEqual(missing.code, 0);
    assert.match(missing.err, /workItemId/);
    assert.equal(fs.existsSync(path.join(planDir(dir), `${plan.id}.json`)), true);
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'boards', 'demo.json')), false);

    const ok = await idefactory(dir, ['mcp', 'ack', plan.id, '--result', '{"workItemId": 321}']);
    assert.equal(ok.code, 0, ok.err || ok.out);
    const record = JSON.parse(fs.readFileSync(path.join(dir, '.factory', 'boards', 'demo.json'), 'utf8'));
    assert.deepEqual(record.workItem, { id: 321, url: 'https://dev.azure.com/contoso/Shop/_workitems/edit/321' });
  } finally {
    cleanup(dir);
  }
});

test('ack refuses a plan edited after it was created and a write outside .factory', async () => {
  const dir = await project();
  try {
    const plan = createPlan(dir, samplePlan());
    const file = path.join(planDir(dir), `${plan.id}.json`);
    const edited = JSON.parse(fs.readFileSync(file, 'utf8'));
    edited.operations[0].arguments.comment = 'something else';
    fs.writeFileSync(file, JSON.stringify(edited));
    const tampered = await idefactory(dir, ['mcp', 'ack', plan.id]);
    assert.notEqual(tampered.code, 0);
    assert.match(tampered.err, /modified after it was created/);
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'boards', 'demo.json')), false);

    fs.rmSync(file);
    const escape = createPlan(dir, samplePlan({
      effects: { writes: [{ path: '../outside.json', json: {} }] },
    }));
    assert.throws(() => ackPlan(dir, escape.id), /outside \.factory/);
    assert.equal(fs.existsSync(path.join(dir, '..', 'outside.json')), false);
  } finally {
    cleanup(dir);
  }
});

test('mcp pending lists plans and ack takes a result file', async () => {
  const dir = await project();
  try {
    const empty = await idefactory(dir, ['mcp', 'pending']);
    assert.match(empty.out, /no pending plans/);
    const plan = createPlan(dir, samplePlan());
    const listed = await idefactory(dir, ['mcp', 'pending', '--json']);
    assert.deepEqual(JSON.parse(listed.out).map((entry) => entry.id), [plan.id]);

    const resultFile = path.join(dir, 'result.json');
    fs.writeFileSync(resultFile, '{}');
    const both = await idefactory(dir, ['mcp', 'ack', plan.id, '--result', '{}', '--result-file', resultFile]);
    assert.notEqual(both.code, 0);
    const ok = await idefactory(dir, ['mcp', 'ack', plan.id, '--result-file', resultFile]);
    assert.equal(ok.code, 0, ok.err || ok.out);
  } finally {
    cleanup(dir);
  }
});

test('organization names come from dev.azure.com and visualstudio.com URLs', () => {
  assert.equal(mcpOrgName('https://dev.azure.com/contoso'), 'contoso');
  assert.equal(mcpOrgName('https://contoso.visualstudio.com'), 'contoso');
});
