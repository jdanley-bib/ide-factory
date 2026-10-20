import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

function read(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

test('init writes the default team and leaves an application file alone', async () => {
  const dir = tempProject();
  try {
    fs.writeFileSync(path.join(dir, 'app.js'), 'keep-app\n');
    const result = await idefactory(dir, ['init']);
    assert.equal(result.code, 0);
    assert.equal(fs.readFileSync(path.join(dir, 'app.js'), 'utf8'), 'keep-app\n');
    const team = read(dir, '.factory/team.md');
    for (const role of ['Lead', 'Architect', 'Engineer', 'Reviewer', 'Scribe']) {
      assert.match(team, new RegExp(role));
    }
    assert.match(team, /does not implement product code/);
    assert.equal(fs.existsSync(path.join(dir, '.factory/decisions.md')), true);
    const config = JSON.parse(read(dir, '.factory/config.json'));
    assert.equal(config.runtime, 'ide');
    assert.equal(config.ideation, false);
    assert.equal(fs.existsSync(path.join(dir, '.factory/agents/engineer/charter.md')), true);
    assert.equal(fs.existsSync(path.join(dir, '.factory/agents/engineer/history.md')), true);
    assert.match(read(dir, 'GOLDEN_RULES.md'), /Ollama/);
    assert.match(read(dir, 'GOLDEN_RULES.md'), /web ideation|from the web|autonomous web/i);
    assert.match(read(dir, 'GOLDEN_RULES.md'), /spend/i);
    assert.match(read(dir, 'GOLDEN_RULES.md'), /publish/i);
  } finally {
    cleanup(dir);
  }
});

test('re-init preserves decisions, history, squad, and AGENTS.md', async () => {
  const dir = tempProject();
  try {
    fs.mkdirSync(path.join(dir, '.squad'));
    fs.writeFileSync(path.join(dir, '.squad/team.md'), 'SQUAD-BYTES\n');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'Project alpha stays\n');
    fs.writeFileSync(path.join(dir, 'GOLDEN_RULES.md'), 'HUMAN-OWNED-RULES\n');
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.appendFileSync(path.join(dir, '.factory/decisions.md'), '\nACCEPTED-SENTINEL\n');
    fs.appendFileSync(path.join(dir, '.factory/agents/engineer/history.md'), '\nSESSION-NOTE\n');
    fs.mkdirSync(path.join(dir, '.cursor/skills/openspec-propose'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.cursor/skills/openspec-propose/SKILL.md'), 'KEEP-OPENSPEC\n');
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.match(read(dir, '.factory/decisions.md'), /ACCEPTED-SENTINEL/);
    assert.match(read(dir, '.factory/agents/engineer/history.md'), /SESSION-NOTE/);
    assert.equal(fs.readFileSync(path.join(dir, '.squad/team.md'), 'utf8'), 'SQUAD-BYTES\n');
    const agents = read(dir, 'AGENTS.md');
    assert.match(agents, /Project alpha stays/);
    assert.equal(agents.split('<!-- idefactory:start -->').length - 1, 1);
    assert.equal(fs.readFileSync(path.join(dir, 'GOLDEN_RULES.md'), 'utf8'), 'HUMAN-OWNED-RULES\n');
    assert.equal(fs.readFileSync(path.join(dir, '.cursor/skills/openspec-propose/SKILL.md'), 'utf8'), 'KEEP-OPENSPEC\n');
  } finally {
    cleanup(dir);
  }
});

test('installs the three IDE build commands, a narrow rule, and skills with no model launcher', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const rel of [
      '.cursor/commands/factory-build.md',
      '.github/prompts/factory-build.prompt.md',
      '.claude/commands/factory-build.md',
      '.cursor/commands/factory-status.md',
      '.cursor/commands/factory-plan.md',
      '.cursor/commands/factory-review.md',
      '.github/agents/factory.agent.md',
      '.claude/skills/factory-coordinator/SKILL.md',
    ]) {
      assert.equal(fs.existsSync(path.join(dir, rel)), true, rel);
    }
    for (const rel of [
      '.cursor/commands/factory-build.md',
      '.github/prompts/factory-build.prompt.md',
      '.claude/commands/factory-build.md',
    ]) {
      assert.match(read(dir, rel), /factory-build skill/);
    }
    assert.match(read(dir, '.cursor/rules/factory.mdc'), /Unrelated requests are left alone/);
    const build = read(dir, '.cursor/skills/factory-build/SKILL.md');
    assert.match(build, /failing test/i);
    assert.match(build, /verification command/i);
    assert.match(build, /different role/i);
    const skillsRoot = path.join(dir, '.cursor/skills');
    for (const name of fs.readdirSync(skillsRoot)) {
      if (!name.startsWith('factory-')) continue;
      const text = fs.readFileSync(path.join(skillsRoot, name, 'SKILL.md'), 'utf8');
      assert.doesNotMatch(text, /11434/);
      assert.doesNotMatch(text, /ollama\s+(run|pull|serve)/i);
      assert.doesNotMatch(text, /https?:\/\/\S*ollama/i);
      for (const line of text.split('\n')) {
        if (/\bollama\b/i.test(line)) assert.match(line, /\b(never|do not|don't)\b/i);
        if (/\b(ideate|invent a product)\b/i.test(line)) assert.match(line, /\b(never|do not|don't)\b/i);
      }
    }
  } finally {
    cleanup(dir);
  }
});

test('upgrade refreshes an owned skill and keeps a custom decision', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.appendFileSync(path.join(dir, '.factory/decisions.md'), '\nCUSTOM-DECISION-KEEP\n');
    fs.writeFileSync(
      path.join(dir, '.cursor/skills/factory-coordinator/SKILL.md'),
      '---\nname: factory-coordinator\n---\nOLD-SKILL-BODY\n<!-- idefactory:owned -->\n',
    );
    assert.equal((await idefactory(dir, ['upgrade'])).code, 0);
    assert.match(read(dir, '.factory/decisions.md'), /CUSTOM-DECISION-KEEP/);
    const skill = read(dir, '.cursor/skills/factory-coordinator/SKILL.md');
    assert.doesNotMatch(skill, /OLD-SKILL-BODY/);
    assert.match(skill, /You route work/);
  } finally {
    cleanup(dir);
  }
});

test('doctor fails in an empty directory and passes after init', async () => {
  const dir = tempProject();
  try {
    assert.notEqual((await idefactory(dir, ['doctor'])).code, 0);
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.equal((await idefactory(dir, ['doctor'])).code, 0);
  } finally {
    cleanup(dir);
  }
});

test('README tells a project how to install and who does the work', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  assert.match(readme, /idefactory init/);
  assert.match(readme, /The IDE's own model does the work/);
});

test('the CLI process does not execute a model binary on next', () => {
  const dir = tempProject();
  try {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    for (const name of ['ollama', 'cursor-agent']) {
      const file = path.join(bin, name);
      fs.writeFileSync(file, '#!/bin/sh\ntouch "$IDEFACTORY_MODEL_RAN"\n');
      fs.chmodSync(file, 0o755);
    }
    const marker = path.join(dir, 'model-ran');
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'src/cli.mjs'), 'next', '--path', dir], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        IDEFACTORY_MODEL_RAN: marker,
        IDEFACTORY_BACKLOG: path.join(repoRoot, 'support/fake-backlog.mjs'),
        IDEFACTORY_FAKE_DB: path.join(dir, 'empty-tasks.json'),
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(marker), false);
    assert.doesNotMatch(result.stdout, /Work packet/);
  } finally {
    cleanup(dir);
  }
});
