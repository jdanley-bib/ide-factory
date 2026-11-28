import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { AUTHORITY, LEVELS } from '../src/lib/authority.mjs';
import { BLOCKED_TABLE } from '../src/lib/blocked-states.mjs';
import { SKILL_DIRS } from '../src/lib/adapters.mjs';
import { repoRoot } from './helpers.mjs';
import { driftedSections, extractSection } from './guidance-sections.mjs';
import {
  GUIDANCE_HEADING,
  GUIDANCE_TARGETS,
  renderGuidanceBlock,
  staleGuidanceTargets,
} from '../scripts/build-guidance.mjs';

const BLOCK_SKILLS = ['factory-run', 'factory-coordinator', 'factory-governance', 'factory-openspec'];
const RULES = ['.cursor/rules/factory.mdc', '.cline/rules/factory.md', '.github/agents/factory.agent.md'];

function load(rels) {
  return rels.map((rel) => ({ name: rel, text: fs.readFileSync(path.join(repoRoot, rel), 'utf8') }));
}

function installedCopies() {
  return [
    ...RULES,
    ...SKILL_DIRS.flatMap((dir) => BLOCK_SKILLS.map((skill) => `${dir}/${skill}/SKILL.md`)),
  ];
}

test('the checked-in templates match the tables', () => {
  const result = spawnSync(process.execPath, ['scripts/build-guidance.mjs', '--check'], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(staleGuidanceTargets({ root: repoRoot }), []);
});

test('a changed authority level makes every template stale until the block is regenerated', () => {
  const changed = { ...AUTHORITY, 'waive-red': { ...AUTHORITY['waive-red'], level: 'human' } };
  assert.deepEqual(staleGuidanceTargets({ root: repoRoot, authority: changed }), GUIDANCE_TARGETS);
});

test('a changed human-gate command in the blocked-state table makes the templates stale', () => {
  const table = Object.fromEntries(Object.entries(BLOCKED_TABLE).map(([code, row]) => [code, {
    ...row,
    options: row.options.map((option) => (option.id === 'record-approval'
      ? { ...option, command: `${option.command} --changed` }
      : option)),
  }]));
  assert.deepEqual(staleGuidanceTargets({ root: repoRoot, table }), GUIDANCE_TARGETS);
});

test('every human gate in the authority table is named in the block, and every level is described', () => {
  const block = renderGuidanceBlock();
  for (const [id, gate] of Object.entries(AUTHORITY)) {
    if (gate.level === 'human') assert.ok(block.includes(`- \`${id}\`:`), id);
  }
  for (const level of LEVELS) assert.ok(block.includes(`\`${level}\``), level);
});

test('every shipped template and installed copy carries the rendered block', () => {
  const block = renderGuidanceBlock();
  const files = [
    { name: 'rendered', text: block },
    ...load([...GUIDANCE_TARGETS, ...installedCopies()]),
  ];
  assert.deepEqual(driftedSections(files, GUIDANCE_HEADING), []);
});

test('a single copy with an edited sentence is named as drifted', () => {
  const block = renderGuidanceBlock();
  const files = [
    { name: 'rendered', text: block },
    ...load(GUIDANCE_TARGETS).map((file, index) => (index === 2
      ? { ...file, text: file.text.replace('Do not ask for a decision', 'Ask for a decision') }
      : file)),
  ];
  assert.deepEqual(driftedSections(files, GUIDANCE_HEADING), [GUIDANCE_TARGETS[2]]);
});

test('the block sits under its own heading and does not swallow the routine section', () => {
  for (const file of load(GUIDANCE_TARGETS)) {
    const block = extractSection(file.text, GUIDANCE_HEADING);
    assert.ok(block, file.name);
    assert.doesNotMatch(block, /^## /m, file.name);
    assert.ok(extractSection(file.text, '## Routine steps and external effects'), file.name);
  }
});
