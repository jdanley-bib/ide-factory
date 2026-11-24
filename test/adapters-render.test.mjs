import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { digest, renderAdapters } from '../src/lib/adapters.mjs';
import { cleanup, repoRoot, tempProject } from './helpers.mjs';

const SKILLS = [
  'factory-build', 'factory-coordinator', 'factory-debug', 'factory-full', 'factory-governance',
  'factory-openspec', 'factory-run', 'factory-setup', 'factory-tdd', 'factory-verify',
];
const SKILL_DIRS = ['.cursor/skills', '.claude/skills', '.github/skills', '.agents/skills', '.cline/skills'];
const COMMAND_PATHS = (name) => [
  `.cursor/commands/${name}.md`,
  `.claude/commands/${name}.md`,
  `.github/prompts/${name}.prompt.md`,
  `.cline/workflows/${name}.md`,
];

test('renderAdapters lists every skill, command, rule, and agent path once', () => {
  const dir = tempProject();
  try {
    const entries = renderAdapters(dir);
    const byPath = new Map(entries.map((entry) => [entry.key, entry]));
    assert.equal(byPath.size, entries.length, 'keys are unique');
    for (const skill of SKILLS) {
      for (const dest of SKILL_DIRS) {
        const entry = byPath.get(`${dest}/${skill}/SKILL.md`);
        assert.ok(entry, `${dest}/${skill}/SKILL.md`);
        assert.equal(entry.kind, 'skill');
        assert.equal(entry.name, skill);
        assert.equal(entry.scope, 'file');
      }
    }
    for (const name of ['factory-status', 'factory-review', 'factory-setup']) {
      for (const file of COMMAND_PATHS(name)) {
        const entry = byPath.get(file);
        assert.ok(entry, file);
        assert.equal(entry.kind, 'command');
        assert.equal(entry.name, name);
      }
    }
    assert.equal(byPath.get('.cursor/rules/factory.mdc').kind, 'rule');
    assert.equal(byPath.get('.github/agents/factory.agent.md').kind, 'agent');
    assert.equal(byPath.get('.cline/rules/factory.md').kind, 'rule');
    for (const entry of entries) {
      assert.ok(!entry.path.includes('\\'), entry.path);
      assert.ok(!path.isAbsolute(entry.path), entry.path);
    }
  } finally {
    cleanup(dir);
  }
});

test('renderAdapters lists the three instruction files as sections', () => {
  const dir = tempProject();
  try {
    const sections = renderAdapters(dir).filter((entry) => entry.scope === 'section');
    assert.deepEqual(
      sections.map((entry) => entry.key).sort(),
      ['.github/copilot-instructions.md#section', 'AGENTS.md#section', 'CLAUDE.md#section'],
    );
    for (const entry of sections) {
      assert.match(entry.content, /^<!-- idefactory:start -->\n/);
      assert.match(entry.content, /\n<!-- idefactory:end -->\n$/);
      assert.equal(entry.kind, 'instructions');
    }
  } finally {
    cleanup(dir);
  }
});

test('renderAdapters matches the adapter files this repository checks in', () => {
  const entries = renderAdapters(repoRoot);
  assert.ok(entries.length > 80);
  for (const entry of entries) {
    const file = path.join(repoRoot, entry.path);
    const local = fs.readFileSync(file, 'utf8');
    if (entry.scope === 'section') {
      assert.ok(local.includes(entry.content), `${entry.path} holds the section`);
    } else {
      assert.equal(local, entry.content, entry.path);
    }
  }
});

test('renderAdapters lists a skill directory file by file', () => {
  const templates = fs.mkdtempSync(path.join(os.tmpdir(), 'idefactory-templates-'));
  const dir = tempProject();
  try {
    fs.cpSync(path.join(repoRoot, 'templates'), templates, { recursive: true });
    fs.mkdirSync(path.join(templates, 'skills/factory-build/refs'), { recursive: true });
    fs.writeFileSync(path.join(templates, 'skills/factory-build/refs/extra.md'), 'EXTRA\n');
    const keys = renderAdapters(dir, { templates }).map((entry) => entry.key);
    for (const dest of SKILL_DIRS) {
      assert.ok(keys.includes(`${dest}/factory-build/refs/extra.md`), dest);
    }
  } finally {
    fs.rmSync(templates, { recursive: true, force: true });
    cleanup(dir);
  }
});

test('digest ignores line endings and trailing newlines', () => {
  const hash = (text) => createHash('sha256').update(text).digest('hex');
  assert.equal(digest('a\nb\n'), hash('a\nb\n'));
  assert.equal(digest('a\r\nb\r\n'), digest('a\nb\n'));
  assert.equal(digest('a\nb'), digest('a\nb\n'));
  assert.equal(digest('a\nb\n\n\n'), digest('a\nb\n'));
  assert.notEqual(digest('a\nb\n'), digest('a\nc\n'));
  assert.match(digest('x'), /^[0-9a-f]{64}$/);
});
