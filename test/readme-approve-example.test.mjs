import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('README approve example names the principal flags', () => {
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
  const gatesStart = readme.indexOf('## Gates and stops');
  assert.ok(gatesStart >= 0, 'README must have a Gates and stops section');
  const nextHeading = readme.indexOf('\n## ', gatesStart + 1);
  const gatesSection = nextHeading >= 0 ? readme.slice(gatesStart, nextHeading) : readme.slice(gatesStart);
  const line = gatesSection.split('\n').find((entry) => entry.trimStart().startsWith('idefactory approve'));
  assert.ok(line, 'Gates section must include an approve command example');
  assert.match(line, /--principal-provider/);
  assert.match(line, /--principal-subject/);
});
