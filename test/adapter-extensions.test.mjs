import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  digest,
  manifestPath,
  readManifest,
  renderAdapters,
} from '../src/lib/adapters.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

const SKILL_DIRS = ['.cursor/skills', '.claude/skills', '.github/skills', '.agents/skills', '.cline/skills'];
const COMMAND_PATHS = (name) => [
  `.cursor/commands/${name}.md`,
  `.claude/commands/${name}.md`,
  `.github/prompts/${name}.prompt.md`,
  `.cline/workflows/${name}.md`,
];
const RULE_PATHS = ['.cursor/rules/factory.mdc', '.github/agents/factory.agent.md', '.cline/rules/factory.md'];
const START = '<!-- idefactory:extension:start -->';
const END = '<!-- idefactory:extension:end -->';
const MARKER = '<!-- idefactory:owned -->';

function writeExtension(dir, rel, text) {
  const file = path.join(dir, '.factory/extensions', rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function read(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

function sectionOf(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  assert.ok(start !== -1 && end > start, 'extension section present');
  return text.slice(start, end + END.length);
}

test('with no extension files every rendering equals the template rendering', async () => {
  const dir = tempProject();
  try {
    const rendered = renderAdapters(dir);
    const reference = renderAdapters(repoRoot);
    assert.deepEqual(
      rendered.map((item) => [item.key, item.content]),
      reference.map((item) => [item.key, item.content]),
    );
    assert.ok(rendered.every((item) => !item.content.includes(START)));
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.equal(fs.existsSync(path.join(dir, '.factory/extensions')), false);
  } finally {
    cleanup(dir);
  }
});

test('an empty or whitespace extension adds nothing', () => {
  const dir = tempProject();
  try {
    const baseline = renderAdapters(dir).map((item) => item.content);
    writeExtension(dir, 'skills/factory-build.md', '');
    writeExtension(dir, 'commands/factory-review.md', '  \n\r\n\t\n');
    writeExtension(dir, 'rules/factory.md', '\n');
    assert.deepEqual(renderAdapters(dir).map((item) => item.content), baseline);
  } finally {
    cleanup(dir);
  }
});

test('a skill extension appears in all five skill directories', async () => {
  const dir = tempProject();
  try {
    writeExtension(dir, 'skills/factory-build.md', 'Task-type-aware review: lightweight items need no red.\n');
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const skillDir of SKILL_DIRS) {
      const text = read(dir, `${skillDir}/factory-build/SKILL.md`);
      assert.match(sectionOf(text), /Task-type-aware review: lightweight items need no red\./);
      assert.ok(text.indexOf(START) > text.indexOf('# '), 'after the factory text');
    }
    assert.ok(!read(dir, '.cursor/skills/factory-run/SKILL.md').includes(START));
  } finally {
    cleanup(dir);
  }
});

test('a command extension appears in all four locations before the owned marker', async () => {
  const dir = tempProject();
  try {
    writeExtension(dir, 'commands/factory-review.md', 'Reviewers also check our style guide.\n');
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const plain = renderAdapters(repoRoot);
    for (const rel of COMMAND_PATHS('factory-review')) {
      const text = read(dir, rel);
      const base = plain.find((item) => item.path === rel).content;
      assert.match(sectionOf(text), /Reviewers also check our style guide\./);
      assert.ok(text.endsWith(`\n\n${MARKER}\n`), rel);
      assert.ok(text.indexOf(END) < text.lastIndexOf(MARKER), rel);
      const frontMatter = base.match(/^---\n[\s\S]*?\n---\n/);
      if (frontMatter) assert.ok(text.startsWith(frontMatter[0]), rel);
      assert.ok(text.startsWith(base.slice(0, base.indexOf(MARKER) - 2)), rel);
    }
    assert.ok(!read(dir, '.cursor/commands/factory-status.md').includes(START));
  } finally {
    cleanup(dir);
  }
});

test('a rules extension appears in the Cursor rule, the Copilot agent, and the Cline rule', async () => {
  const dir = tempProject();
  try {
    writeExtension(dir, 'rules/factory.md', 'Our branch names start with team/.\n');
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const rel of RULE_PATHS) {
      assert.match(sectionOf(read(dir, rel)), /Our branch names start with team\//, rel);
    }
  } finally {
    cleanup(dir);
  }
});

test('the section text and precedence line are identical in every copy', async () => {
  const dir = tempProject();
  try {
    writeExtension(dir, 'skills/factory-build.md', 'Project text.\r\nSecond line.\r\n');
    writeExtension(dir, 'commands/factory-review.md', 'Command text.\n');
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const skillSections = new Set(
      SKILL_DIRS.map((skillDir) => sectionOf(read(dir, `${skillDir}/factory-build/SKILL.md`))),
    );
    assert.equal(skillSections.size, 1);
    const [section] = [...skillSections];
    assert.match(section, /^<!-- idefactory:extension:start -->\n## Project extensions\n/);
    assert.match(section, /`\.factory\/extensions\/skills\/factory-build\.md`/);
    assert.match(section, /Where it conflicts with the factory text above, follow the text below\./);
    assert.ok(section.includes('Project text.\nSecond line.\n'));
    assert.ok(!section.includes('\r'));
    const commandSections = new Set(
      COMMAND_PATHS('factory-review').map((rel) => sectionOf(read(dir, rel))),
    );
    assert.equal(commandSections.size, 1);
    assert.match([...commandSections][0], /`\.factory\/extensions\/commands\/factory-review\.md`/);
  } finally {
    cleanup(dir);
  }
});

test('init and upgrade never write an extension file', async () => {
  const dir = tempProject();
  try {
    const file = writeExtension(dir, 'skills/factory-build.md', 'Keep me exactly.\n\n');
    const stranger = writeExtension(dir, 'skills/not-a-skill.md', 'Ignored.\n');
    const before = [fs.readFileSync(file), fs.readFileSync(stranger)];
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.equal((await idefactory(dir, ['upgrade'])).code, 0);
    assert.deepEqual([fs.readFileSync(file), fs.readFileSync(stranger)], before);
    assert.deepEqual(fs.readdirSync(path.join(dir, '.factory/extensions/skills')).sort(), [
      'factory-build.md',
      'not-a-skill.md',
    ]);
  } finally {
    cleanup(dir);
  }
});

const BUILD_SKILLS = SKILL_DIRS.map((skillDir) => `${skillDir}/factory-build/SKILL.md`);

test('editing an extension updates every unmodified copy and records new digests', async () => {
  const dir = tempProject();
  try {
    writeExtension(dir, 'skills/factory-build.md', 'First version.\n');
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const first = readManifest(dir).files[BUILD_SKILLS[0]].digest;
    writeExtension(dir, 'skills/factory-build.md', 'Second version.\n');
    const result = await idefactory(dir, ['upgrade']);
    assert.equal(result.code, 0, result.err + result.out);
    assert.match(result.out, /5 update/);
    for (const rel of BUILD_SKILLS) {
      assert.match(read(dir, rel), /Second version\./);
      assert.doesNotMatch(read(dir, rel), /First version\./);
      assert.equal(readManifest(dir).files[rel].digest, digest(read(dir, rel)));
    }
    assert.notEqual(readManifest(dir).files[BUILD_SKILLS[0]].digest, first);
  } finally {
    cleanup(dir);
  }
});

test('adding an extension to an existing install updates the copies', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeExtension(dir, 'rules/factory.md', 'Late addition.\n');
    const result = await idefactory(dir, ['upgrade']);
    assert.equal(result.code, 0, result.err + result.out);
    assert.match(result.out, /3 update/);
    for (const rel of RULE_PATHS) assert.match(read(dir, rel), /Late addition\./);
  } finally {
    cleanup(dir);
  }
});

test('removing an extension removes the section from unmodified copies', async () => {
  const dir = tempProject();
  try {
    writeExtension(dir, 'commands/factory-review.md', 'Temporary.\n');
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.rmSync(path.join(dir, '.factory/extensions'), { recursive: true });
    const result = await idefactory(dir, ['upgrade']);
    assert.equal(result.code, 0, result.err + result.out);
    for (const rel of COMMAND_PATHS('factory-review')) {
      assert.doesNotMatch(read(dir, rel), /idefactory:extension|Temporary\./);
    }
    assert.deepEqual(
      renderAdapters(dir).filter((item) => item.name === 'factory-review').map((item) => item.content),
      renderAdapters(repoRoot).filter((item) => item.name === 'factory-review').map((item) => item.content),
    );
  } finally {
    cleanup(dir);
  }
});

test('a hand-edited copy beside an extension is preserved when the extension changes', async () => {
  const dir = tempProject();
  try {
    writeExtension(dir, 'skills/factory-build.md', 'First version.\n');
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    fs.appendFileSync(path.join(dir, BUILD_SKILLS[0]), '\nHand edit.\n');
    writeExtension(dir, 'skills/factory-build.md', 'Second version.\n');
    const result = await idefactory(dir, ['upgrade']);
    assert.equal(result.code, 3, result.err + result.out);
    assert.match(result.out, /1 preserved/);
    assert.match(read(dir, BUILD_SKILLS[0]), /First version\.[\s\S]*Hand edit\./);
    for (const rel of BUILD_SKILLS.slice(1)) assert.match(read(dir, rel), /Second version\./);
  } finally {
    cleanup(dir);
  }
});

test('a second run after an extension change is idempotent', async () => {
  const dir = tempProject();
  try {
    writeExtension(dir, 'skills/factory-build.md', 'One.\n');
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    writeExtension(dir, 'skills/factory-build.md', 'Two.\n');
    assert.equal((await idefactory(dir, ['upgrade'])).code, 0);
    const manifest = fs.readFileSync(manifestPath(dir), 'utf8');
    const again = await idefactory(dir, ['upgrade']);
    assert.equal(again.code, 0);
    assert.match(again.out, /0 update, 0 create, 0 modified, 0 preserved/);
    assert.equal(fs.readFileSync(manifestPath(dir), 'utf8'), manifest);
  } finally {
    cleanup(dir);
  }
});
