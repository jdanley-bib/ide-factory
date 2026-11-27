import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

function read(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

test('init installs factory-cloud with the claim, resume-only --new-run, and never-merge rules', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const root of ['.cursor/skills', '.claude/skills', '.github/skills', '.agents/skills', '.cline/skills']) {
      const rel = `${root}/factory-cloud/SKILL.md`;
      const text = read(dir, rel);
      assert.match(text, /^---\nname: factory-cloud\n/, rel);
      assert.match(text, /IDE session model does the work/, rel);
      assert.match(text, /idefactory board claim <change> --work-item <id>/, rel);
      assert.match(text, /idefactory board report <change>/, rel);
      assert.match(text, /Pass `--new-run` only when the claim decision is `resume`\./, rel);
      assert.match(text, /The agent never merges\./, rel);
      assert.match(text, /idefactory pr open <change>/, rel);
      for (const forbidden of ['idefactory approve', 'idefactory lockout resolve', 'idefactory resume']) {
        assert.match(text, new RegExp(`Do not run \`${forbidden}\``), `${rel} forbids ${forbidden}`);
      }
      assert.match(text, /Never move the story to the ready state or to a done state/, rel);
      assert.doesNotMatch(text, /--auto-complete/, rel);
      assert.match(text, /idefactory mcp ack <planId>/, rel);
      assert.match(text, /--snapshot <file>/, rel);
      assert.match(text, /No Azure DevOps token is on this machine/, rel);
      assert.doesNotMatch(text, /ADO_TOKEN/, rel);
      assert.match(text, /operating system temporary directory, not inside the project/, rel);
      assert.match(text, /Never call these with `autoComplete`, `mergeStrategy`, `bypassReason`, `deleteSourceBranch`, `vote`, `status`, `reviewerIds`, or `isDraft`\./, rel);
      assert.match(text, /Never use `update_status`, `update_reviewers`, `vote`, or an abandon/, rel);
      assert.match(text, /Do not run `idefactory red waive` or `idefactory red reuse`/, rel);
      assert.match(text, /Do not edit a plan, a plan file under `\.factory\/mcp\/`/, rel);
      assert.match(text, /409/, rel);
      assert.match(text, /^## Blocked states$/m, rel);
      assert.match(text, /`run`, `next`, `complete`, `attempt transition`, and `sync-tasks` accept `--json`/, rel);
      assert.match(text, /When the actor is `human`, stop\./, rel);
      assert.match(text, /^## External effects$/m, rel);
      assert.match(text, /idefactory authorize --change <change> --action <publish\|deploy\|spend\|account> --target <name>/, rel);
      assert.match(text, /proceed only when it reports `authorized: true`/, rel);
      assert.match(text, /^## When an operation fails$/m, rel);
      assert.match(text, /idefactory mcp record <planId> --operation <n> --outcome failed --cause <cause>/, rel);
      assert.match(text, /`retry-after-readback`: a check-first operation whose read-back found the effect absent/, rel);
      assert.match(text, /`skip-applied`: a check-first operation whose read-back found the effect present/, rel);
      assert.match(text, /`replan`: the plan is stale/, rel);
      assert.match(text, /A failed read .* Repeat it up to three times/, rel);
      assert.match(text, /`operation-retry-cap`/, rel);
      assert.match(text, /A 409 or a revision error on the first operation of a claim means another run claimed the story first\. Record `--cause conflict --decision abandon`/, rel);
      assert.doesNotMatch(text, /If an operation fails, stop\./, rel);
      assert.doesNotMatch(text, /Do not publish, deploy, spend, or create accounts\.$/m, rel);
    }

    const coordinator = read(dir, '.cursor/skills/factory-coordinator/SKILL.md');
    assert.match(coordinator, /factory-cloud/);
    for (const rel of ['.cursor/rules/factory.mdc', '.cline/rules/factory.md', '.github/agents/factory.agent.md']) {
      assert.match(read(dir, rel), /factory-cloud/, rel);
    }
  } finally {
    cleanup(dir);
  }
});

test('init does not install the Azure DevOps bridge or create hooks', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.equal(fs.existsSync(path.join(dir, 'tools')), false);
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'boards')), false);
    const config = JSON.parse(read(dir, '.factory/config.json'));
    assert.equal(config.board, undefined);
    assert.equal(config.forge, undefined);
    assert.equal(config.runtime, 'ide');
  } finally {
    cleanup(dir);
  }
});
