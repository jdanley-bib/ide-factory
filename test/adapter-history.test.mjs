import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { digest, loadHistory, renderAdapters } from '../src/lib/adapters.mjs';
import { legacyRelease } from './adapter-helpers.mjs';
import { repoRoot } from './helpers.mjs';

const table = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'templates/adapter-history.json'), 'utf8'),
);

test('the history table lists the current rendering of every generated path', () => {
  const missing = [];
  for (const entry of renderAdapters(repoRoot)) {
    const known = table.files[entry.key] || [];
    if (!known.includes(digest(entry.content))) missing.push(entry.key);
  }
  assert.deepEqual(
    missing,
    [],
    'run node scripts/build-adapter-history.mjs after changing a template',
  );
});

test('the history table keeps more than one digest for a path that changed', () => {
  const changed = Object.values(table.files).filter((digests) => digests.length > 1);
  assert.ok(changed.length > 0);
  assert.ok(table.files['.cursor/commands/factory-review.md'].length > 1);
  assert.ok(table.files['AGENTS.md#section'].length > 1);
});

test('the history table is sorted and holds only hex digests', () => {
  const keys = Object.keys(table.files);
  assert.deepEqual(keys, [...keys].sort());
  assert.equal(table.version, 1);
  for (const [key, digests] of Object.entries(table.files)) {
    assert.deepEqual(digests, [...digests].sort(), key);
    assert.equal(new Set(digests).size, digests.length, key);
    for (const value of digests) assert.match(value, /^[0-9a-f]{64}$/, key);
  }
});

test('the history table does not list files the factory must not ship', () => {
  assert.equal(table.files['GOLDEN_RULES.md'], undefined);
  assert.ok(!Object.keys(table.files).some((key) => key.startsWith('.factory/')));
});

test('the legacy release fixture is recognized by the shipped history table', () => {
  const history = loadHistory();
  const keys = new Map(renderAdapters(repoRoot).filter((item) => item.scope === 'file').map((item) => [item.path, item]));
  let differing = 0;
  for (const [rel, content] of legacyRelease()) {
    const item = keys.get(rel);
    if (!item) continue;
    if (digest(content) !== digest(item.content)) differing += 1;
    assert.ok(history.files[item.key]?.includes(digest(content)), `${rel} is in the history table`);
  }
  assert.ok(differing > 0, 'the fixture differs from the current rendering');
});
