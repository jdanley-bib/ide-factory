import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  AUTHORITY,
  ENFORCEMENTS,
  LEVELS,
  RESERVED_GATES,
  actorFor,
  configuredAuthority,
  describeGate,
  enforcementFor,
  gateLabel,
} from '../src/lib/authority.mjs';
import { BLOCKED_TABLE, buildBlockedReport } from '../src/lib/blocked-states.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

function patchConfig(dir, change) {
  const file = path.join(dir, '.factory', 'config.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, `${JSON.stringify(change(config), null, 2)}\n`);
}

function blockedOptionIds() {
  const ids = new Set();
  for (const row of Object.values(BLOCKED_TABLE)) {
    for (const entry of row.options) ids.add(entry.id);
  }
  return ids;
}

test('the authority table is frozen and every gate has a valid level and enforcement', () => {
  assert.equal(Object.isFrozen(AUTHORITY), true);
  for (const [id, entry] of Object.entries(AUTHORITY)) {
    assert.equal(Object.isFrozen(entry), true, id);
    assert.ok(LEVELS.includes(entry.level), `${id} level`);
    assert.ok(ENFORCEMENTS.includes(entry.enforcement), `${id} enforcement`);
    assert.ok(entry.why.length > 0, id);
  }
});

test('each design gate has the stated level and enforcement', () => {
  const expected = {
    resume: ['human', 'none'],
    'raise-new-run-cap': ['human', 'none'],
    'new-run-spend': ['human', 'none'],
    'record-approval': ['human', 'identity'],
    'resolve-lockout': ['independent', 'identity'],
    'waive-red': ['independent', 'identity'],
    'reuse-red': ['independent', 'identity'],
    'apply-reconciliation': ['independent', 'identity'],
    'reopen-attempt': ['independent', 'identity'],
    'review-attempt': ['independent', 'identity'],
    'method-review': ['independent', 'identity'],
    'attempt-repoint': ['independent', 'identity'],
    'new-run': ['agent', 'none'],
    'new-run-human': ['human', 'none'],
    'accept-baseline': ['agent', 'none'],
    'propose-method': ['agent', 'none'],
    'red-invalidate': ['agent', 'none'],
    'start-new-attempt': ['agent', 'none'],
    'run-verify': ['agent', 'none'],
  };
  for (const [id, [level, enforcement]] of Object.entries(expected)) {
    assert.equal(AUTHORITY[id].level, level, `${id} level`);
    assert.equal(AUTHORITY[id].enforcement, enforcement, `${id} enforcement`);
  }
});

test('the table and the blocked-state rows agree: every option has a gate and every gate is used or reserved', () => {
  const used = blockedOptionIds();
  for (const id of used) assert.ok(Object.hasOwn(AUTHORITY, id), `option ${id} has no gate`);
  for (const id of Object.keys(AUTHORITY)) {
    if (RESERVED_GATES.includes(id)) {
      assert.equal(used.has(id), false, `reserved gate ${id} is used by a row`);
    } else {
      assert.equal(used.has(id), true, `gate ${id} is neither used nor reserved`);
    }
  }
});

test('every option in every blocked row reports the level and actor its gate defines', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    for (const code of Object.keys(BLOCKED_TABLE)) {
      const report = buildBlockedReport(dir, { code, change: 'demo', task: '1.1', stopReason: 'max-tasks' });
      for (const entry of report.recovery.options) {
        const expected = describeGate(dir, entry.id);
        assert.equal(entry.authority.level, expected.level, `${code}/${entry.id} level`);
        assert.equal(entry.authority.enforcement, expected.enforcement, `${code}/${entry.id} enforcement`);
        assert.equal(entry.actor, expected.actor, `${code}/${entry.id} actor`);
      }
    }
  } finally {
    cleanup(dir);
  }
});

test('actors derive from the level and agent gates keep an agent actor', () => {
  assert.equal(actorFor(AUTHORITY.resume), 'human');
  assert.equal(actorFor(AUTHORITY['waive-red']), 'independent-agent');
  assert.equal(actorFor(AUTHORITY['new-run']), 'implementing-agent');
  assert.equal(actorFor(AUTHORITY['show-status']), 'tooling');
});

test('principal enforcement applies only to gates that name it and only under policy version 2', () => {
  assert.equal(enforcementFor(AUTHORITY['waive-red'], 1), 'identity');
  assert.equal(enforcementFor(AUTHORITY['waive-red'], 2), 'principal');
  assert.equal(enforcementFor(AUTHORITY.resume, 2), 'none');
  assert.equal(gateLabel('waive-red'), 'level independent, enforcement identity (principal under policy version 2)');
});

test('a config entry can raise a lower gate to human and reports the source', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    patchConfig(dir, (config) => ({ ...config, authority: { 'waive-red': 'human' } }));
    const described = describeGate(dir, 'waive-red');
    assert.equal(described.level, 'human');
    assert.equal(described.actor, 'human');
    assert.equal(described.source, 'config');
    assert.equal(described.enforcement, 'identity');
    assert.equal(describeGate(dir, 'waive-red').note, 'the factory expects a person and cannot verify one');
  } finally {
    cleanup(dir);
  }
});

test('config entries that would lower, use an unknown gate, or set a value other than human are ignored', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    patchConfig(dir, (config) => ({
      ...config,
      authority: { approve: 'agent', resume: 'human', 'waive-red': 'independent', 'record-approval': 'human' },
    }));
    const { raised, ignored } = configuredAuthority(dir);
    assert.equal(raised.size, 0);
    assert.deepEqual(ignored.map((entry) => entry.key).sort(), ['approve', 'record-approval', 'resume', 'waive-red']);
    assert.equal(describeGate(dir, 'resume').source, 'table');
    assert.equal(describeGate(dir, 'waive-red').level, 'independent');
    assert.equal(describeGate(dir, 'waive-red').source, 'table');
  } finally {
    cleanup(dir);
  }
});

test('a raised gate changes the reported level but not the enforcement', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    patchConfig(dir, (config) => ({ ...config, authority: { 'waive-red': 'human' } }));
    const attempt = { id: 'a1', change: 'demo', taskId: '1.1', state: 'implementing' };
    const report = buildBlockedReport(dir, { code: 'red-missing', attempt });
    const waive = report.recovery.options.find((entry) => entry.id === 'waive-red');
    assert.equal(waive.authority.level, 'human');
    assert.equal(waive.authority.source, 'config');
    assert.equal(waive.authority.enforcement, 'identity');
  } finally {
    cleanup(dir);
  }
});

test('doctor names each ignored authority entry', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    patchConfig(dir, (config) => ({ ...config, authority: { approve: 'agent' } }));
    const doctor = await idefactory(dir, ['doctor']);
    assert.match(doctor.err, /warning: ignored authority entry approve: unknown gate/);
  } finally {
    cleanup(dir);
  }
});

test('an identity-enforced human gate says a person is expected and cannot be verified', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const report = buildBlockedReport(dir, { code: 'approval-missing', change: 'demo', task: '1.1', action: 'accept' });
    const approve = report.recovery.options.find((entry) => entry.id === 'record-approval');
    assert.equal(approve.authority.level, 'human');
    assert.equal(approve.authority.enforcement, 'identity');
    assert.equal(approve.authority.note, 'the factory expects a person and cannot verify one');
  } finally {
    cleanup(dir);
  }
});

test('an approval without an approver says a person is required', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const refused = await idefactory(dir, [
      'approve', 'gate-1', '--note', 'publish it', '--change', 'demo', '--task', '1.1', '--action', 'accept',
    ]);
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /approve needs --approver <id>: a person is required to approve this action/);
  } finally {
    cleanup(dir);
  }
});

test('a lockout resolved by the locked agent names the identity that is needed', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const created = await idefactory(dir, ['lockout', 'create', '--agent', 'engineer-1', '--reviewer', 'reviewer-1', '--reason', 'failed']);
    assert.equal(created.code, 0, created.err + created.out);
    const lockoutId = /([0-9a-f-]{36})/.exec(created.out)[1];
    const refused = await idefactory(dir, ['lockout', 'resolve', lockoutId, '--resolver', 'engineer-1', '--reason', 'fixed']);
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /lockout resolve needs an identity other than the locked agent's/);
    assert.doesNotMatch(refused.err, /\bhuman\b|\ba person\b/);
  } finally {
    cleanup(dir);
  }
});
