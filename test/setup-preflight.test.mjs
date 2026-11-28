import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { readControlEvents } from '../src/lib/event-log.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

function ok(result) {
  assert.equal(result.code, 0, result.err + result.out);
  return result;
}

function sessionFiles(dir) {
  const root = path.join(dir, '.factory', 'orchestration', 'runs');
  return fs.existsSync(root) ? fs.readdirSync(root) : [];
}

function setupEvents(dir) {
  return readControlEvents(dir).filter((event) => event.invariant === 'setup-incomplete');
}

test('run stops with setup-incomplete before any session or baseline, and names the gap', async () => {
  const dir = tempProject();
  try {
    ok(await idefactory(dir, ['init']));
    const result = await idefactory(dir, ['run', '--change', 'demo']);
    assert.equal(result.code, 0, result.err + result.out);
    assert.match(result.out, /Setup is incomplete: missing test decision/);
    assert.match(result.out, /One answer is needed from a person/);
    assert.deepEqual(sessionFiles(dir), []);
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'orchestration', 'baselines')), false);
  } finally {
    cleanup(dir);
  }
});

test('the text stop ends with a Next line naming record-setup and a person', async () => {
  const dir = tempProject();
  try {
    ok(await idefactory(dir, ['init']));
    const result = await idefactory(dir, ['run', '--change', 'demo']);
    assert.match(result.out, /^Next: idefactory setup --governance <lightweight\|strict> --map unit --argv <part>\.\.\. \(or --no-test\) \(a person may run it\)$/m);
  } finally {
    cleanup(dir);
  }
});

test('the JSON stop names the same first option as the text Next line', async () => {
  const dir = tempProject();
  try {
    ok(await idefactory(dir, ['init']));
    const text = await idefactory(dir, ['run', '--change', 'demo']);
    const json = JSON.parse((await idefactory(dir, ['run', '--change', 'demo', '--json'])).out);
    assert.equal(json.stopReason, 'setup-incomplete');
    assert.equal(json.blocked.invariant.code, 'setup-incomplete');
    assert.equal(json.blocked.actor, 'human');
    const first = json.blocked.recovery.options.find((option) => option.supported);
    assert.equal(first.id, 'record-setup');
    assert.equal(first.authority.level, 'human');
    assert.match(text.out, new RegExp(`^Next: ${first.command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `, 'm'));
  } finally {
    cleanup(dir);
  }
});

test('the stop names both gaps when the test decision and the principal verifier are missing', async () => {
  const dir = tempProject();
  try {
    ok(await idefactory(dir, ['init']));
    const configPath = path.join(dir, '.factory', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.governance = { ...(config.governance || {}), policyVersion: 2 };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = await idefactory(dir, ['run', '--change', 'demo']);
    assert.match(result.out, /missing test decision; missing principal verifier/);
  } finally {
    cleanup(dir);
  }
});

test('a repeated stop records one blocked event and a later setup clears it', async () => {
  const dir = tempProject();
  try {
    ok(await idefactory(dir, ['init']));
    await idefactory(dir, ['run', '--change', 'demo']);
    await idefactory(dir, ['run', '--change', 'demo']);
    const recorded = setupEvents(dir).filter((event) => event.type === 'blocked.recorded');
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].actor, 'human');

    ok(await idefactory(dir, ['setup', '--governance', 'lightweight', '--no-test']));
    await idefactory(dir, ['run', '--change', 'demo']);
    const resolved = setupEvents(dir).filter((event) => event.type === 'blocked.resolved');
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].resolution, 'setup-recorded');
  } finally {
    cleanup(dir);
  }
});

test('next checks setup first and creates no session', async () => {
  const dir = tempProject();
  try {
    ok(await idefactory(dir, ['init']));
    const text = await idefactory(dir, ['next', '--change', 'demo']);
    assert.equal(text.code, 0, text.err + text.out);
    assert.match(text.out, /Setup is incomplete: missing test decision/);
    assert.match(text.out, /^Next: idefactory setup/m);
    const json = JSON.parse((await idefactory(dir, ['next', '--change', 'demo', '--json'])).out);
    assert.equal(json.ok, false);
    assert.equal(json.blocked.invariant.code, 'setup-incomplete');
    assert.deepEqual(sessionFiles(dir), []);
  } finally {
    cleanup(dir);
  }
});

test('outside a factory project run keeps its existing behavior, not setup-incomplete', async () => {
  const dir = tempProject();
  try {
    const result = await idefactory(dir, ['run', '--change', 'demo']);
    assert.doesNotMatch(result.out + result.err, /Setup is incomplete/);
  } finally {
    cleanup(dir);
  }
});

test('run help documents the setup check and the Next line', async () => {
  const dir = tempProject();
  try {
    const help = await idefactory(dir, ['help', 'run']);
    assert.equal(help.code, 0, help.err + help.out);
    assert.match(help.out, /Run and next check setup first/);
    assert.match(help.out, /setup-incomplete/);
    assert.match(help.out, /Next: line/);
  } finally {
    cleanup(dir);
  }
});
