import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ATTEMPT_STATES, attemptPath, getAttempt } from '../src/lib/attempt.mjs';
import { BLOCKED_TABLE } from '../src/lib/blocked-states.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';
import { commitAll, nodeCheck, writeJson } from './factory-project.mjs';

const STATE_REFUSAL = /a method can be proposed only before red-confirmed or verifying/;
const REOPENED = 'awaiting-review (reopened for a method)';

function option(code, id) {
  const found = BLOCKED_TABLE[code].options.find((entry) => entry.id === id);
  assert.ok(found, `${code} lists ${id}`);
  return found;
}

function ok(result) {
  assert.equal(result.code, 0, result.err + result.out);
  return result;
}

async function startAttempt(dir) {
  ok(await idefactory(dir, ['init']));
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), [
    '- [ ] 1.1 Change the parser',
    '  factory:',
    '    kind: general',
    '    dependencies: []',
    '    taskType: code',
    '    checks: [unit]',
    '    verificationProfile: cli',
    '    roles: [engineer, reviewer, scribe]',
    '',
  ].join('\n'));
  writeJson(dir, '.factory/checks.json', {
    schemaVersion: 1,
    checks: { unit: nodeCheck('process.exit(1)') },
  });
  ok(await idefactory(dir, ['sync-tasks', 'demo'], {}, { rawRegistry: true }));
  commitAll(dir);
  return JSON.parse(ok(await idefactory(dir, ['attempt', 'start', 'demo', '1.1'])).out).id;
}

/** Set the stored attempt to a state, with a vacuous red and no method, so only the state decides. */
function place(dir, attemptId, state) {
  const file = attemptPath(dir, attemptId);
  const attempt = JSON.parse(fs.readFileSync(file, 'utf8'));
  const reopened = state === REOPENED;
  attempt.state = reopened ? 'awaiting-review' : state;
  attempt.evidence = {
    ...(attempt.evidence || {}),
    redFailures: [{ kind: 'unit', classification: 'vacuous-red' }],
    reopens: reopened ? [{ kinds: ['unit'], purpose: 'method', by: 'reviewer-1', reason: 'test' }] : [],
  };
  delete attempt.evidence.method;
  fs.writeFileSync(file, JSON.stringify(attempt, null, 2));
  return getAttempt(dir, attemptId);
}

const STATES = [...ATTEMPT_STATES.filter((state) => state !== 'awaiting-review'), 'awaiting-review', REOPENED];

test('method proposal rows agree with the method command in every attempt state', async () => {
  const dir = tempProject();
  try {
    const attemptId = await startAttempt(dir);
    const rows = [
      {
        label: 'propose-method',
        option: option('red-missing', 'propose-method'),
        args: ['--reason', 'configuration', '--rationale', 'text', '--implementer', 'engineer-1', '--kind', 'unit'],
      },
      {
        label: 'propose-already-satisfied',
        option: option('vacuous-red', 'propose-already-satisfied'),
        args: ['--reason', 'already-satisfied', '--rationale', 'text', '--implementer', 'engineer-1', '--kind', 'unit', '--test-path', 'test/x.test.mjs'],
      },
    ];
    const seen = { allowed: 0, refused: 0 };
    for (const row of rows) {
      for (const state of STATES) {
        const attempt = place(dir, attemptId, state);
        const available = row.option.when({ attempt, change: 'demo', task: '1.1' });
        const result = await idefactory(dir, ['method', 'propose', attemptId, '--choice', 'no-red', ...row.args]);
        const refused = STATE_REFUSAL.test(result.err + result.out);
        assert.equal(!refused, available, `${row.label} in ${state}: table says ${available}, command ${refused ? 'refused by state' : 'accepted the state'}`);
        seen[available ? 'allowed' : 'refused'] += 1;
      }
    }
    assert.ok(seen.allowed > 0 && seen.refused > 0, 'the matrix covers an allowed and a disallowed state');
  } finally {
    cleanup(dir);
  }
});
