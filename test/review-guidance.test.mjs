import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { renderWorkPacket } from '../src/lib/queue.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
import { digest, manifestPath, readManifest } from '../src/lib/adapters.mjs';
import { legacyRelease } from './adapter-helpers.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

const REVIEW_COMMAND_PATHS = [
  '.cursor/commands/factory-review.md',
  '.claude/commands/factory-review.md',
  '.github/prompts/factory-review.prompt.md',
  '.cline/workflows/factory-review.md',
];

const BUILD_SKILL_PATHS = [
  'templates/skills/factory-build/SKILL.md',
  '.cursor/skills/factory-build/SKILL.md',
  '.claude/skills/factory-build/SKILL.md',
  '.github/skills/factory-build/SKILL.md',
  '.agents/skills/factory-build/SKILL.md',
  '.cline/skills/factory-build/SKILL.md',
];

const FORBIDDEN = [
  /Accept only if a failing test was written first/i,
  /Acceptance requires red evidence and verification evidence/i,
];

const CONDITIONAL_MARKERS = [
  [/`code` item whose checks include a test kind/, 'code item with a test kind'],
  [/`unit`, `integration`, `playwright`, `contract`, or `unit-\*`/, 'test kinds'],
  [/`lightweight` item/, 'lightweight item'],
  [/no test check/i, 'no test check'],
  [/red exception is not a red that ran/i, 'exception is not a red that ran'],
  [/clean HEAD/, 'clean HEAD'],
  [/different role/i, 'different role'],
];

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assertConditionalGuidance(text, label) {
  for (const pattern of FORBIDDEN) {
    assert.doesNotMatch(text, pattern, `${label} must not carry ${pattern}`);
  }
  for (const [pattern, name] of CONDITIONAL_MARKERS) {
    assert.match(text, pattern, `${label} must state: ${name}`);
  }
}

test('the source review command states the conditional red rule', () => {
  assertConditionalGuidance(read(repoRoot, 'templates/commands/factory-review.md'), 'templates review command');
});

test('a fresh init writes the conditional review command in every adapter', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const rel of REVIEW_COMMAND_PATHS) {
      assertConditionalGuidance(read(dir, rel), `init ${rel}`);
    }
  } finally {
    cleanup(dir);
  }
});

test('the checked-in review commands carry the conditional red rule', () => {
  for (const rel of REVIEW_COMMAND_PATHS) {
    assertConditionalGuidance(read(repoRoot, rel), rel);
  }
});

test('every copy of the factory-build skill states the conditional red rule', async () => {
  for (const rel of BUILD_SKILL_PATHS) {
    assertConditionalGuidance(read(repoRoot, rel), rel);
  }
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const rel of BUILD_SKILL_PATHS.slice(1)) {
      assertConditionalGuidance(read(dir, rel), `init ${rel}`);
    }
  } finally {
    cleanup(dir);
  }
});

test('upgrade replaces the old unconditional review command with the conditional one', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const rel = '.cursor/commands/factory-review.md';
    const file = path.join(dir, rel);
    const old = legacyRelease().get(rel);
    assert.match(old, /Accept only if a failing test was written first and a verification command passed\./);
    fs.writeFileSync(file, old);
    assert.equal((await idefactory(dir, ['upgrade'])).code, 0);
    assertConditionalGuidance(fs.readFileSync(file, 'utf8'), 'upgraded review command');
  } finally {
    cleanup(dir);
  }
});

test('upgrade keeps a project-edited review command and stages the conditional one beside it', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const rel = '.cursor/commands/factory-review.md';
    const file = path.join(dir, rel);
    const manifest = readManifest(dir);
    manifest.files[rel] = { digest: digest(legacyRelease().get(rel)) };
    fs.writeFileSync(manifestPath(dir), `${JSON.stringify(manifest, null, 2)}\n`);
    const edited = 'Review as our team does: accept only after a failing test was written first.\n';
    fs.writeFileSync(file, edited);
    const result = await idefactory(dir, ['upgrade']);
    assert.equal(result.code, 3, result.err + result.out);
    assert.equal(fs.readFileSync(file, 'utf8'), edited);
    const staged = result.out.match(/incoming: (\S+)/);
    assert.ok(staged, result.out);
    assertConditionalGuidance(
      fs.readFileSync(path.join(dir, staged[1]), 'utf8'),
      'staged review command',
    );
  } finally {
    cleanup(dir);
  }
});

test('a fresh init writes charters that state the conditional red rule', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const engineer = read(dir, '.factory/agents/engineer/charter.md');
    assert.match(engineer, /`code` item whose checks include a test kind/);
    assert.match(engineer, /`lightweight`/);
    assert.match(engineer, /red exception/i);
    assert.doesNotMatch(engineer, /when the verification profile includes unit or equivalent checks/);
    const reviewer = read(dir, '.factory/agents/reviewer/charter.md');
    assert.match(reviewer, /valid recorded red exception/i);
    assert.match(reviewer, /`code` item whose checks include a test kind/);
    assert.doesNotMatch(reviewer, /failing-test-first evidence when required/);
  } finally {
    cleanup(dir);
  }
});

test('a second init leaves an edited charter byte-identical', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const file = path.join(dir, '.factory/agents/reviewer/charter.md');
    fs.writeFileSync(file, '# Reviewer\n\nProject-specific charter.\n');
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.equal(fs.readFileSync(file, 'utf8'), '# Reviewer\n\nProject-specific charter.\n');
  } finally {
    cleanup(dir);
  }
});

function commitAll(dir) {
  const run = (args) => {
    const result = spawnSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      shell: false,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'idefactory-test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'idefactory-test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  run(['init']);
  run(['add', '-A']);
  run(['commit', '-m', 'seed']);
}

test('a recorded waiver shows in the reviewer packet and the fresh review command accepts it', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'openspec/changes/demo/tasks.md'),
      '- [ ] 1.1 Add parser\n  factory:\n    kind: general\n    checks: [unit]\n',
    );
    assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    const attemptId = JSON.parse(started.out).id;
    commitAll(dir);
    const waived = await idefactory(dir, [
      'red', 'waive', attemptId, '--kind', 'unit', '--note', 'no seam to test', '--approver', 'human-1',
      '--acknowledge-not-stuck',
    ]);
    assert.equal(waived.code, 0, waived.err + waived.out);

    const packet = renderWorkPacket(dir, getWorkItem(dir, 'demo', '1.1'), 'reviewer');
    assert.match(packet, /^Red required for: unit$/m);
    assert.match(packet, /Red exceptions:\n- .*unit/);
    assert.match(packet, /human-1/);

    const command = read(dir, '.cursor/commands/factory-review.md');
    assert.match(command, /valid red exception that a human authorized/);
    assert.match(command, /Do not ask for a new failing test where one is recorded/);
  } finally {
    cleanup(dir);
  }
});
