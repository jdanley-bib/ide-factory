import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

test('approve usage names the principal flags', async () => {
  const dir = tempProject();
  try {
    const result = await idefactory(dir, ['help']);
    assert.equal(result.code, 0, result.err);
    const line = result.out.split('\n').find((entry) => entry.includes('idefactory approve'));
    assert.ok(line, 'help must print an approve usage line');
    assert.match(line, /--principal-provider/);
    assert.match(line, /--principal-subject/);
  } finally {
    cleanup(dir);
  }
});
