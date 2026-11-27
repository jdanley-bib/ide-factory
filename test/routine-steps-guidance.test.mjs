import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { SKILL_DIRS, digest, manifestPath } from '../src/lib/adapters.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';
import { currentRendering, installLegacyRelease } from './adapter-helpers.mjs';

const HEADING = '## Routine steps and external effects';
const BLOCK_SKILLS = ['factory-run', 'factory-coordinator', 'factory-governance', 'factory-openspec'];
const RULES = ['.cursor/rules/factory.mdc', '.cline/rules/factory.md', '.github/agents/factory.agent.md'];
const TEMPLATES = [
  'templates/cursor/rules/factory.mdc',
  'templates/cline/rules/factory.md',
  'templates/copilot/factory.agent.md',
  ...BLOCK_SKILLS.map((skill) => `templates/skills/${skill}/SKILL.md`),
];

function shippedCopies() {
  const adapters = [
    ...RULES,
    ...SKILL_DIRS.flatMap((dir) => BLOCK_SKILLS.map((skill) => `${dir}/${skill}/SKILL.md`)),
  ];
  return [...TEMPLATES, ...adapters];
}

/** The text from the heading to the next heading or the ownership marker. */
export function extractBlock(text) {
  const start = text.indexOf(`${HEADING}\n`);
  if (start < 0) return null;
  const rest = text.slice(start + HEADING.length);
  const end = rest.search(/^## |^<!-- idefactory:owned -->/m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

/** The files whose block differs from the first file's block, or is missing. */
export function driftedFiles(files) {
  const [reference, ...others] = files;
  const expected = extractBlock(reference.text);
  const drifted = [];
  if (expected === null) drifted.push(reference.name);
  for (const file of others) {
    if (extractBlock(file.text) !== expected) drifted.push(file.name);
  }
  return drifted;
}

function load(root, rels) {
  return rels.map((rel) => ({ name: rel, text: fs.readFileSync(path.join(root, rel), 'utf8') }));
}

function read(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

test('every shipped copy carries one identical block', () => {
  const files = load(repoRoot, shippedCopies());
  assert.equal(files.length, 7 + 3 + 5 * 4);
  assert.deepEqual(driftedFiles(files), []);
  const block = extractBlock(files[0].text);
  assert.match(block, /`idefactory authorize`/);
  assert.match(block, /`sync-tasks`, `run`, `verify`, and `complete`/);
});

test('a freshly installed project carries the same block as the templates', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const template = extractBlock(read(repoRoot, TEMPLATES[0]));
    const files = [{ name: 'template', text: `${HEADING}\n\n${template}\n` }, ...load(dir, [
      ...RULES,
      ...SKILL_DIRS.flatMap((skillDir) => BLOCK_SKILLS.map((skill) => `${skillDir}/${skill}/SKILL.md`)),
    ])];
    assert.deepEqual(driftedFiles(files), []);
  } finally {
    cleanup(dir);
  }
});

test('the drift check names a copy whose wording differs', () => {
  const files = load(repoRoot, TEMPLATES);
  const changed = files.map((file, index) => (index === 4
    ? { ...file, text: file.text.replace('Do not ask again before each of them.', 'Ask before each of them.') }
    : file));
  assert.deepEqual(driftedFiles(changed), [TEMPLATES[4]]);
  const missing = files.map((file, index) => (index === 6
    ? { ...file, text: file.text.replace(HEADING, '## Something else') }
    : file));
  assert.deepEqual(driftedFiles(missing), [TEMPLATES[6]]);
});

test('the old wait sentence is gone from every template and installed copy', () => {
  const old = /run only after the human asks for that action/;
  for (const file of load(repoRoot, shippedCopies())) assert.doesNotMatch(file.text, old, file.name);
});

test('the run skill and rule do not tell the agent to wait before routine steps', () => {
  for (const rel of ['.cursor/rules/factory.mdc', '.cursor/skills/factory-run/SKILL.md']) {
    const text = read(repoRoot, rel);
    assert.doesNotMatch(text, /(wait|ask)[^.\n]*before[^.\n]*(sync-tasks|verify|complete)\b/i, rel);
    assert.match(extractBlock(text), /Do not ask again before each of them/, rel);
  }
});

test('the governance skill says the agent does not run approve for itself and checks authorize', () => {
  const text = read(repoRoot, '.cursor/skills/factory-governance/SKILL.md');
  assert.match(text, /never run it for yourself/);
  assert.match(text, /run `idefactory authorize` and proceed only when it reports `authorized: true`/);
  assert.match(text, /When it reports `authorized: false`, stop and report the reason and the `approve` command/);
});

test('the coordinator and openspec skills keep archive and spec sync as separate requests', () => {
  for (const skill of ['factory-coordinator', 'factory-openspec']) {
    const text = read(repoRoot, `.cursor/skills/${skill}/SKILL.md`);
    assert.match(text, /archive, and spec sync/, skill);
    assert.match(text, /isDeliverableChange/, skill);
    assert.match(text, /Spec sync stays human-gated/, skill);
  }
  assert.match(read(repoRoot, '.cursor/skills/factory-run/SKILL.md'), /--new-run/);
});

test('upgrade gives an unmodified legacy file the new block and preserves an edited one', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.rmSync(manifestPath(dir));
    installLegacyRelease(dir);
    const rule = '.cursor/rules/factory.mdc';
    const edited = '.claude/skills/factory-run/SKILL.md';
    assert.equal(extractBlock(read(dir, rule)), null);
    fs.appendFileSync(path.join(dir, edited), '\nTeam note.\n');
    const editedText = read(dir, edited);

    const upgraded = await idefactory(dir, ['upgrade']);
    assert.equal(upgraded.code, 3, upgraded.err + upgraded.out);
    assert.equal(digest(read(dir, rule)), digest(currentRendering(rule)));
    assert.ok(extractBlock(read(dir, rule)).includes('`idefactory authorize`'));
    assert.equal(read(dir, edited), editedText);
    assert.equal(extractBlock(read(dir, edited)), null);
    assert.match(upgraded.out, /preserved/);
    assert.ok(upgraded.out.includes(edited));
  } finally {
    cleanup(dir);
  }
});
