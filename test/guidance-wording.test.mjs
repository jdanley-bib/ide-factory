import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { SKILL_DIRS } from '../src/lib/adapters.mjs';
import { repoRoot } from './helpers.mjs';

const RED_SKILLS = ['factory-build', 'factory-tdd', 'factory-verify'];
const ROUTINE_SKILLS = ['factory-run', 'factory-coordinator', 'factory-governance', 'factory-openspec'];
const RULES = ['.cursor/rules/factory.mdc', '.cline/rules/factory.md', '.github/agents/factory.agent.md'];
const TEMPLATE_RULES = ['templates/cursor/rules/factory.mdc', 'templates/cline/rules/factory.md', 'templates/copilot/factory.agent.md'];

function shippedCopies() {
  const skillCopies = SKILL_DIRS.flatMap((dir) => ROUTINE_SKILLS.map((skill) => `${dir}/${skill}/SKILL.md`));
  const redCopies = SKILL_DIRS.flatMap((dir) => RED_SKILLS.map((skill) => `${dir}/${skill}/SKILL.md`));
  return {
    templates: [...TEMPLATE_RULES, ...ROUTINE_SKILLS.map((s) => `templates/skills/${s}/SKILL.md`), ...RED_SKILLS.map((s) => `templates/skills/${s}/SKILL.md`)],
    installed: [...RULES, ...skillCopies, ...redCopies],
  };
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

test('no shipped copy keeps the retired human-only sentences', () => {
  const retired = [/Only a human passes `--new-run`/, /Only the human may add that flag/, /ask the human first/i];
  const { templates, installed } = shippedCopies();
  for (const rel of [...templates, ...installed]) {
    for (const pattern of retired) assert.doesNotMatch(read(rel), pattern, rel);
  }
});

test('the routine block says condition stops clear without --new-run in every template', () => {
  for (const rel of TEMPLATE_RULES.concat(ROUTINE_SKILLS.map((s) => `templates/skills/${s}/SKILL.md`))) {
    const text = read(rel);
    const block = text.slice(text.indexOf('## Routine steps and external effects'));
    assert.match(block, /`vacuous-red` and `unchanged-state` clear once their condition is resolved, so run again without `--new-run`/, rel);
  }
});

test('each red skill names already-satisfied and method propose before any red waiver', () => {
  const { templates, installed } = shippedCopies();
  for (const rel of [...templates, ...installed].filter((file) => RED_SKILLS.some((skill) => file.includes(`${skill}/`)))) {
    const text = read(rel);
    const satisfied = text.indexOf('already-satisfied');
    assert.ok(satisfied >= 0, `${rel} names already-satisfied`);
    assert.ok(text.indexOf('method propose') >= 0, `${rel} names method propose`);
    const waive = text.indexOf('idefactory red waive');
    if (waive >= 0) {
      assert.ok(satisfied < waive, `${rel} names already-satisfied before red waive`);
      assert.ok(text.indexOf('method propose') < waive, `${rel} names method propose before red waive`);
    }
  }
});

test('the README stop-rule prose names the retry classes and the authority levels', () => {
  const readme = read('README.md');
  const section = readme.slice(readme.indexOf('### Blocked states'), readme.indexOf('### Autonomy report'));
  for (const word of ['safe', 'only-after-change', 'never', '`agent`', '`independent`', '`human`']) {
    assert.ok(section.includes(word), word);
  }
  assert.match(section, /authority table|## Blocked states and authority/);
});
