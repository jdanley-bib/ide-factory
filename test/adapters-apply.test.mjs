import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  applyPlan,
  manifestPath,
  planAdapters,
  readManifest,
  renderAdapters,
  stageConflicts,
  unifiedDiff,
} from '../src/lib/adapters.mjs';
import { cleanup, tempProject } from './helpers.mjs';
import {
  changedTemplates,
  hashTree,
  historyOf,
  removeDir,
  spyRenames,
  writeRendering,
} from './adapter-helpers.mjs';

function legacyProject(options = {}) {
  const dir = tempProject();
  const old = renderAdapters(dir);
  writeRendering(dir, old, options);
  return { dir, old, history: historyOf(old) };
}

test('applyPlan writes created and updated files through a temporary file and a rename', () => {
  const { dir, history } = legacyProject();
  const templates = changedTemplates();
  try {
    const plan = planAdapters(dir, { templates, history });
    const targets = spyRenames(() => applyPlan(dir, plan));
    const skill = path.join(dir, '.cursor/skills/factory-build/SKILL.md');
    assert.ok(targets.includes(skill));
    assert.match(fs.readFileSync(skill, 'utf8'), /NEW UPSTREAM LINE/);
    const leftovers = [];
    const walk = (current) => {
      for (const name of fs.readdirSync(current)) {
        const full = path.join(current, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (name.includes('idefactory-tmp')) leftovers.push(full);
      }
    };
    walk(dir);
    assert.deepEqual(leftovers, []);
  } finally {
    removeDir(templates);
    cleanup(dir);
  }
});

test('applyPlan keeps CRLF line endings on a replaced file', () => {
  const { dir, history } = legacyProject({ crlf: true });
  const templates = changedTemplates();
  try {
    const plan = planAdapters(dir, { templates, history });
    applyPlan(dir, plan);
    const skill = fs.readFileSync(path.join(dir, '.cursor/skills/factory-build/SKILL.md'), 'utf8');
    assert.match(skill, /NEW UPSTREAM LINE/);
    assert.ok(skill.includes('\r\n'));
    assert.ok(!/[^\r]\n/.test(skill), 'every line break is CRLF');
  } finally {
    removeDir(templates);
    cleanup(dir);
  }
});

test('applyPlan leaves a preserved file byte-identical and still applies the others', () => {
  const { dir, history } = legacyProject();
  const templates = changedTemplates();
  try {
    const edited = path.join(dir, '.cursor/commands/factory-review.md');
    fs.appendFileSync(edited, '\nPROJECT RULE\n');
    const kept = fs.readFileSync(edited);
    const plan = planAdapters(dir, { templates, history });
    const result = applyPlan(dir, plan);
    assert.deepEqual(fs.readFileSync(edited), kept);
    assert.match(
      fs.readFileSync(path.join(dir, '.claude/commands/factory-review.md'), 'utf8'),
      /NEW REVIEW LINE/,
    );
    assert.equal(result.summary.preserved, 1);
    assert.equal(result.summary.updated, 9 - 1);
  } finally {
    removeDir(templates);
    cleanup(dir);
  }
});

test('applyPlan writes the manifest last and lists only files that are current', () => {
  const { dir, history } = legacyProject();
  const templates = changedTemplates();
  try {
    const edited = '.cursor/commands/factory-review.md';
    fs.appendFileSync(path.join(dir, edited), '\nPROJECT RULE\n');
    const plan = planAdapters(dir, { templates, history });
    const targets = spyRenames(() => applyPlan(dir, plan));
    assert.equal(targets[targets.length - 1], manifestPath(dir));
    assert.equal(targets.filter((target) => target === manifestPath(dir)).length, 1);
    const manifest = readManifest(dir);
    assert.equal(manifest.files[edited], undefined);
    assert.ok(manifest.files['.claude/commands/factory-review.md'].digest);
    assert.ok(manifest.files['.cursor/skills/factory-build/SKILL.md'].digest);
  } finally {
    removeDir(templates);
    cleanup(dir);
  }
});

test('a preserved file keeps its earlier baseline in the manifest', () => {
  const { dir, old, history } = legacyProject();
  const templates = changedTemplates();
  try {
    applyPlan(dir, planAdapters(dir, { history }));
    const edited = '.cursor/commands/factory-review.md';
    const baseline = readManifest(dir).files[edited].digest;
    fs.appendFileSync(path.join(dir, edited), '\nPROJECT RULE\n');
    applyPlan(dir, planAdapters(dir, { templates, history: { version: 1, files: {} } }));
    assert.equal(readManifest(dir).files[edited].digest, baseline);
    assert.ok(old.length > 0);
  } finally {
    removeDir(templates);
    cleanup(dir);
  }
});

test('a run that stops before the manifest write is repaired by running again', () => {
  const { dir, history } = legacyProject();
  const templates = changedTemplates();
  try {
    const plan = planAdapters(dir, { templates, history });
    assert.throws(
      () => spyRenames(() => applyPlan(dir, plan), { failOn: (to) => to === manifestPath(dir) }),
      /injected failure/,
    );
    assert.equal(fs.existsSync(manifestPath(dir)), false);
    const again = planAdapters(dir, { templates, history: { version: 1, files: {} } });
    assert.equal(again.files.filter((item) => item.status === 'preserved').length, 0);
    const result = applyPlan(dir, again);
    assert.equal(result.summary.preserved, 0);
    assert.ok(Object.keys(readManifest(dir).files).length > 80);
  } finally {
    removeDir(templates);
    cleanup(dir);
  }
});

test('a second run with nothing to change writes nothing', () => {
  const dir = tempProject();
  try {
    applyPlan(dir, planAdapters(dir));
    const before = hashTree(dir);
    const manifestBefore = fs.readFileSync(manifestPath(dir), 'utf8');
    const targets = spyRenames(() => applyPlan(dir, planAdapters(dir)));
    assert.deepEqual(targets, []);
    assert.deepEqual(hashTree(dir), before);
    assert.equal(fs.readFileSync(manifestPath(dir), 'utf8'), manifestBefore);
  } finally {
    cleanup(dir);
  }
});

test('applyPlan creates instruction files and replaces only the marked block', () => {
  const dir = tempProject();
  try {
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n\nOur rules.\n');
    applyPlan(dir, planAdapters(dir));
    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
    assert.ok(agents.startsWith('# Project\n\nOur rules.\n'));
    assert.match(agents, /<!-- idefactory:start -->[\s\S]*<!-- idefactory:end -->/);
    assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')));
    assert.ok(fs.existsSync(path.join(dir, '.github/copilot-instructions.md')));
  } finally {
    cleanup(dir);
  }
});

test('unifiedDiff is empty for equal text and ignores line endings', () => {
  assert.equal(unifiedDiff('a\nb\n', 'a\nb\n'), '');
  assert.equal(unifiedDiff('a\r\nb\r\n', 'a\nb\n'), '');
});

test('unifiedDiff shows removed and added lines with context and hunk headers', () => {
  const oldText = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].join('\n') + '\n';
  const newText = oldText.replace('five\n', 'FIVE\nextra\n');
  const diff = unifiedDiff(oldText, newText, { oldLabel: 'local/x.md', newLabel: 'incoming/x.md' });
  const lines = diff.split('\n');
  assert.equal(lines[0], '--- local/x.md');
  assert.equal(lines[1], '+++ incoming/x.md');
  assert.equal(lines[2], '@@ -2,7 +2,8 @@');
  assert.ok(lines.includes('-five'));
  assert.ok(lines.includes('+FIVE'));
  assert.ok(lines.includes('+extra'));
  assert.ok(lines.includes(' four'));
  assert.ok(!lines.includes(' one'), 'only three lines of context');
});

test('unifiedDiff handles added and removed whole files', () => {
  assert.match(unifiedDiff('', 'a\nb\n'), /@@ -0,0 \+1,2 @@\n\+a\n\+b\n$/);
  assert.match(unifiedDiff('a\nb\n', ''), /@@ -1,2 \+0,0 @@\n-a\n-b\n$/);
});

test('stageConflicts saves the incoming rendering and a diff for each preserved file', () => {
  const { dir, history } = legacyProject();
  const templates = changedTemplates();
  try {
    const edited = '.cursor/commands/factory-review.md';
    fs.appendFileSync(path.join(dir, edited), '\nPROJECT RULE\n');
    const plan = planAdapters(dir, { templates, history });
    const staged = stageConflicts(dir, plan, { now: new Date('2026-11-23T17:00:00Z') });
    assert.equal(staged.runId, '20261123T170000Z');
    const entry = staged.files.get(edited);
    assert.equal(entry.incoming, `.factory/upgrade/20261123T170000Z/incoming/${edited}`);
    assert.equal(entry.diff, `.factory/upgrade/20261123T170000Z/diffs/${edited}.diff`);
    const incoming = fs.readFileSync(path.join(dir, entry.incoming), 'utf8');
    assert.match(incoming, /NEW REVIEW LINE/);
    const diff = fs.readFileSync(path.join(dir, entry.diff), 'utf8');
    assert.match(diff, /^--- local\//m);
    assert.match(diff, /^-PROJECT RULE$/m);
    assert.match(diff, /^\+NEW REVIEW LINE$/m);
  } finally {
    removeDir(templates);
    cleanup(dir);
  }
});

test('stageConflicts creates no run directory when nothing is preserved', () => {
  const dir = tempProject();
  try {
    const staged = stageConflicts(dir, planAdapters(dir));
    assert.equal(staged, null);
    assert.equal(fs.existsSync(path.join(dir, '.factory/upgrade')), false);
  } finally {
    cleanup(dir);
  }
});

test('stageConflicts never reuses a run id', () => {
  const { dir, history } = legacyProject();
  const templates = changedTemplates();
  try {
    fs.appendFileSync(path.join(dir, '.cursor/commands/factory-review.md'), '\nPROJECT RULE\n');
    const plan = planAdapters(dir, { templates, history });
    const now = new Date('2026-11-23T17:00:00Z');
    const first = stageConflicts(dir, plan, { now });
    const second = stageConflicts(dir, plan, { now });
    assert.notEqual(first.runId, second.runId);
    assert.ok(fs.existsSync(first.runDir) && fs.existsSync(second.runDir));
  } finally {
    removeDir(templates);
    cleanup(dir);
  }
});

test('stageConflicts stages a preserved instruction section as the block', () => {
  const dir = tempProject();
  try {
    const block = renderAdapters(dir).find((item) => item.key === 'AGENTS.md#section').content;
    fs.writeFileSync(
      path.join(dir, 'AGENTS.md'),
      `# Project\n\n${block.replace('## IDE Factory', '## Our factory')}\nTail\n`,
    );
    const plan = planAdapters(dir, { history: { version: 1, files: {} } });
    const staged = stageConflicts(dir, plan);
    const entry = staged.files.get('AGENTS.md#section');
    const incoming = fs.readFileSync(path.join(dir, entry.incoming), 'utf8');
    assert.equal(incoming, block);
    const diff = fs.readFileSync(path.join(dir, entry.diff), 'utf8');
    assert.match(diff, /^-## Our factory$/m);
    assert.match(diff, /^\+## IDE Factory$/m);
    assert.ok(!diff.includes('Tail'));
  } finally {
    cleanup(dir);
  }
});
