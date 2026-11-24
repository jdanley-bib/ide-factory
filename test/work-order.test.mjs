import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { compareTaskIds, listWorkItems, selectReady, upsertWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

test('compareTaskIds orders dotted OpenSpec ids numerically', () => {
  assert.ok(compareTaskIds('2.1', '10.1') < 0);
  assert.ok(compareTaskIds('10.1', '2.1') > 0);
  assert.ok(compareTaskIds('1.2', '1.10') < 0);
  assert.deepEqual(
    ['10.2', '2.1', '1.3', '10.1', '1.10'].sort(compareTaskIds),
    ['1.3', '1.10', '2.1', '10.1', '10.2'],
  );
});

test('listWorkItems and next prefer 2.1 over 10.1', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const id of ['1.1', '10.1', '2.1', '10.2']) {
      upsertWorkItem(dir, {
        change: 'demo',
        id,
        title: `Task ${id}`,
        status: id === '1.1' ? 'done' : 'todo',
        dependencies: [],
        acceptanceCriteria: [`${id} works`],
        factory: { roles: ['engineer'], checks: ['unit'] },
      });
    }

    assert.deepEqual(
      listWorkItems(dir, 'demo').map((item) => item.id),
      ['1.1', '2.1', '10.1', '10.2'],
    );
    assert.equal(selectReady(dir, 'demo')?.id, '2.1');

    const next = await idefactory(dir, ['next', '--change', 'demo']);
    assert.equal(next.code, 0, next.err);
    assert.match(next.out, /Work item: demo\/2\.1/);
    assert.doesNotMatch(next.out, /Work item: demo\/10\./);

    const index = JSON.parse(
      fs.readFileSync(path.join(dir, '.factory/work/index.json'), 'utf8'),
    );
    assert.deepEqual(
      index.items.filter((item) => item.change === 'demo').map((item) => item.id),
      ['1.1', '2.1', '10.1', '10.2'],
    );
  } finally {
    cleanup(dir);
  }
});
