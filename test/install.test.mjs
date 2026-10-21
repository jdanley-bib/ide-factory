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
    for (const role of ['Lead', 'Architect', 'Engineer', 'Test Engineer', 'Security Reviewer', 'Reviewer', 'Scribe']) {
      assert.match(team, new RegExp(role));
    }
    assert.match(team, /does not implement product code/);
    assert.equal(fs.existsSync(path.join(dir, '.factory/decisions.md')), true);
    assert.equal(fs.existsSync(path.join(dir, '.factory/governance.md')), true);
    assert.equal(fs.existsSync(path.join(dir, '.factory/profiles.json')), true);
    assert.equal(fs.existsSync(path.join(dir, '.factory/work/index.json')), true);
    const config = JSON.parse(read(dir, '.factory/config.json'));
    assert.equal(config.runtime, 'ide');
    assert.equal(config.ideation, false);
    assert.equal(fs.existsSync(path.join(dir, '.factory/agents/engineer/charter.md')), true);
    assert.equal(fs.existsSync(path.join(dir, '.factory/agents/test-engineer/charter.md')), true);
    assert.equal(fs.existsSync(path.join(dir, '.factory/agents/security-reviewer/charter.md')), true);
    assert.equal(fs.existsSync(path.join(dir, 'GOLDEN_RULES.md')), false);
    assert.match(read(dir, '.factory/governance.md'), /IDE models only/i);
    assert.match(read(dir, '.factory/governance.md'), /approve/i);
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

test('installs factory build/run/full commands, a narrow rule, and skills with no model launcher', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const rel of [
      '.cursor/commands/factory-build.md',
      '.cursor/commands/factory-run.md',
      '.cursor/commands/factory-full.md',
      '.github/prompts/factory-build.prompt.md',
      '.github/prompts/factory-run.prompt.md',
      '.github/prompts/factory-full.prompt.md',
      '.claude/commands/factory-build.md',
      '.claude/commands/factory-run.md',
      '.claude/commands/factory-full.md',
      '.cursor/commands/factory-status.md',
      '.cursor/commands/factory-plan.md',
      '.cursor/commands/factory-review.md',
      '.github/agents/factory.agent.md',
      '.claude/skills/factory-coordinator/SKILL.md',
      '.cursor/skills/factory-run/SKILL.md',
      '.cursor/skills/factory-full/SKILL.md',
    ]) {
      assert.equal(fs.existsSync(path.join(dir, rel)), true, rel);
    }
    assert.match(read(dir, '.cursor/skills/factory-full/SKILL.md'), /openspec-explore/);
    assert.match(read(dir, '.cursor/skills/factory-full/SKILL.md'), /factory-run/);
    assert.match(read(dir, '.cursor/commands/factory-full.md'), /factory-full skill/);
    assert.match(read(dir, '.cursor/rules/factory.mdc'), /Unrelated requests are left alone/);
    const build = read(dir, '.cursor/skills/factory-build/SKILL.md');
    assert.match(build, /failing test/i);
    assert.match(build, /verification/i);
    assert.match(build, /different role/i);
    assert.match(build, /idefactory complete/);
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

test('doctor fails in an empty directory and passes after init without backlog', async () => {
  const dir = tempProject();
  try {
    assert.notEqual((await idefactory(dir, ['doctor'])).code, 0);
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.equal(fs.existsSync(path.join(dir, 'backlog')), false);
    assert.equal((await idefactory(dir, ['doctor'])).code, 0);
  } finally {
    cleanup(dir);
  }
});

test('README tells a project how to install and who does the work', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  assert.match(readme, /idefactory init/);
  assert.match(readme, /The IDE's own model does the work/);
  assert.match(readme, /\.factory\/work/);
});

test('the CLI process does not execute a model binary on next', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    for (const name of ['cursor-agent']) {
      const file = path.join(bin, name);
      fs.writeFileSync(file, '#!/bin/sh\ntouch "$IDEFACTORY_MODEL_RAN"\n');
      fs.chmodSync(file, 0o755);
    }
    const marker = path.join(dir, 'model-ran');
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'src/cli.mjs'), 'next', '--path', dir], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        IDEFACTORY_MODEL_RAN: marker,
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
