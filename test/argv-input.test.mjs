import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { COMMANDS } from '../src/lib/command-help.mjs';
import { parseArgs } from '../src/lib/run.mjs';
import { spawnFailureDetail } from '../src/lib/red-evidence.mjs';
import { mapsFromSequence } from '../src/lib/setup.mjs';
import { BASIC_TASK, commitAll, readJson, seedChange, writeJson } from './factory-project.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILTER = ['dotnet', 'test', '--filter', 'Category=Unit | Category=Integration "x"'];

async function initialized() {
  const dir = tempProject();
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  return dir;
}

function setupArgs(...rest) {
  return ['setup', '--governance', 'lightweight', ...rest];
}

test('parseArgs keeps a leading double dash in the equals form', () => {
  const parsed = parseArgs(['setup', '--map', 'unit', '--argv=--filter', '--note=a=b']);
  assert.deepEqual(parsed.sequence, [
    { key: 'map', value: 'unit' },
    { key: 'argv', value: '--filter' },
    { key: 'note', value: 'a=b' },
  ]);
  assert.equal(parsed.flags.note, 'a=b');
});

test('parseArgs leaves the space-separated form and plain flags unchanged', () => {
  assert.deepEqual(parseArgs(['approve', 'a1', '--note', 'x y', '--force']).flags, { note: 'x y', force: true });
  assert.deepEqual(parseArgs(['run', '--change', 'demo', '--', '--odd=value']).rest, ['--odd=value']);
});

test('no documented usage or example other than the new argv forms uses the equals form', () => {
  const equals = [];
  for (const entry of COMMANDS) {
    for (const line of [entry.usage, ...(entry.aliasUsages || []), ...(entry.examples || [])]) {
      for (const match of line.matchAll(/--[a-z][a-z-]*=/g)) equals.push(`${entry.path.join(' ')}: ${match[0]}`);
    }
  }
  assert.deepEqual(equals, ['setup: --argv=']);
});

test('a bare --argv or --map flag fails naming the structured forms and stores nothing', async () => {
  const dir = await initialized();
  try {
    const before = fs.readFileSync(path.join(dir, '.factory/checks.json'), 'utf8');
    const bare = await idefactory(dir, setupArgs('--map', 'unit', '--argv', '--filter'));
    assert.equal(bare.code, 1);
    assert.match(bare.err, /--argv/);
    assert.match(bare.err, /--argv-json/);
    assert.match(bare.err, /--argv=/);
    const bareMap = await idefactory(dir, setupArgs('--map', '--argv', 'x'));
    assert.equal(bareMap.code, 1);
    assert.match(bareMap.err, /--map/);
    assert.equal(fs.readFileSync(path.join(dir, '.factory/checks.json'), 'utf8'), before);
    assert.doesNotMatch(before, /"true"/);
  } finally {
    cleanup(dir);
  }
});

test('--argv-json round-trips a complex argv byte for byte', async () => {
  const dir = await initialized();
  try {
    const result = await idefactory(dir, setupArgs('--map', 'unit', '--argv-json', JSON.stringify(FILTER)));
    assert.equal(result.code, 0, result.err);
    assert.deepEqual(readJson(dir, '.factory/checks.json').checks.unit.argv, FILTER);
  } finally {
    cleanup(dir);
  }
});

test('--argv-json refuses malformed values and writes nothing', async () => {
  for (const value of ['not json', '{"a":1}', '[]', '["a",""]', '["a",1]']) {
    const dir = await initialized();
    try {
      const before = fs.readFileSync(path.join(dir, '.factory/checks.json'), 'utf8');
      const result = await idefactory(dir, setupArgs('--map', 'unit', '--argv-json', value));
      assert.equal(result.code, 1, value);
      assert.match(result.err, /--argv-json/, value);
      assert.equal(fs.readFileSync(path.join(dir, '.factory/checks.json'), 'utf8'), before, value);
    } finally {
      cleanup(dir);
    }
  }
});

test('--argv-json cannot be mixed with --argv for one --map', () => {
  assert.throws(() => mapsFromSequence([
    { key: 'map', value: 'unit' },
    { key: 'argv', value: 'a' },
    { key: 'argv-json', value: '["b"]' },
  ]), /cannot be combined/);
});

test('the equals form stores a flag-like element', async () => {
  const dir = await initialized();
  try {
    const result = await idefactory(dir, setupArgs(
      '--map', 'unit', '--argv', 'dotnet', '--argv', 'test', '--argv=--filter',
    ));
    assert.equal(result.code, 0, result.err);
    assert.deepEqual(readJson(dir, '.factory/checks.json').checks.unit.argv, ['dotnet', 'test', '--filter']);
  } finally {
    cleanup(dir);
  }
});

test('a one-element argv with whitespace is refused as a shell string; later elements may hold whitespace', async () => {
  const dir = await initialized();
  try {
    const before = fs.readFileSync(path.join(dir, '.factory/checks.json'), 'utf8');
    const shell = await idefactory(dir, setupArgs('--map', 'unit', '--argv', 'npm test'));
    assert.equal(shell.code, 1);
    assert.match(shell.err, /shell command string/);
    assert.equal(fs.readFileSync(path.join(dir, '.factory/checks.json'), 'utf8'), before);
    const jsonShell = await idefactory(dir, setupArgs('--map', 'unit', '--argv-json', '["npm test"]'));
    assert.equal(jsonShell.code, 1);
    const ok = await idefactory(dir, setupArgs('--map', 'unit', '--argv-json', JSON.stringify(FILTER)));
    assert.equal(ok.code, 0, ok.err);
  } finally {
    cleanup(dir);
  }
});

test('checks preview and status print the registered argv as an exact JSON array', async () => {
  const dir = await initialized();
  try {
    assert.equal((await idefactory(dir, setupArgs('--map', 'unit', '--argv-json', JSON.stringify(FILTER)))).code, 0);
    const before = fs.readFileSync(path.join(dir, '.factory/checks.json'), 'utf8');
    const preview = await idefactory(dir, ['checks', 'preview']);
    assert.equal(preview.code, 0, preview.err);
    assert.ok(preview.out.includes(JSON.stringify(FILTER)), preview.out);
    assert.deepEqual(JSON.parse(preview.out).registered.unit, FILTER);
    const status = await idefactory(dir, ['status']);
    assert.ok(status.out.includes(`- unit: ${JSON.stringify(FILTER)}`), status.out);
    assert.equal(fs.readFileSync(path.join(dir, '.factory/checks.json'), 'utf8'), before);
  } finally {
    cleanup(dir);
  }
});

test('a registered complex argv reaches the program unchanged as separate arguments', async () => {
  const dir = tempProject();
  try {
    const script = path.join(here, 'fixtures', 'print-argv.mjs');
    const argv = [process.execPath, script, '--filter', 'Category=Unit | Category=Integration "x"'];
    await seedChange(dir, { tasks: BASIC_TASK });
    const registry = readJson(dir, '.factory/checks.json');
    assert.equal((await idefactory(dir, setupArgs('--map', 'unit', '--argv-json', JSON.stringify(argv)))).code, 0);
    assert.deepEqual(readJson(dir, '.factory/checks.json').checks.unit.argv, argv);
    assert.ok(registry);
    commitAll(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    const attempt = JSON.parse(started.out);
    const ran = await idefactory(dir, ['verify', 'run', attempt.id, '--check', 'unit']);
    assert.equal(ran.code, 0, ran.err + ran.out);
    assert.deepEqual(readJson(dir, 'argv-seen.json'), ['--filter', 'Category=Unit | Category=Integration "x"']);
  } finally {
    cleanup(dir);
  }
});

test('a missing executable is an infrastructure failure that names it and records no red', async () => {
  const dir = tempProject();
  try {
    await seedChange(dir, { tasks: BASIC_TASK });
    writeJson(dir, '.factory/checks.json', {
      schemaVersion: 1,
      checks: {
        unit: { argv: ['definitely-not-a-real-binary-xyz', '--x'], cwdPolicy: 'project', timeoutMs: 5000, artifacts: [] },
      },
    });
    commitAll(dir);
    const started = JSON.parse((await idefactory(dir, ['attempt', 'start', 'demo', '1.1'])).out);
    const plain = await idefactory(dir, ['verify', 'run', started.id, '--check', 'unit']);
    assert.equal(plain.code, 1);
    assert.match(plain.err, /infrastructure-failure/);
    assert.match(plain.err, /definitely-not-a-real-binary-xyz/);
    assert.match(plain.err, /ENOENT/);
    const red = await idefactory(dir, ['verify', 'run', started.id, '--check', 'unit', '--red']);
    assert.equal(red.code, 1);
    assert.match(red.err, /infrastructure-failure/);
    assert.match(red.err, /definitely-not-a-real-binary-xyz/);
    const stored = readJson(dir, `.factory/attempts/${started.id}.json`);
    assert.equal(stored.evidence.red ?? null, null);
    assert.equal(Object.keys(stored.evidence.reds || {}).length, 0);
  } finally {
    cleanup(dir);
  }
});

test('spawn failure detail names a Windows batch shim that cannot start without a shell', () => {
  assert.equal(spawnFailureDetail('dotnet', 'ENOENT'), 'spawn error ENOENT starting dotnet');
  assert.match(spawnFailureDetail('npm.cmd', 'EINVAL'), /npm\.cmd is a batch shim and cannot be started without a shell/);
  assert.match(spawnFailureDetail('run.BAT', 'ENOENT'), /batch shim/);
  assert.doesNotMatch(spawnFailureDetail('tool.exe', 'EINVAL'), /batch shim/);
});

test('setup help names the structured forms and shows a flag and a quoted pipe', async () => {
  const dir = tempProject();
  try {
    const help = await idefactory(dir, ['help', 'setup']);
    assert.equal(help.code, 0, help.err);
    assert.match(help.out, /--argv-json/);
    assert.match(help.out, /--argv=--filter/);
    assert.match(help.out, /--filter.*\|/);
    const json = JSON.parse((await idefactory(dir, ['help', 'setup', '--json'])).out);
    const names = (json.flags || []).map((flag) => flag.name);
    assert.ok(names.includes('argv'));
    assert.ok(names.includes('argv-json'));
  } finally {
    cleanup(dir);
  }
});
