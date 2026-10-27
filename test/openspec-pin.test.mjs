import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { repoRoot } from './helpers.mjs';

test('@fission-ai/openspec is pinned exactly to 1.14.3 with no Squad packages', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  );
  const deps = manifest.devDependencies || {};

  assert.equal(
    deps['@fission-ai/openspec'],
    '1.14.3',
    '@fission-ai/openspec must be exactly 1.14.3 with no version range',
  );

  const names = Object.keys(deps);
  assert.equal(
    names.includes('@bradygaster/squad'),
    false,
    'devDependencies must not include @bradygaster/squad',
  );
  assert.equal(
    names.some((name) => name.startsWith('@squad4cursor/')),
    false,
    'devDependencies must not include @squad4cursor/* packages',
  );
});
