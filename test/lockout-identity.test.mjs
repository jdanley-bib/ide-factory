import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { writeText } from '../src/lib/layout.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

const LOCKOUTS = '.factory/orchestration/lockouts';

async function project() {
  const dir = tempProject();
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  const configPath = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.governance.policyVersion = 1;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return dir;
}

function lockoutDirs(dir) {
  const root = path.join(dir, LOCKOUTS);
  return fs.existsSync(root) ? fs.readdirSync(root) : [];
}

function lockoutId(out) {
  const match = out.match(/Created lockout (\S+)/);
  assert.ok(match, out);
  return match[1];
}

function storeAttempt(dir, fields) {
  writeText(path.join(dir, '.factory/attempts/old-attempt.json'), JSON.stringify({ id: 'old-attempt', ...fields }, null, 2));
}

const create = (agent, reviewer = 'reviewer-1') => ['lockout', 'create', '--agent', agent, '--reviewer', reviewer, '--reason', 'failed'];

test('a dotted agent id creates a lockout recording that agent', async () => {
  const dir = await project();
  try {
    const result = await idefactory(dir, create('engineer-5.1-abc123', 'reviewer-2'));
    assert.equal(result.code, 0, result.err);
    const record = JSON.parse(fs.readFileSync(
      path.join(dir, LOCKOUTS, lockoutId(result.out), 'created.json'),
      'utf8',
    ));
    assert.equal(record.agent, 'engineer-5.1-abc123');
    assert.equal(record.reviewer, 'reviewer-2');
  } finally {
    cleanup(dir);
  }
});

test('the lockout alias and lockout create agree on dotted ids', async () => {
  const dir = await project();
  try {
    const alias = await idefactory(dir, ['lockout', '--agent', 'eng-1.2', '--reviewer', 'rev.1', '--reason', 'x']);
    assert.equal(alias.code, 0, alias.err);
    const bad = await idefactory(dir, ['lockout', '--agent', 'bad id', '--reviewer', 'rev.1', '--reason', 'x']);
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /--agent "bad id" is not a valid identity/);
    assert.equal(lockoutDirs(dir).length, 1);
  } finally {
    cleanup(dir);
  }
});

test('invalid lockout identities name the flag and write nothing', async () => {
  const dir = await project();
  try {
    const badAgent = await idefactory(dir, create('bad id'));
    assert.notEqual(badAgent.code, 0);
    assert.match(badAgent.err, /--agent "bad id" is not a valid identity/);
    assert.match(badAgent.err, /letters, digits/);

    const badReviewer = await idefactory(dir, create('eng-1', 'bad/reviewer'));
    assert.notEqual(badReviewer.code, 0);
    assert.match(badReviewer.err, /--reviewer "bad\/reviewer" is not a valid identity/);

    const bare = await idefactory(dir, ['lockout', 'create', '--agent', '--reviewer', 'r-1', '--reason', 'x']);
    assert.notEqual(bare.code, 0);
    assert.match(bare.err, /--agent needs a value/);
    assert.deepEqual(lockoutDirs(dir), []);
  } finally {
    cleanup(dir);
  }
});

test('lockout create requires --reviewer and records no default', async () => {
  const dir = await project();
  try {
    const result = await idefactory(dir, ['lockout', 'create', '--agent', 'eng-1', '--reason', 'x']);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /--reviewer needs a value/);
    assert.deepEqual(lockoutDirs(dir), []);
  } finally {
    cleanup(dir);
  }
});

test('a principal-style resolver is accepted and an invalid one is named, not reported missing', async () => {
  const dir = await project();
  try {
    const id = lockoutId((await idefactory(dir, create('eng-1'))).out);
    const bad = await idefactory(dir, ['lockout', 'resolve', id, '--resolver', 'bad id', '--reason', 'ok']);
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /--resolver "bad id" is not a valid identity/);
    assert.doesNotMatch(bad.err, /requires --resolver/);
    assert.equal(fs.existsSync(path.join(dir, LOCKOUTS, id, 'resolved.json')), false);

    const good = await idefactory(dir, [
      'lockout', 'resolve', id, '--resolver', 'Reviewer.One@example.com', '--reason', 'ok',
    ]);
    assert.equal(good.code, 0, good.err);
    const resolution = JSON.parse(fs.readFileSync(path.join(dir, LOCKOUTS, id, 'resolved.json'), 'utf8'));
    assert.equal(resolution.resolver, 'Reviewer.One@example.com');
  } finally {
    cleanup(dir);
  }
});

test('a legacy note whose Agent line is outside the format is refused naming the line', async () => {
  const dir = await project();
  try {
    const basename = '2026-10-21T12-00-00-000Z-lockout.md';
    writeText(path.join(dir, '.factory/orchestration', basename), '# Lockout\n\nAgent: bad id\nReviewer: r\nReason: old\n');
    const result = await idefactory(dir, ['lockout', 'resolve', basename, '--resolver', 'lead-1', '--reason', 'ok']);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /legacy lockout note must name a valid Agent/);
    assert.match(result.err, /"Agent:" line/);
    assert.equal(fs.existsSync(path.join(dir, LOCKOUTS, basename, 'resolved.json')), false);
  } finally {
    cleanup(dir);
  }
});

test('an identity recorded on an earlier attempt is accepted by exact match only', async () => {
  const dir = await project();
  try {
    storeAttempt(dir, { implementerId: 'Eng One', reviewerId: null, state: 'rejected' });
    const attemptFile = path.join(dir, '.factory/attempts/old-attempt.json');
    const before = fs.readFileSync(attemptFile, 'utf8');

    const exact = await idefactory(dir, create('Eng One'));
    assert.equal(exact.code, 0, exact.err);
    const record = JSON.parse(fs.readFileSync(path.join(dir, LOCKOUTS, lockoutId(exact.out), 'created.json'), 'utf8'));
    assert.equal(record.agent, 'Eng One');
    assert.equal(fs.readFileSync(attemptFile, 'utf8'), before);

    const near = await idefactory(dir, create('eng one'));
    assert.notEqual(near.code, 0);
    assert.match(near.err, /--agent "eng one" is not a valid identity/);
    assert.equal(lockoutDirs(dir).length, 1);
  } finally {
    cleanup(dir);
  }
});

test('a resolver equal to the locked agent is still refused', async () => {
  const dir = await project();
  try {
    const id = lockoutId((await idefactory(dir, create('eng-5.1'))).out);
    const same = await idefactory(dir, ['lockout', 'resolve', id, '--resolver', 'eng-5.1', '--reason', 'ok']);
    assert.notEqual(same.code, 0);
    assert.match(same.err, /an identity other than the locked agent's/);
  } finally {
    cleanup(dir);
  }
});

function usageLine(err) {
  const lines = err.split('\n');
  const index = lines.findIndex((line) => line.startsWith('Usage: '));
  assert.ok(index >= 0, err);
  return lines[index].slice('Usage: '.length);
}

test('lockout error usage lines equal the lockout help entries', async () => {
  const dir = await project();
  try {
    const createHelp = (await idefactory(dir, ['help', 'lockout', 'create'])).out;
    const resolveHelp = (await idefactory(dir, ['help', 'lockout', 'resolve'])).out;
    const id = lockoutId((await idefactory(dir, create('eng-1'))).out);

    const failures = [
      [await idefactory(dir, ['lockout', 'create', '--agent', 'bad id', '--reviewer', 'r-1', '--reason', 'x']), createHelp],
      [await idefactory(dir, ['lockout', 'create', '--agent', 'eng-2', '--reviewer', 'r-1']), createHelp],
      [await idefactory(dir, ['lockout', 'resolve', id, '--resolver', 'bad id', '--reason', 'x']), resolveHelp],
      [await idefactory(dir, ['lockout', 'resolve', id, '--resolver', 'lead-1']), resolveHelp],
      [await idefactory(dir, ['lockout', 'resolve']), resolveHelp],
    ];
    for (const [result, help] of failures) {
      assert.notEqual(result.code, 0);
      assert.ok(help.includes(`  ${usageLine(result.err)}\n`), `${result.err}\n--- help ---\n${help}`);
    }
    assert.match(usageLine(failures[1][0].err), /--reviewer <id>/);

    const unknown = await idefactory(dir, ['lockout', 'bogus']);
    assert.notEqual(unknown.code, 0);
    assert.ok(createHelp.includes(`  ${usageLine(unknown.err)}\n`));
    assert.ok(resolveHelp.includes(`  ${unknown.err.split('\n').find((l) => l.includes('lockout resolve')).trim()}\n`));
  } finally {
    cleanup(dir);
  }
});
