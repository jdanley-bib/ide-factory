import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { backlogEntry, backlogTaskTitle, resolveBacklogEntry, runBacklog } from '../src/lib/backlog.mjs';
import { cleanup, fakeBacklog, repoRoot, tempProject } from './helpers.mjs';

test('backlogTaskTitle shortens long OpenSpec checkbox text for Windows paths', () => {
  const long = 'Add a Vite React JavaScript app at the repository root (`package.json`, `index.html`, Vite config, and the React entry) without replacing `.factory/`, `openspec/`, `backlog/`, `AGENTS.md`, `CLAUDE.md`, or `GOLDEN_RULES.md`. Verify `npm install` completes and those existing paths are still present.';
  const titled = backlogTaskTitle('1.1', long);
  assert.ok(titled.startsWith('[1.1] '));
  assert.ok(titled.length < 90);
  assert.equal(titled.includes('`'), false);
  assert.equal(titled.includes('/'), false);
});


test('resolveBacklogEntry keeps an explicit JS path', () => {
  assert.equal(resolveBacklogEntry(fakeBacklog), path.resolve(fakeBacklog));
});

test('resolveBacklogEntry maps npm .bin shims to backlog.md/cli.js', () => {
  const shimDir = path.join(repoRoot, 'node_modules', '.bin');
  const cli = path.join(repoRoot, 'node_modules', 'backlog.md', 'cli.js');
  assert.ok(fs.existsSync(cli), 'devDependency backlog.md should be installed');

  const shim = path.join(shimDir, 'backlog');
  assert.equal(resolveBacklogEntry(shim), path.resolve(cli));

  const cmd = path.join(shimDir, 'backlog.cmd');
  if (fs.existsSync(cmd)) {
    assert.equal(resolveBacklogEntry(cmd), path.resolve(cli));
  }
});

test('runBacklog spawns node with the JS entry for IDEFACTORY_BACKLOG', () => {
  const dir = tempProject();
  try {
    const db = path.join(dir, 'tasks.json');
    const env = {
      ...process.env,
      IDEFACTORY_BACKLOG: fakeBacklog,
      IDEFACTORY_FAKE_DB: db,
    };
    const listed = runBacklog(dir, ['task', 'list', '--json'], env);
    assert.deepEqual(JSON.parse(listed.stdout).tasks, []);
    assert.equal(fs.existsSync(db), false);
  } finally {
    cleanup(dir);
  }
});

test('backlogEntry prefers package cli.js over an unusable .bin shim path', () => {
  const entry = backlogEntry(repoRoot, { ...process.env, IDEFACTORY_BACKLOG: undefined });
  assert.equal(entry, path.join(repoRoot, 'node_modules', 'backlog.md', 'cli.js'));
});

test('runBacklog can invoke the real backlog.md cli via node', () => {
  const dir = tempProject();
  try {
    const result = runBacklog(dir, ['--version'], {
      ...process.env,
      IDEFACTORY_BACKLOG: undefined,
    });
    assert.match(result.stdout.trim(), /^\d+\.\d+/);
  } finally {
    cleanup(dir);
  }
});
