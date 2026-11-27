import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

const LEGAL_STEPS = 'The only legal pull-request steps are `idefactory pr open <change>`, `idefactory pr comment <attemptId>`, and `idefactory pr capture <change>`.';

const INSTALLED = [
  '.cursor/rules/factory.mdc',
  '.cursor/skills/factory-run/SKILL.md',
];

function read(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

function assertGuidance(text, rel) {
  assert.match(text, /The agent never merges\./, rel);
  const legal = text.match(/The only legal pull-request steps are ([^\n]+)/);
  assert.ok(legal, `${rel} names the only legal pull-request steps`);
  assert.match(legal[1], /idefactory pr open <change>/);
  assert.match(legal[1], /idefactory pr comment <attemptId>/);
  assert.match(legal[1], /idefactory pr capture <change>/);
  assert.doesNotMatch(legal[1], /gh pr create/, `${rel} does not name gh pr create as a legal step`);
  assert.doesNotMatch(legal[1], /Cursor pull-request tool/, `${rel} does not name the Cursor pull-request tool as a legal step`);
  assert.match(text, /does not open or edit a pull request through the Cursor pull-request tool or a hand-written `gh pr create`/);
  assert.match(text, /^## Routine steps and external effects$/m, rel);
  assert.match(text, /covers `sync-tasks`, `run`, `verify`, and `complete` for that change/, rel);
  assert.match(text, /`approve` \(the human's own record; never run it for yourself\), `ci scaffold`, archive, and spec sync/, rel);
  assert.match(text, /does not waive a true profile human gate, an active lockout, `HALT`, a run budget stop, or independent review/, rel);
  assert.match(text, /run `idefactory authorize` and proceed only when it reports `authorized: true`/, rel);
}

test('init installs pull-request guidance on the Cursor rule and factory-run skill', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const rel of INSTALLED) {
      const text = read(dir, rel);
      assert.match(text, new RegExp(LEGAL_STEPS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), rel);
      assertGuidance(text, rel);
    }
  } finally {
    cleanup(dir);
  }
});
