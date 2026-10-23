import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

test('doctor warns about policy version 1 and unmapped checks without failing', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const configPath = path.join(dir, '.factory/config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.governance.policyVersion = 1;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const profiles = JSON.parse(fs.readFileSync(path.join(dir, '.factory/profiles.json'), 'utf8'));
    profiles['frontend-low'].checks = ['unit', 'custom-kind'];
    fs.writeFileSync(path.join(dir, '.factory/profiles.json'), JSON.stringify(profiles, null, 2));
    const result = await idefactory(dir, ['doctor']);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /policy version: 1/);
    assert.match(result.err, /verified principal/);
    assert.match(`${result.out}${result.err}`, /custom-kind/);
  } finally {
    cleanup(dir);
  }
});
