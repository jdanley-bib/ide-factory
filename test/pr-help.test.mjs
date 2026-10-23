import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

const HELP_LINES = [
  'idefactory pr open',
  'idefactory pr comment',
  'idefactory pr capture',
  'idefactory ci scaffold',
];

test('command help names pr open, pr comment, pr capture, and ci scaffold', async () => {
  const dir = tempProject();
  try {
    const result = await idefactory(dir, ['help']);
    assert.equal(result.code, 0, result.err);
    for (const line of HELP_LINES) {
      assert.match(result.out, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  } finally {
    cleanup(dir);
  }
});
