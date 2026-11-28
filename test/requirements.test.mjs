import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { attemptPath, getAttempt } from '../src/lib/attempt.mjs';
import { renderWorkPacket } from '../src/lib/queue.mjs';
import { requiredChecksFor, resolveRequirements } from '../src/lib/required-checks.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';
import { commitAll, nodeCheck, readJson, writeJson } from './factory-project.mjs';

const RAW = { rawRegistry: true };

function tasksText(id, { checks = ['unit'], profile = 'cli', extra = [] } = {}) {
  return [
    `- [ ] ${id} Add parser`,
    '  factory:',
    '    kind: general',
    '    dependencies: []',
    `    checks: [${checks.join(', ')}]`,
    `    verificationProfile: ${profile}`,
    '    roles: [engineer, reviewer, scribe]',
    ...extra.map((line) => `    ${line}`),
    '',
  ].join('\n');
}

function registryOf(kinds, exit = 0) {
  return {
    schemaVersion: 1,
    checks: Object.fromEntries(kinds.map((kind) => [kind, nodeCheck(`process.exit(${exit})`)])),
  };
}

function addProfile(dir, name, profile) {
  const file = path.join(dir, '.factory/profiles.json');
  const profiles = JSON.parse(fs.readFileSync(file, 'utf8'));
  profiles[name] = profile;
  fs.writeFileSync(file, `${JSON.stringify(profiles, null, 2)}\n`);
}

function setPolicy(dir, version, verifier) {
  const file = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config.governance = { ...(config.governance || {}), policyVersion: version };
  if (verifier === null) delete config.governance.principalVerifier;
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

async function seed(dir, tasks, { registry, profiles = {} } = {}) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  setPolicy(dir, 1);
  for (const [name, profile] of Object.entries(profiles)) addProfile(dir, name, profile);
  if (registry) writeJson(dir, '.factory/checks.json', registry);
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), tasks);
  const synced = await idefactory(dir, ['sync-tasks', 'demo'], {}, RAW);
  assert.equal(synced.code, 0, synced.err + synced.out);
  return synced;
}

function digestOf(dir) {
  const hash = createHash('sha256');
  const walk = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      if (name === '.git') continue;
      const full = path.join(current, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else hash.update(`${path.relative(dir, full)}\n`).update(fs.readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest('hex');
}

function attemptFiles(dir) {
  const root = path.join(dir, '.factory/attempts');
  return fs.existsSync(root) ? fs.readdirSync(root).filter((name) => name.endsWith('.json')) : [];
}

const CONTRACT_PROFILE = { 'needs-contract': { checks: ['contract'], humanGate: false } };

test('the resolver lists item, profile, and shared checks with their sources', async () => {
  const dir = tempProject();
  try {
    await seed(dir, tasksText('1.1', { checks: ['unit', 'build'], profile: 'needs-contract' }), {
      profiles: { 'needs-contract': { checks: ['contract', 'build'], humanGate: false } },
      registry: registryOf(['unit', 'build', 'contract']),
    });
    const item = getWorkItem(dir, 'demo', '1.1');
    const resolved = resolveRequirements(dir, item);
    assert.deepEqual(resolved.checks, [
      { kind: 'contract', sources: ['profile'] },
      { kind: 'build', sources: ['profile', 'item'] },
      { kind: 'unit', sources: ['item'] },
    ]);
    assert.deepEqual(resolved.redKinds, ['contract', 'unit']);
    assert.deepEqual(resolved.problems, []);
    assert.deepEqual(requiredChecksFor(dir, item), ['contract', 'build', 'unit']);
  } finally {
    cleanup(dir);
  }
});

test('the resolver reports an undefined profile as a problem and requiredChecksFor still refuses', async () => {
  const dir = tempProject();
  try {
    await seed(dir, tasksText('1.1', { profile: 'no-such-profile' }), { registry: registryOf(['unit']) });
    const item = getWorkItem(dir, 'demo', '1.1');
    const resolved = resolveRequirements(dir, item);
    assert.equal(resolved.problems.length, 1);
    assert.match(resolved.problems[0].message, /no-such-profile/);
    assert.equal(resolved.problems[0].fix, '.factory/profiles.json');
    assert.deepEqual(resolved.checks.map((entry) => entry.kind), ['unit']);
    assert.throws(() => requiredChecksFor(dir, item), /unknown verification profile "no-such-profile"/);
  } finally {
    cleanup(dir);
  }
});

test('the resolver reports an unmapped kind, an unsatisfiable gate, and a missing dependency', async () => {
  const dir = tempProject();
  try {
    await seed(dir, tasksText('1.1', { checks: ['unit'], profile: 'gated', extra: ['dependencies: [0.9]'] }).replace('    dependencies: []\n', ''), {
      profiles: { gated: { checks: ['contract'], humanGate: true } },
      registry: registryOf(['unit']),
    });
    setPolicy(dir, 2, null);
    const resolved = resolveRequirements(dir, getWorkItem(dir, 'demo', '1.1'));
    const ids = resolved.problems.map((problem) => problem.id);
    assert.ok(ids.includes('unmapped-kind:contract'), ids.join());
    assert.ok(ids.includes('unsatisfiable-gate'), ids.join());
    assert.ok(ids.includes('missing-dependency:0.9'), ids.join());
    const gate = resolved.problems.find((problem) => problem.id === 'unsatisfiable-gate');
    assert.match(gate.fix, /principalVerifier/);
    assert.deepEqual(resolved.humanDecisions, [
      { action: 'accept', required: true, satisfiable: false },
      { action: 'complete', required: true, satisfiable: false },
    ]);
  } finally {
    cleanup(dir);
  }
});

test('no module passes the item checks alone to requiredTestKinds', () => {
  const root = path.join(repoRoot, 'src/lib');
  const offenders = [];
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith('.mjs')) continue;
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    if (/requiredTestKinds\(\s*item\??\.factory\??\.checks/.test(text)) offenders.push(name);
  }
  assert.deepEqual(offenders, []);
});

test('the packet lists item and profile checks and requires red for the full set', async () => {
  const dir = tempProject();
  try {
    await seed(dir, tasksText('1.1', { checks: ['unit'], profile: 'needs-contract' }), {
      profiles: CONTRACT_PROFILE,
      registry: registryOf(['unit', 'contract']),
    });
    for (const role of ['engineer', 'reviewer', 'security-reviewer']) {
      const packet = renderWorkPacket(dir, getWorkItem(dir, 'demo', '1.1'), role);
      assert.match(packet, /^Required checks: contract \(profile\), unit \(item\)$/m, role);
      assert.match(packet, /^Red required for: contract, unit$/m, role);
      assert.match(packet, /idefactory requirements demo 1\.1/);
    }
  } finally {
    cleanup(dir);
  }
});

test('the packet shows profile problems', async () => {
  const dir = tempProject();
  try {
    await seed(dir, tasksText('1.1', { profile: 'no-such-profile' }), { registry: registryOf(['unit']) });
    const packet = renderWorkPacket(dir, getWorkItem(dir, 'demo', '1.1'), 'engineer');
    assert.match(packet, /Requirement problems/);
    assert.match(packet, /no-such-profile/);
  } finally {
    cleanup(dir);
  }
});

test('the gate into verifying, the run request, and red waivers use the full set', async () => {
  const dir = tempProject();
  try {
    await seed(dir, tasksText('1.1', { checks: ['unit'], profile: 'needs-contract' }), {
      profiles: CONTRACT_PROFILE,
      registry: registryOf(['unit', 'contract'], 1),
    });
    commitAll(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    const attemptId = JSON.parse(started.out).id;
    const moved = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'implementing', '--evidence', JSON.stringify({ implementerId: 'engineer-1' }),
    ]);
    assert.equal(moved.code, 0, moved.err);

    const request = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
    assert.match(request.out, /verify run --red/);

    const red = await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit', '--red']);
    assert.equal(red.code, 0, red.err + red.out);
    const early = await idefactory(dir, ['attempt', 'transition', attemptId, 'verifying', '--evidence', '{}']);
    assert.notEqual(early.code, 0);
    assert.match(early.err, /verifying requires a recorded failing CLI red for: contract/);
    assert.doesNotMatch(early.err, /unit/);

    const outside = await idefactory(dir, [
      'red', 'waive', attemptId, '--kind', 'integration', '--note', 'n', '--approver', 'human-1', '--acknowledge-not-stuck',
    ]);
    assert.notEqual(outside.code, 0);
    assert.match(outside.err, /not a required test kind/);
    assert.equal(fs.existsSync(path.join(dir, '.factory/exceptions')) && fs.readdirSync(path.join(dir, '.factory/exceptions')).length > 0, false);

    const waived = await idefactory(dir, [
      'red', 'waive', attemptId, '--kind', 'contract', '--note', 'no contract harness yet', '--approver', 'human-1', '--acknowledge-not-stuck',
    ]);
    assert.equal(waived.code, 0, waived.err + waived.out);
    const verifying = await idefactory(dir, ['attempt', 'transition', attemptId, 'verifying', '--evidence', '{}']);
    assert.equal(verifying.code, 0, verifying.err);
  } finally {
    cleanup(dir);
  }
});

test('an attempt is not started when the requirement set has a problem', async () => {
  const cases = [
    {
      name: 'unmapped kind',
      tasks: tasksText('1.1', { checks: ['unit'], profile: 'needs-contract' }),
      profiles: CONTRACT_PROFILE,
      registry: registryOf(['unit']),
      pattern: /contract[\s\S]*check registry|check registry[\s\S]*contract/,
    },
    {
      name: 'unsatisfiable gate',
      tasks: tasksText('1.1', { checks: ['unit'], profile: 'gated' }),
      profiles: { gated: { checks: ['unit'], humanGate: true } },
      registry: registryOf(['unit']),
      policy: 2,
      pattern: /human gate[\s\S]*principalVerifier/,
      runPattern: /Setup is incomplete: missing principal verifier/,
    },
    {
      name: 'missing dependency',
      tasks: tasksText('1.1', { checks: ['unit'] }).replace('dependencies: []', 'dependencies: [9.9]'),
      registry: registryOf(['unit']),
      pattern: /dependency 9\.9 does not exist/,
      skipRun: true,
    },
  ];
  for (const scenario of cases) {
    const dir = tempProject();
    try {
      await seed(dir, scenario.tasks, scenario);
      if (scenario.policy) setPolicy(dir, scenario.policy, null);
      const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
      assert.notEqual(started.code, 0, scenario.name);
      assert.match(started.err, scenario.pattern, scenario.name);
      assert.deepEqual(attemptFiles(dir), [], scenario.name);
      assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'todo', scenario.name);

      if (!scenario.skipRun) {
        const run = await idefactory(dir, ['run', '--change', 'demo', '--max-tasks', '1']);
        assert.notEqual(run.code, 2, scenario.name);
        assert.match(run.out + run.err, scenario.runPattern || scenario.pattern, scenario.name);
      }
      assert.deepEqual(attemptFiles(dir), [], scenario.name);
    } finally {
      cleanup(dir);
    }
  }
});

test('a valid requirement set starts an attempt as before', async () => {
  const dir = tempProject();
  try {
    await seed(dir, tasksText('1.1'), { registry: registryOf(['unit']) });
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    assert.equal(attemptFiles(dir).length, 1);
  } finally {
    cleanup(dir);
  }
});

test('sync-tasks prints requirement problems as warnings and still writes the item', async () => {
  const dir = tempProject();
  try {
    const synced = await seed(dir, tasksText('1.1', { checks: ['unit'], profile: 'needs-contract' }), {
      profiles: CONTRACT_PROFILE,
      registry: registryOf(['unit']),
    });
    assert.match(synced.err, /warning: requirement problem for 1\.1: .*contract/);
    assert.ok(getWorkItem(dir, 'demo', '1.1'));
  } finally {
    cleanup(dir);
  }
});

async function acceptedAttempt(dir) {
  const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
  assert.equal(started.code, 0, started.err);
  const attemptId = JSON.parse(started.out).id;
  const file = attemptPath(dir, attemptId);
  const attempt = JSON.parse(fs.readFileSync(file, 'utf8'));
  attempt.state = 'accepted';
  attempt.implementerId = 'engineer-1';
  attempt.reviewerId = 'reviewer-1';
  fs.writeFileSync(file, `${JSON.stringify(attempt, null, 2)}\n`);
  return attemptId;
}

test('completion names every unmet check and every missing red together', async () => {
  const dir = tempProject();
  try {
    await seed(dir, tasksText('1.1', { checks: ['unit', 'build'], profile: 'needs-contract' }), {
      profiles: CONTRACT_PROFILE,
      registry: registryOf(['unit', 'build', 'contract']),
    });
    commitAll(dir);
    const attemptId = await acceptedAttempt(dir);
    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', attemptId]);
    assert.notEqual(done.code, 0);
    for (const kind of ['unit', 'build', 'contract']) assert.match(done.err, new RegExp(`for: ${kind}`));
    assert.match(done.err, /5 unmet requirements/);
    assert.equal(getWorkItem(dir, 'demo', '1.1').status, 'in_progress');
  } finally {
    cleanup(dir);
  }
});

test('the review handoff names every missing check and red in one message', async () => {
  const dir = tempProject();
  try {
    await seed(dir, tasksText('1.1', { checks: ['unit', 'build'], profile: 'needs-contract' }), {
      profiles: CONTRACT_PROFILE,
      registry: registryOf(['unit', 'build', 'contract']),
    });
    commitAll(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const attemptId = JSON.parse(started.out).id;
    const file = attemptPath(dir, attemptId);
    const attempt = JSON.parse(fs.readFileSync(file, 'utf8'));
    attempt.state = 'verifying';
    attempt.implementerId = 'engineer-1';
    fs.writeFileSync(file, `${JSON.stringify(attempt, null, 2)}\n`);
    const handoff = await idefactory(dir, ['attempt', 'transition', attemptId, 'awaiting-review', '--evidence', '{}']);
    assert.notEqual(handoff.code, 0);
    assert.match(handoff.err, /passing check evidence for: contract, unit, build/);
    assert.match(handoff.err, /failing CLI red for: contract, unit/);
    assert.equal(getAttempt(dir, attemptId).state, 'verifying');
  } finally {
    cleanup(dir);
  }
});

test('requirements prints one JSON document and writes nothing', async () => {
  const dir = tempProject();
  try {
    await seed(dir, tasksText('1.1', { checks: ['unit'], profile: 'needs-contract' }), {
      profiles: CONTRACT_PROFILE,
      registry: registryOf(['unit']),
    });
    const before = digestOf(dir);
    const result = await idefactory(dir, ['requirements', 'demo', '1.1', '--json']);
    assert.equal(result.code, 0, result.err);
    const doc = JSON.parse(result.out);
    assert.equal(doc.schemaVersion, 1);
    assert.deepEqual(doc.checks, [
      { kind: 'contract', sources: ['profile'] },
      { kind: 'unit', sources: ['item'] },
    ]);
    assert.deepEqual(doc.redKinds, ['contract', 'unit']);
    assert.deepEqual(doc.humanDecisions.map((entry) => entry.action), ['accept', 'complete']);
    assert.ok(doc.problems.some((problem) => problem.id === 'unmapped-kind:contract'));

    const text = await idefactory(dir, ['requirements', 'demo', '1.1']);
    assert.equal(text.code, 0);
    assert.match(text.out, /contract \(profile\)/);
    assert.match(text.out, /Red required for: contract, unit/);
    assert.equal(digestOf(dir), before);

    const missing = await idefactory(dir, ['requirements', 'demo', '9.9']);
    assert.notEqual(missing.code, 0);
    const usage = await idefactory(dir, ['requirements', 'demo']);
    assert.notEqual(usage.code, 0);
    assert.match(usage.err, /Usage: idefactory requirements/);
  } finally {
    cleanup(dir);
  }
});

test('help describes requirements and the lifecycle names the resolved set', async () => {
  const dir = tempProject();
  try {
    const help = await idefactory(dir, ['help', 'requirements']);
    assert.equal(help.code, 0);
    assert.match(help.out, /read-only/i);
    for (const word of ['checks', 'redKinds', 'humanDecisions', 'problems']) assert.match(help.out, new RegExp(word));
    const json = await idefactory(dir, ['help', 'requirements', '--json']);
    assert.equal(JSON.parse(json.out).effects, 'read-only');
    const lifecycle = await idefactory(dir, ['help', 'attempt', 'transition']);
    assert.match(lifecycle.out, /resolved requirement set/);
  } finally {
    cleanup(dir);
  }
});

test('end to end: a profile-added contract kind is disclosed, gated, and completable', async () => {
  const dir = tempProject();
  try {
    await seed(dir, tasksText('1.1', { checks: ['unit'], profile: 'needs-contract' }), {
      profiles: CONTRACT_PROFILE,
      registry: registryOf(['unit', 'contract'], 1),
    });
    const packet = renderWorkPacket(dir, getWorkItem(dir, 'demo', '1.1'), 'engineer');
    assert.match(packet, /^Red required for: contract, unit$/m);

    commitAll(dir);
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    const attemptId = JSON.parse(started.out).id;
    await idefactory(dir, ['attempt', 'transition', attemptId, 'implementing', '--evidence', JSON.stringify({ implementerId: 'engineer-1' })]);
    assert.equal((await idefactory(dir, ['verify', 'run', attemptId, '--check', 'unit', '--red'])).code, 0);
    const refused = await idefactory(dir, ['attempt', 'transition', attemptId, 'verifying', '--evidence', '{}']);
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /contract/);

    assert.equal((await idefactory(dir, ['verify', 'run', attemptId, '--check', 'contract', '--red'])).code, 0);
    const verifying = await idefactory(dir, ['attempt', 'transition', attemptId, 'verifying', '--evidence', '{}']);
    assert.equal(verifying.code, 0, verifying.err);

    writeJson(dir, '.factory/checks.json', registryOf(['unit', 'contract'], 0));
    commitAll(dir);
    for (const kind of ['unit', 'contract']) {
      const pass = await idefactory(dir, ['verify', 'run', attemptId, '--check', kind]);
      assert.equal(pass.code, 0, pass.err + pass.out);
    }
    const status = await idefactory(dir, ['verify', 'status', attemptId, '--json']);
    const doc = JSON.parse(status.out);
    assert.deepEqual(doc.reds, [
      { kind: 'contract', state: 'cli' },
      { kind: 'unit', state: 'cli' },
    ]);
    const handoff = await idefactory(dir, [
      'attempt', 'transition', attemptId, 'awaiting-review', '--evidence', '{}',
    ]);
    assert.equal(handoff.code, 0, handoff.err);
    assert.equal(readJson(dir, `.factory/attempts/${attemptId}.json`).state, 'awaiting-review');
  } finally {
    cleanup(dir);
  }
});
