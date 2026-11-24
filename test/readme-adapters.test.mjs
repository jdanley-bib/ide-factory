import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { idefactory, tempProject, cleanup } from './helpers.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');

function upgradeSection() {
  const start = readme.indexOf('## Upgrading adapters');
  assert.ok(start >= 0, 'README must have an Upgrading adapters section');
  const next = readme.indexOf('\n## ', start + 1);
  return readme.slice(start, next >= 0 ? next : undefined);
}

const TERMS = [
  '.factory/adapters.json',
  'templates/adapter-history.json',
  'exit',
  'code 3',
  '--dry-run',
  '--json',
  '--replace',
  '--force',
  'adapters pin',
  'adapters unpin',
  '.factory/extensions/skills/',
  '.factory/extensions/commands/',
  '.factory/extensions/rules/factory.md',
  '.factory/upgrade/',
  'Project extensions',
  ...['current', 'create', 'update', 'modified', 'preserved', 'pinned', 'malformed', 'orphan'].map(
    (status) => `\`${status}\``,
  ),
];

test('README documents the adapter manifest, report, flags, extensions, and migration', () => {
  const section = upgradeSection();
  for (const term of TERMS) assert.ok(section.includes(term), `README is missing: ${term}`);
  assert.match(section, /migrate an install made by an earlier release/);
});

test('README command table and --help list the upgrade flags and adapters pin', async () => {
  assert.match(readme, /\| `idefactory upgrade` \|[^\n]*--dry-run[^\n]*--replace/);
  assert.match(readme, /\| `idefactory adapters pin <path>` \|/);
  assert.doesNotMatch(readme, /Refresh factory-owned skills, commands, rules, and workflows/);
  const dir = tempProject();
  try {
    const help = await idefactory(dir, ['--help']);
    const text = help.out + help.err;
    for (const flag of ['--dry-run', '--json', '--replace', '--force', 'adapters pin', 'unpin']) {
      assert.ok(text.includes(flag), `--help is missing: ${flag}`);
    }
  } finally {
    cleanup(dir);
  }
});
