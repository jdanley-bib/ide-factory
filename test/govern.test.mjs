import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

test('approve and reject append, and lockout writes a note', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const first = await idefactory(dir, ['approve', 'spend-ok', '--note', 'allowed for test']);
    assert.equal(first.code, 0, first.err);
    const second = await idefactory(dir, ['approve', 'second-ok', '--note', 'also allowed']);
    assert.equal(second.code, 0, second.err);
    const decisions = fs.readFileSync(path.join(dir, '.factory/decisions.md'), 'utf8');
    assert.match(decisions, /spend-ok/);
    assert.match(decisions, /second-ok/);
    const approvals = fs.readdirSync(path.join(dir, '.factory/approvals')).filter((name) => name.endsWith('.md'));
    const bodies = approvals.map((name) => fs.readFileSync(path.join(dir, '.factory/approvals', name), 'utf8')).join('\n');
    assert.match(bodies, /allowed for test/);
    const rejected = await idefactory(dir, ['reject', 'nope', '--note', 'not this']);
    assert.equal(rejected.code, 0, rejected.err);
    const after = fs.readFileSync(path.join(dir, '.factory/decisions.md'), 'utf8');
    assert.match(after, /rejected/);
    assert.match(after, /nope/);
    assert.match(after, /spend-ok/);
    const locked = await idefactory(dir, ['lockout', '--agent', 'engineer', '--reviewer', 'reviewer', '--reason', 'tests failed']);
    assert.equal(locked.code, 0, locked.err);
    const notes = fs.readdirSync(path.join(dir, '.factory/orchestration')).filter((name) => name.endsWith('.md'));
    assert.equal(notes.length, 1);
    const note = fs.readFileSync(path.join(dir, '.factory/orchestration', notes[0]), 'utf8');
    assert.match(note, /Agent: engineer/);
    assert.match(note, /tests failed/);
    assert.equal(fs.existsSync(path.join(dir, 'app.js')), false);
  } finally {
    cleanup(dir);
  }
});
