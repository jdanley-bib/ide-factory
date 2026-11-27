import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';
import { commitAll, nodeCheck, readJson, writeJson } from './factory-project.mjs';
import { CAPABILITY_PROBES, presentCapabilities, skipReason, staleSkipReasons } from './capabilities.mjs';

const HOUR_MS = 60 * 60 * 1000;
const RAW = { rawRegistry: true };
const ENGINEER = 'engineer-1';
const REVIEWER = 'reviewer-1';
const HUMAN = 'human-1';
const MAX_AGENT_STEPS = 8;

const DECLARED_SKIPS = [
  { name: 'ordinary change and pause', requires: ['blocked-states', 'authorize', 'autonomy-report'] },
  { name: 'recoverable infrastructure failure', requires: ['blocked-states', 'autonomy-report'] },
  { name: 'bounded unrecoverable loop', requires: ['blocked-states', 'autonomy-report'] },
];

function skipFor(name) {
  const row = DECLARED_SKIPS.find((entry) => entry.name === name);
  return skipReason(row.requires);
}

function ok(result) {
  assert.equal(result.code, 0, result.err + result.out);
  return result;
}

function patchJson(dir, rel, mutate) {
  const value = readJson(dir, rel);
  mutate(value);
  writeJson(dir, rel, value);
}

function expiry(hours = 2) {
  return new Date(Date.now() + hours * HOUR_MS).toISOString();
}

const TASKS = {
  '1.1': { title: 'Parser', profile: 'plain', effect: null },
  '1.2': { title: 'Staging deploy', profile: 'plain', effect: 'staging' },
  '1.3': { title: 'Production deploy', profile: 'gated', effect: 'production' },
};

async function setup(dir, { change = 'demo', tasks = ['1.1', '1.2', '1.3'] } = {}) {
  ok(await idefactory(dir, ['init']));
  patchJson(dir, '.factory/config.json', (config) => {
    config.governance.policyVersion = 2;
    config.governance.principalVerifier = {
      argv: [process.execPath, 'verify-principal.mjs'],
      timeoutMs: 5000,
      provider: 'local',
    };
  });
  patchJson(dir, '.factory/profiles.json', (profiles) => {
    profiles.plain = { checks: ['unit'], humanGate: false };
    profiles.gated = { checks: ['unit'], humanGate: true };
  });
  writeJson(dir, '.factory/checks.json', {
    schemaVersion: 1,
    checks: { unit: nodeCheck('', { argv: [process.execPath, 'check-unit.mjs'] }) },
  });
  fs.copyFileSync(path.join(repoRoot, 'test/fixtures/acceptance-check.mjs'), path.join(dir, 'check-unit.mjs'));
  fs.writeFileSync(path.join(dir, 'verify-principal.mjs'), [
    'const subject = process.env.FACTORY_PRINCIPAL_SUBJECT;',
    `if (![${JSON.stringify(HUMAN)}, ${JSON.stringify(REVIEWER)}].includes(subject)) process.exit(2);`,
    'process.stdout.write(JSON.stringify({ provider: process.env.FACTORY_PRINCIPAL_PROVIDER, subject, issuer: "local-test" }));',
    '',
  ].join('\n'));
  fs.mkdirSync(path.join(dir, 'openspec/changes', change), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes', change, 'tasks.md'), tasks.map((id, index) => [
    `- [ ] ${id} ${TASKS[id].title}`,
    '  factory:',
    '    kind: general',
    `    dependencies: [${index === 0 ? '' : tasks[index - 1]}]`,
    '    taskType: code',
    '    risk: low',
    '    securityProfile: dependency-basic',
    '    checks: [unit]',
    `    verificationProfile: ${TASKS[id].profile}`,
    '    roles: [engineer, reviewer, scribe]',
    '',
  ].join('\n')).join(''));
  ok(await idefactory(dir, ['sync-tasks', change], {}, RAW));
  commitAll(dir);
}

function principalFlags(subject) {
  return ['--approver', subject, '--principal-provider', 'local', '--principal-subject', subject];
}

async function recordStanding(dir, id, target) {
  ok(await idefactory(dir, ['approve', id, '--note', `${target} deploys`, '--change', 'demo',
    '--action', 'deploy', '--target', target, '--standing', ...principalFlags(HUMAN), '--expiry', expiry()]));
}

async function recordGate(dir, id, task, action) {
  ok(await idefactory(dir, ['approve', id, '--note', 'ship it', '--change', 'demo', '--task', task,
    '--action', action, ...principalFlags(HUMAN), '--expiry', expiry()]));
}

function effectFile(dir, target) {
  return path.join(dir, '.factory/work/effects', `deploy-${target}.txt`);
}

/** The scripted agent: a deterministic stand-in for an IDE model that only follows what a request tells it. */
async function act(dir, request, { passes = true } = {}) {
  const id = request.attemptId;
  const task = request.taskId;
  const marker = `impl-${task}.txt`;
  const must = passes ? ok : (result) => result;
  const transition = (state, evidence = {}) => idefactory(dir, ['attempt', 'transition', id, state, '--evidence', JSON.stringify(evidence)]);
  if (request.action === 'complete') {
    const effect = TASKS[task]?.effect;
    if (effect) {
      const decision = await idefactory(dir, ['authorize', '--change', 'demo', '--action', 'deploy', '--target', effect, '--json']);
      if (decision.code === 0 && JSON.parse(decision.out).authorized === true) {
        fs.mkdirSync(path.dirname(effectFile(dir, effect)), { recursive: true });
        fs.writeFileSync(effectFile(dir, effect), `${effect}\n`);
      }
    }
    ok(await idefactory(dir, ['complete', 'demo', task, '--attempt', id, '--reviewer', REVIEWER, ...principalFlags(REVIEWER).slice(2)]));
    commitAll(dir, `complete ${task}`);
    return true;
  }
  switch (request.state) {
    case 'planned':
    case 'assigned':
      must(await transition('implementing', { implementerId: ENGINEER }));
      return true;
    case 'implementing':
      if (request.nextState === 'red-confirmed') {
        const tests = fs.existsSync(path.join(dir, 'tests.json')) ? readJson(dir, 'tests.json') : [];
        tests.push({ name: `t-${task}`, requires: marker });
        writeJson(dir, 'tests.json', tests);
        commitAll(dir, `test ${task}`);
        await idefactory(dir, ['verify', 'run', id, '--check', 'unit', '--red']);
        must(await transition('red-confirmed'));
        return true;
      }
    // falls through
    case 'red-confirmed': {
      fs.writeFileSync(path.join(dir, passes ? marker : `wrong-${task}.txt`), 'done\n');
      commitAll(dir, `implement ${task}`);
      const verified = await idefactory(dir, ['verify', 'run', id, '--check', 'unit']);
      if (verified.code !== 0) return false;
      must(await transition('verifying'));
      return true;
    }
    case 'verifying':
      must(await idefactory(dir, ['verify', 'run', id, '--check', 'unit']));
      must(await transition('awaiting-review'));
      return true;
    case 'awaiting-review':
      must(await transition('accepted', { reviewerId: REVIEWER, verdict: 'ACCEPT', notes: 'checked' }));
      return true;
    default:
      throw new Error(`the scripted agent has no step for state ${request.state}`);
  }
}

/**
 * Drive `run` until it stops without asking an agent. Returns every request,
 * every packet text, and the final stop document.
 */
async function drive(dir, { maxRequests = 60, retryTransient = 0, passes = () => true, runArgs = [] } = {}) {
  const requests = [];
  const texts = [];
  let retries = 0;
  for (let index = 0; index < maxRequests; index += 1) {
    const result = await idefactory(dir, ['run', '--change', 'demo', '--json', ...runArgs]);
    const doc = JSON.parse(result.out);
    if (result.code !== 2) {
      if (doc.stopReason === 'infrastructure-failure' && retries < retryTransient) {
        retries += 1;
        continue;
      }
      return { doc, requests, texts, code: result.code, retries };
    }
    requests.push(doc.request);
    texts.push(JSON.stringify(doc));
    await act(dir, doc.request, { passes: passes(doc.request) });
  }
  throw new Error(`no stop after ${maxRequests} requests`);
}

async function report(dir) {
  return JSON.parse(ok(await idefactory(dir, ['autonomy', 'report', '--json'])).out);
}

function doneTasks(dir) {
  return fs.readFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), 'utf8')
    .split('\n').filter((line) => /^- \[x\]/.test(line)).map((line) => line.split(' ')[2]);
}

test('the skip helper names a missing capability and flags a stale reason', () => {
  const present = new Set(['blocked-states']);
  assert.equal(skipReason(['blocked-states'], present), false);
  assert.equal(skipReason(['blocked-states', 'authorize'], present), 'waiting for capability: authorize');
  assert.deepEqual(
    staleSkipReasons([{ name: 'a', requires: ['authorize'] }, { name: 'b', requires: ['blocked-states'] }], present),
    ['b'],
  );
});

test('no scenario is skipped for a capability that already ships', () => {
  const present = presentCapabilities();
  assert.deepEqual([...present].sort(), Object.keys(CAPABILITY_PROBES).sort());
  assert.deepEqual(staleSkipReasons(DECLARED_SKIPS), DECLARED_SKIPS.map((row) => row.name));
  for (const row of DECLARED_SKIPS) assert.equal(skipFor(row.name), false, row.name);
});

test('an ordinary change runs unattended, decisions survive every role, and the one pause resumes', {
  skip: skipFor('ordinary change and pause'),
  timeout: 600_000,
}, async () => {
  const dir = tempProject();
  try {
    await setup(dir);
    await recordStanding(dir, 'stand-staging', 'staging');
    commitAll(dir);

    const first = await drive(dir);
    assert.equal(first.code, 0, JSON.stringify(first.doc));
    assert.equal(first.doc.stopReason, 'human-gate');
    assert.deepEqual(doneTasks(dir), ['1.1', '1.2']);

    const early = first.texts.filter((text) => /"taskId":"1\.[12]"/.test(text));
    assert.ok(early.length > 0);
    const roles = new Set(first.requests.filter((request) => ['1.1', '1.2'].includes(request.taskId)).map((request) => request.role || request.action));
    assert.deepEqual([...roles].sort(), ['complete', 'engineer', 'reviewer']);
    for (const text of early) assert.match(text, /stand-staging/, 'every packet carries the standing decision');
    assert.ok(fs.existsSync(effectFile(dir, 'staging')), 'the in-authority effect ran');
    assert.ok(!fs.existsSync(effectFile(dir, 'production')), 'the out-of-authority effect did not run');

    const paused = await report(dir);
    const pausedStops = paused.interventions.filter((row) => row.invariant !== null);
    assert.equal(pausedStops.length, 1);
    assert.equal(pausedStops[0].category, 'policy-decision');
    assert.equal(pausedStops[0].task, '1.3');
    assert.equal(paused.interventions.filter((row) => row.event === 'approval.issued').length, 1);
    assert.equal(paused.routineClean, true);

    await recordGate(dir, 'accept-1-3', '1.3', 'accept');
    await recordGate(dir, 'complete-1-3', '1.3', 'complete');
    await recordStanding(dir, 'stand-production', 'production');
    const second = await drive(dir);
    assert.equal(second.code, 0, JSON.stringify(second.doc));
    assert.equal(second.doc.stopReason, 'all-done');
    assert.deepEqual(doneTasks(dir), ['1.1', '1.2', '1.3']);
    assert.ok(fs.existsSync(effectFile(dir, 'production')));

    const final = await report(dir);
    const finalStops = final.interventions.filter((row) => row.invariant !== null);
    assert.equal(finalStops.length, 1, 'resuming after the decision needs no second human');
    assert.equal(final.interventions.filter((row) => row.event === 'approval.issued').length, 4);
    assert.equal(final.routineClean, true);
  } finally {
    cleanup(dir);
  }
});

test('a transient infrastructure failure is retried by the agent and needs no human', {
  skip: skipFor('recoverable infrastructure failure'),
  timeout: 600_000,
}, async () => {
  const dir = tempProject();
  try {
    await setup(dir, { tasks: ['1.1'] });
    fs.mkdirSync(path.join(dir, '.factory/work'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.factory/work/transient.armed'), 'once\n');
    const result = await drive(dir, { retryTransient: 3 });
    assert.equal(result.code, 0, JSON.stringify(result.doc));
    assert.equal(result.doc.stopReason, 'all-done');
    assert.equal(result.retries, 1);
    assert.ok(result.requests.length <= 8, 'agent steps stay bounded');
    assert.deepEqual(doneTasks(dir), ['1.1']);
    const final = await report(dir);
    assert.equal(final.counts.interventions, 0);
    assert.equal(final.counts.handledByInvariant['infrastructure-failure'], 1);
    assert.ok(final.autonomousRecoveries.some((entry) => entry.invariant === 'infrastructure-failure'));
    assert.equal(final.routineClean, true);
  } finally {
    cleanup(dir);
  }
});

test('a task that can never pass stops inside the budget with a record and no human until it does', {
  skip: skipFor('bounded unrecoverable loop'),
  timeout: 600_000,
}, async () => {
  const dir = tempProject();
  try {
    await setup(dir, { tasks: ['1.1'] });
    const result = await drive(dir, { maxRequests: 12, passes: () => false, runArgs: ['--max-agent-steps', String(MAX_AGENT_STEPS)] });
    assert.notEqual(result.doc.stopReason, 'all-done');
    assert.ok(result.doc.blocked, JSON.stringify(result.doc));
    assert.ok(fs.existsSync(path.join(dir, '.factory/blocked/demo--1.1.json')));
    assert.deepEqual(doneTasks(dir), []);
    const final = await report(dir);
    assert.equal(result.doc.stopReason, 'unchanged-state');
    assert.equal(result.doc.blocked.invariant.code, 'unchanged-state');
    assert.ok(result.requests.length <= MAX_AGENT_STEPS, 'the loop stops inside the budget');
    assert.equal(final.counts.interventions, 1);
    assert.equal(final.interventions[0].category, 'failure');
    assert.equal(final.routineClean, false);
  } finally {
    cleanup(dir);
  }
});
