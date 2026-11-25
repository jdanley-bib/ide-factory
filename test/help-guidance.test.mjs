import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { SKILL_DIRS, digest, manifestPath } from '../src/lib/adapters.mjs';
import { currentRendering, installLegacyRelease } from './adapter-helpers.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

const HELP_SKILLS = ['factory-build', 'factory-run', 'factory-verify', 'factory-tdd', 'factory-governance'];

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function copyPaths(skill) {
  return [
    `templates/skills/${skill}/SKILL.md`,
    ...SKILL_DIRS.map((dir) => `${dir}/${skill}/SKILL.md`),
  ];
}

const HELP_POINTER = /Run `idefactory help <command>` for a command's usage, flags, and examples\./;
const NO_SOURCE = /Do not read the CLI source to learn usage\./;

test('each help skill template points to idefactory help and away from the CLI source', () => {
  for (const skill of HELP_SKILLS) {
    const text = read(repoRoot, `templates/skills/${skill}/SKILL.md`);
    assert.match(text, HELP_POINTER, skill);
    assert.match(text, NO_SOURCE, skill);
  }
  assert.match(
    read(repoRoot, 'templates/skills/factory-build/SKILL.md'),
    /`idefactory help attempt transition`/,
  );
});

test('every shipped copy of each help skill equals its template', () => {
  for (const skill of HELP_SKILLS) {
    const [template, ...copies] = copyPaths(skill);
    const expected = read(repoRoot, template);
    for (const copy of copies) assert.equal(read(repoRoot, copy), expected, copy);
  }
});

test('the help guidance names commands that have help', async () => {
  const known = JSON.parse((await idefactory(tempProject(), ['help', '--json'])).out).commands
    .map((item) => item.command);
  for (const skill of HELP_SKILLS) {
    const text = read(repoRoot, `templates/skills/${skill}/SKILL.md`);
    for (const match of text.matchAll(/`idefactory help ([a-z][a-z -]*)`/g)) {
      assert.ok(known.includes(match[1].trim()), `${skill} names help for "${match[1]}"`);
    }
  }
});

test('a fresh init writes the help guidance in every adapter', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const skill of HELP_SKILLS) {
      for (const rel of copyPaths(skill).slice(1)) {
        assert.match(read(dir, rel), HELP_POINTER, rel);
        assert.match(read(dir, rel), NO_SOURCE, rel);
      }
    }
  } finally {
    cleanup(dir);
  }
});

test('upgrade gives a legacy install the help guidance and leaves an edited skill alone', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.rmSync(manifestPath(dir));
    installLegacyRelease(dir);

    const edited = '.claude/skills/factory-run/SKILL.md';
    fs.appendFileSync(path.join(dir, edited), '\nTeam note.\n');
    const editedText = read(dir, edited);
    const pinned = '.cursor/skills/factory-tdd/SKILL.md';
    fs.appendFileSync(path.join(dir, pinned), '\nPinned note.\n');
    const pinnedText = read(dir, pinned);
    assert.equal((await idefactory(dir, ['adapters', 'pin', pinned])).code, 0);

    const upgraded = await idefactory(dir, ['upgrade']);
    assert.equal(upgraded.code, 3, upgraded.err + upgraded.out);

    for (const skill of HELP_SKILLS) {
      for (const rel of copyPaths(skill).slice(1)) {
        if (rel === edited || rel === pinned) continue;
        assert.equal(digest(read(dir, rel)), digest(currentRendering(rel)), rel);
        assert.match(read(dir, rel), HELP_POINTER, rel);
      }
    }
    assert.equal(read(dir, edited), editedText);
    assert.equal(read(dir, pinned), pinnedText);
    assert.doesNotMatch(read(dir, edited), HELP_POINTER);
    assert.match(upgraded.out, /preserved/);
  } finally {
    cleanup(dir);
  }
});

test('the README documents contextual help', () => {
  const readme = read(repoRoot, 'README.md');
  assert.match(readme, /idefactory help <command>/);
  assert.match(readme, /idefactory help --json/);
  assert.match(readme, /idefactory <command> --help/);
});
