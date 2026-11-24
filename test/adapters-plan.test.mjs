import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  classify,
  digest,
  manifestPath,
  planAdapters,
  readManifest,
  renderAdapters,
  renderSectionInto,
  writeManifest,
} from '../src/lib/adapters.mjs';
import { cleanup, repoRoot, tempProject } from './helpers.mjs';

test('a missing manifest reads as empty', () => {
  const dir = tempProject();
  try {
    const manifest = readManifest(dir);
    assert.equal(manifest.version, 1);
    assert.deepEqual(manifest.files, {});
    assert.equal(fs.existsSync(manifestPath(dir)), false);
  } finally {
    cleanup(dir);
  }
});

test('writeManifest sorts keys and a rewrite with no change is byte-identical', () => {
  const dir = tempProject();
  try {
    writeManifest(dir, {
      version: 1,
      files: { 'b.md': { digest: 'bb' }, 'a.md': { digest: 'aa', pinned: true } },
    });
    const first = fs.readFileSync(manifestPath(dir), 'utf8');
    const parsed = JSON.parse(first);
    assert.deepEqual(Object.keys(parsed.files), ['a.md', 'b.md']);
    assert.equal(parsed.version, 1);
    assert.match(parsed.tool, /^\d+\.\d+\.\d+/);
    assert.ok(first.endsWith('\n'));

    writeManifest(dir, readManifest(dir));
    assert.equal(fs.readFileSync(manifestPath(dir), 'utf8'), first);
  } finally {
    cleanup(dir);
  }
});

test('writeManifest goes through a temporary file and a rename', () => {
  const dir = tempProject();
  const original = fs.renameSync;
  const calls = [];
  try {
    fs.renameSync = (from, to) => {
      calls.push({ from, to, fromExisted: fs.existsSync(from), toExisted: fs.existsSync(to) });
      return original(from, to);
    };
    writeManifest(dir, { version: 1, files: { 'a.md': { digest: 'aa' } } });
  } finally {
    fs.renameSync = original;
  }
  try {
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, manifestPath(dir));
    assert.notEqual(calls[0].from, manifestPath(dir));
    assert.equal(calls[0].fromExisted, true);
    assert.deepEqual(
      fs.readdirSync(path.dirname(manifestPath(dir))).filter((name) => name.includes('.tmp')),
      [],
    );
  } finally {
    cleanup(dir);
  }
});

test('an unreadable or wrong-version manifest fails and names the file', () => {
  const dir = tempProject();
  try {
    fs.mkdirSync(path.dirname(manifestPath(dir)), { recursive: true });
    fs.writeFileSync(manifestPath(dir), '{not json');
    assert.throws(() => readManifest(dir), /adapters\.json/);
    fs.writeFileSync(manifestPath(dir), JSON.stringify({ version: 2, files: {} }));
    assert.throws(() => readManifest(dir), /adapters\.json.*version/i);
    fs.writeFileSync(manifestPath(dir), JSON.stringify({ version: 1, files: [] }));
    assert.throws(() => readManifest(dir), /adapters\.json/);
  } finally {
    cleanup(dir);
  }
});

const OLD = digest('old\n');
const NEW = digest('new\n');
const EDIT = digest('edited\n');
const ANCIENT = digest('ancient\n');

function status(input) {
  return classify({ rendering: NEW, history: [ANCIENT, OLD], ...input }).status;
}

test('classify: a pinned entry is skipped even when the file is absent or edited', () => {
  assert.equal(status({ local: EDIT, baseline: OLD, pinned: true }), 'pinned');
  assert.equal(status({ local: null, baseline: OLD, pinned: true }), 'pinned');
  assert.equal(
    classify({ rendering: NEW, local: EDIT, baseline: OLD, pinned: true, history: [] }).upstreamChanged,
    true,
  );
  assert.equal(
    classify({ rendering: NEW, local: EDIT, baseline: NEW, pinned: true, history: [] }).upstreamChanged,
    false,
  );
});

test('classify: an absent file is created', () => {
  assert.equal(status({ local: null, baseline: OLD }), 'create');
  assert.equal(status({ local: null, baseline: null }), 'create');
});

test('classify: a file equal to the new rendering is current', () => {
  assert.equal(status({ local: NEW, baseline: OLD }), 'current');
  assert.equal(status({ local: NEW, baseline: null }), 'current');
  assert.equal(status({ local: NEW, baseline: NEW }), 'current');
});

test('classify: a file equal to its baseline is updated', () => {
  assert.equal(status({ local: OLD, baseline: OLD, history: [] }), 'update');
});

test('classify: with no manifest entry a past rendering is updated', () => {
  assert.equal(status({ local: ANCIENT, baseline: null }), 'update');
  assert.equal(status({ local: OLD, baseline: null }), 'update');
});

test('classify: a past rendering that differs from a recorded baseline is still updated', () => {
  assert.equal(status({ local: ANCIENT, baseline: OLD }), 'update');
});

test('classify: an edited file is preserved with or without a baseline', () => {
  assert.equal(status({ local: EDIT, baseline: OLD }), 'preserved');
  assert.equal(status({ local: EDIT, baseline: null }), 'preserved');
  assert.equal(status({ local: EDIT, baseline: null, history: [] }), 'preserved');
});

test('classify: an edited file whose upstream rendering did not change is only modified', () => {
  assert.equal(status({ local: EDIT, baseline: NEW, rendering: NEW }), 'modified');
  assert.equal(status({ local: EDIT, baseline: NEW }), 'modified');
  assert.equal(status({ local: EDIT, baseline: null }), 'preserved');
  assert.equal(status({ local: EDIT, baseline: OLD }), 'preserved');
});

test('classify: line endings alone never preserve a file', () => {
  const crlf = digest('old\r\n');
  assert.equal(status({ local: crlf, baseline: OLD }), 'update');
  assert.equal(status({ local: digest('new\r\n'), baseline: OLD }), 'current');
});

function walkTree(root, rel = '') {
  const out = [];
  const dir = rel ? path.join(root, rel) : root;
  for (const name of fs.readdirSync(dir).sort()) {
    const next = rel ? `${rel}/${name}` : name;
    if (fs.statSync(path.join(root, next)).isDirectory()) out.push(...walkTree(root, next));
    else out.push(next);
  }
  return out;
}

function hashTree(root) {
  return walkTree(root).map((rel) => `${rel}:${digest(fs.readFileSync(path.join(root, rel), 'utf8'))}`);
}

function writeRendering(dir, entries) {
  for (const item of entries) {
    if (item.scope !== 'file') continue;
    const file = path.join(dir, item.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, item.content);
  }
}

function historyOf(entries) {
  const files = {};
  for (const item of entries) files[item.key] = [digest(item.content)];
  return { version: 1, files };
}

function changedTemplates() {
  const templates = fs.mkdtempSync(path.join(os.tmpdir(), 'idefactory-templates-'));
  fs.cpSync(path.join(repoRoot, 'templates'), templates, { recursive: true });
  const skill = path.join(templates, 'skills/factory-build/SKILL.md');
  fs.appendFileSync(skill, '\nNEW UPSTREAM LINE\n');
  const command = path.join(templates, 'commands/factory-review.md');
  fs.appendFileSync(command, '\nNEW REVIEW LINE\n');
  return templates;
}

function byStatus(plan) {
  const out = {};
  for (const item of plan.files) (out[item.status] ||= []).push(item.key);
  return out;
}

test('planAdapters plans every file as create in an empty project', () => {
  const dir = tempProject();
  try {
    const plan = planAdapters(dir);
    const files = plan.files.filter((item) => item.scope === 'file');
    assert.ok(files.length > 80);
    assert.ok(files.every((item) => item.status === 'create'));
  } finally {
    cleanup(dir);
  }
});

test('planAdapters plans update for a pristine legacy install and keeps the rest current', () => {
  const dir = tempProject();
  const templates = changedTemplates();
  try {
    const old = renderAdapters(dir);
    writeRendering(dir, old);
    const plan = planAdapters(dir, { templates, history: historyOf(old) });
    const grouped = byStatus(plan);
    assert.deepEqual(
      grouped.update.filter((key) => !key.includes('#')).sort(),
      [
        ...['.cursor', '.claude', '.github', '.agents', '.cline'].map((d) => `${d}/skills/factory-build/SKILL.md`),
        '.cursor/commands/factory-review.md',
        '.claude/commands/factory-review.md',
        '.github/prompts/factory-review.prompt.md',
        '.cline/workflows/factory-review.md',
      ].sort(),
    );
    assert.equal(grouped.preserved, undefined);
    assert.ok(grouped.current.length > 70);
  } finally {
    fs.rmSync(templates, { recursive: true, force: true });
    cleanup(dir);
  }
});

test('planAdapters preserves one edited file and still updates the others', () => {
  const dir = tempProject();
  const templates = changedTemplates();
  try {
    const old = renderAdapters(dir);
    writeRendering(dir, old);
    fs.appendFileSync(path.join(dir, '.cursor/commands/factory-review.md'), '\nPROJECT RULE\n');
    const plan = planAdapters(dir, { templates, history: historyOf(old) });
    const grouped = byStatus(plan);
    assert.deepEqual(grouped.preserved, ['.cursor/commands/factory-review.md']);
    assert.ok(grouped.update.includes('.claude/commands/factory-review.md'));
    assert.ok(grouped.update.includes('.cursor/skills/factory-build/SKILL.md'));
  } finally {
    fs.rmSync(templates, { recursive: true, force: true });
    cleanup(dir);
  }
});

test('planAdapters preserves a file at a generated path that no release wrote', () => {
  const dir = tempProject();
  try {
    const file = path.join(dir, '.cursor/commands/factory-status.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'My own status command\n');
    const plan = planAdapters(dir);
    const item = plan.files.find((entry) => entry.key === '.cursor/commands/factory-status.md');
    assert.equal(item.status, 'preserved');
    assert.equal(plan.files.find((entry) => entry.key === '.claude/commands/factory-status.md').status, 'create');
  } finally {
    cleanup(dir);
  }
});

test('planAdapters uses the manifest baseline when there is one', () => {
  const dir = tempProject();
  const templates = changedTemplates();
  try {
    const old = renderAdapters(dir);
    writeRendering(dir, old);
    const files = {};
    for (const item of old) files[item.key] = { digest: digest(item.content) };
    writeManifest(dir, { version: 1, files });
    const plan = planAdapters(dir, { templates, history: { version: 1, files: {} } });
    assert.equal(byStatus(plan).update.filter((key) => !key.includes('#')).length, 9);
    assert.equal(byStatus(plan).preserved, undefined);
  } finally {
    fs.rmSync(templates, { recursive: true, force: true });
    cleanup(dir);
  }
});

test('planAdapters never lists or touches unrelated files and writes nothing', () => {
  const dir = tempProject();
  try {
    const own = path.join(dir, '.cursor/skills/team-skill/SKILL.md');
    fs.mkdirSync(path.dirname(own), { recursive: true });
    fs.writeFileSync(own, 'team\n');
    fs.mkdirSync(path.join(dir, '.cline/rules'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.cline/rules/team-style.md'), 'style\n');
    const before = hashTree(dir);
    const plan = planAdapters(dir);
    assert.deepEqual(hashTree(dir), before);
    const keys = plan.files.map((item) => item.key);
    assert.ok(!keys.includes('.cursor/skills/team-skill/SKILL.md'));
    assert.ok(!keys.includes('.cline/rules/team-style.md'));
  } finally {
    cleanup(dir);
  }
});

function sectionTemplates() {
  const templates = fs.mkdtempSync(path.join(os.tmpdir(), 'idefactory-templates-'));
  fs.cpSync(path.join(repoRoot, 'templates'), templates, { recursive: true });
  fs.appendFileSync(path.join(templates, 'fragments/instructions.md'), '\nNEW SECTION LINE\n');
  return templates;
}

function sectionItem(plan, file = 'AGENTS.md') {
  return plan.files.find((item) => item.key === `${file}#section`);
}

function oldBlock(dir) {
  return renderAdapters(dir).find((item) => item.key === 'AGENTS.md#section').content;
}

function oldHistory(dir) {
  return historyOf(renderAdapters(dir));
}

test('section: a missing file is created from the block alone', () => {
  const dir = tempProject();
  try {
    const item = sectionItem(planAdapters(dir));
    assert.equal(item.status, 'create');
    assert.equal(renderSectionInto(item), item.content);
  } finally {
    cleanup(dir);
  }
});

test('section: a file with no markers gets the block appended after the project text', () => {
  const dir = tempProject();
  try {
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n\nOur rules.\n');
    const item = sectionItem(planAdapters(dir));
    assert.equal(item.status, 'create');
    assert.equal(renderSectionInto(item), `# Project\n\nOur rules.\n\n${item.content}`);
  } finally {
    cleanup(dir);
  }
});

test('section: an unmodified section is updated and only the block bytes change', () => {
  const dir = tempProject();
  const templates = sectionTemplates();
  try {
    const before = '# Project\n\nIntro.\n\n';
    const after = '\n## Team notes\n\nTail text.\n';
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), `${before}${oldBlock(dir)}${after}`);
    const item = sectionItem(planAdapters(dir, { templates, history: oldHistory(dir) }));
    assert.equal(item.status, 'update');
    const next = renderSectionInto(item);
    assert.ok(next.startsWith(before));
    assert.ok(next.endsWith(after));
    assert.ok(next.includes('NEW SECTION LINE'));
    assert.equal(next, `${before}${item.content}${after}`);
  } finally {
    fs.rmSync(templates, { recursive: true, force: true });
    cleanup(dir);
  }
});

test('section: an edited section is preserved', () => {
  const dir = tempProject();
  const templates = sectionTemplates();
  try {
    const edited = oldBlock(dir).replace('## IDE Factory', '## IDE Factory (our edits)');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), `# Project\n\n${edited}`);
    const item = sectionItem(planAdapters(dir, { templates, history: oldHistory(dir) }));
    assert.equal(item.status, 'preserved');
  } finally {
    fs.rmSync(templates, { recursive: true, force: true });
    cleanup(dir);
  }
});

test('section: unpaired, reversed, and repeated markers are malformed and never changed', () => {
  const dir = tempProject();
  try {
    const block = oldBlock(dir);
    const cases = {
      'start without end': '# P\n\n<!-- idefactory:start -->\nhalf\n',
      'end without start': '# P\n\nhalf\n<!-- idefactory:end -->\n',
      reversed: '# P\n\n<!-- idefactory:end -->\nx\n<!-- idefactory:start -->\n',
      repeated: `# P\n\n${block}\n${block}`,
    };
    for (const [name, text] of Object.entries(cases)) {
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), text);
      const item = sectionItem(planAdapters(dir));
      assert.equal(item.status, 'malformed', name);
      assert.match(item.reason, /marker/i, name);
      assert.throws(() => renderSectionInto(item), /malformed/i, name);
      assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), text, name);
    }
  } finally {
    cleanup(dir);
  }
});

test('section: a CRLF file is updated with CRLF and the rest is untouched', () => {
  const dir = tempProject();
  const templates = sectionTemplates();
  try {
    const crlf = (text) => text.replace(/\n/g, '\r\n');
    const before = crlf('# Project\n\nIntro.\n\n');
    const after = crlf('\nTail.\n');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), `${before}${crlf(oldBlock(dir))}${after}`);
    const item = sectionItem(planAdapters(dir, { templates, history: oldHistory(dir) }));
    assert.equal(item.status, 'update');
    const next = renderSectionInto(item);
    assert.equal(next, `${before}${crlf(item.content)}${after}`);
    assert.ok(!/[^\r]\n/.test(next));
  } finally {
    fs.rmSync(templates, { recursive: true, force: true });
    cleanup(dir);
  }
});

test('section: a block equal to the new rendering is current even with CRLF', () => {
  const dir = tempProject();
  try {
    const block = oldBlock(dir).replace(/\n/g, '\r\n');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), `# P\r\n\r\n${block}`);
    assert.equal(sectionItem(planAdapters(dir)).status, 'current');
  } finally {
    cleanup(dir);
  }
});

test('orphan: a recorded path that is no longer rendered is listed and the file is kept', () => {
  const dir = tempProject();
  try {
    const file = path.join(dir, '.cursor/commands/factory-retired.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'retired\n');
    const manifest = { version: 1, files: { '.cursor/commands/factory-retired.md': { digest: digest('retired\n') } } };
    const before = hashTree(dir);
    const plan = planAdapters(dir, { manifest });
    assert.deepEqual(plan.orphans.map((item) => item.path), ['.cursor/commands/factory-retired.md']);
    assert.equal(plan.orphans[0].source, 'manifest');
    assert.deepEqual(plan.drop, []);
    assert.deepEqual(hashTree(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('orphan: a path only a past release wrote is listed when the file exists', () => {
  const dir = tempProject();
  try {
    const present = path.join(dir, '.claude/skills/factory-gone/SKILL.md');
    fs.mkdirSync(path.dirname(present), { recursive: true });
    fs.writeFileSync(present, 'old\n');
    const history = {
      version: 1,
      files: {
        '.claude/skills/factory-gone/SKILL.md': [digest('old\n')],
        '.cline/skills/factory-gone/SKILL.md': [digest('old\n')],
      },
    };
    const plan = planAdapters(dir, { history });
    assert.deepEqual(plan.orphans.map((item) => [item.path, item.source]), [
      ['.claude/skills/factory-gone/SKILL.md', 'history'],
    ]);
  } finally {
    cleanup(dir);
  }
});

test('orphan: an entry whose file is gone is dropped and not listed', () => {
  const dir = tempProject();
  try {
    const manifest = {
      version: 1,
      files: { '.cursor/commands/factory-retired.md': { digest: digest('x\n') } },
    };
    const plan = planAdapters(dir, { manifest });
    assert.deepEqual(plan.orphans, []);
    assert.deepEqual(plan.drop, ['.cursor/commands/factory-retired.md']);
  } finally {
    cleanup(dir);
  }
});

test('orphan: a currently rendered path is never an orphan', () => {
  const dir = tempProject();
  try {
    const rendered = renderAdapters(dir);
    writeRendering(dir, rendered);
    const plan = planAdapters(dir, { history: historyOf(rendered) });
    assert.deepEqual(plan.orphans, []);
    assert.deepEqual(plan.drop, []);
  } finally {
    cleanup(dir);
  }
});
