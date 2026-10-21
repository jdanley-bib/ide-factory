import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { openspecEntry, resolveOpenspecEntry, runOpenspec } from '../src/lib/openspec-cli.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

test('resolveOpenspecEntry maps npm .bin shims to openspec.js', () => {
  const shim = path.join(repoRoot, 'node_modules', '.bin', 'openspec');
  const cli = path.join(repoRoot, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
  assert.ok(fs.existsSync(cli), 'devDependency @fission-ai/openspec should be installed');
  assert.equal(resolveOpenspecEntry(shim), path.resolve(cli));

  const cmd = path.join(repoRoot, 'node_modules', '.bin', 'openspec.cmd');
  if (fs.existsSync(cmd)) {
    assert.equal(resolveOpenspecEntry(cmd), path.resolve(cli));
  }
});

test('openspecEntry prefers the package JS bin over .bin shims', () => {
  const entry = openspecEntry(repoRoot, process.env);
  assert.match(entry.replace(/\\/g, '/'), /@fission-ai\/openspec\/bin\/openspec\.js$/);
});

test('runOpenspec can invoke openspec --version via node', () => {
  const dir = tempProject();
  try {
    const result = runOpenspec(dir, ['--version'], process.env);
    assert.match(result.stdout.trim(), /^\d+\.\d+/);
  } finally {
    cleanup(dir);
  }
});

test('init --with-openspec creates openspec/config.yaml on Windows-safe spawn', async () => {
  const dir = tempProject();
  try {
    const result = await idefactory(dir, ['init', '--with-openspec']);
    assert.equal(result.code, 0, result.err || result.out);
    assert.equal(fs.existsSync(path.join(dir, 'openspec', 'config.yaml')), true);
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'team.md')), true);
  } finally {
    cleanup(dir);
  }
});
