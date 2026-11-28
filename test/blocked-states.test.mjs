import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { getAttempt } from '../src/lib/attempt.mjs';
import { AUTHORITY } from '../src/lib/authority.mjs';
import {
  BLOCKED_CODES,
  BLOCKED_TABLE,
  STOP_REASON_CODES,
  buildBlockedReport,
  codeForStopReason,
} from '../src/lib/blocked-states.mjs';
import { renderWorkPacket } from '../src/lib/queue.mjs';
import { standingDecisions } from '../src/lib/standing-decisions.mjs';
import { getWorkItem } from '../src/lib/work.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';
import { commitAll, nodeCheck, writeJson } from './factory-project.mjs';

const HOUR_MS = 60 * 60 * 1000;
const RAW = { rawRegistry: true };

function ok(result) {
  assert.equal(result.code, 0, result.err + result.out);
  return result;
}

function patchJson(dir, rel, mutate) {
  const file = path.join(dir, rel);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function seed(dir, { taskType = 'lightweight', humanGate = true, checks = ['unit'] } = {}) {
  ok(await idefactory(dir, ['init']));
  patchJson(dir, '.factory/config.json', (config) => { config.governance.policyVersion = 1; });
  patchJson(dir, '.factory/profiles.json', (profiles) => {
    profiles.gated = { checks, humanGate };
  });
  writeJson(dir, '.factory/checks.json', {
    schemaVersion: 1,
    checks: Object.fromEntries(checks.map((kind) => [kind, nodeCheck('process.exit(0)')])),
  });
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes/demo/tasks.md'), [
    '- [ ] 1.1 Gated item',
    '  factory:',
    '    kind: general',
    '    dependencies: []',
    `    taskType: ${taskType}`,
    `    checks: [${checks.join(', ')}]`,
    '    verificationProfile: gated',
    '    roles: [engineer, reviewer, scribe]',
    '',
  ].join('\n'));
  ok(await idefactory(dir, ['sync-tasks', 'demo'], {}, RAW));
  commitAll(dir);
}

async function toAwaitingReview(dir) {
  const started = ok(await idefactory(dir, ['attempt', 'start', 'demo', '1.1']));
  const { id } = JSON.parse(started.out);
  ok(await idefactory(dir, ['attempt', 'transition', id, 'implementing', '--evidence', '{"implementerId":"engineer-1"}']));
  ok(await idefactory(dir, ['verify', 'run', id, '--check', 'unit']));
  ok(await idefactory(dir, ['attempt', 'transition', id, 'verifying', '--evidence', '{}']));
  ok(await idefactory(dir, ['attempt', 'transition', id, 'awaiting-review', '--evidence', '{}']));
  commitAll(dir);
  return id;
}

function runJson(dir, extra = []) {
  return idefactory(dir, ['run', '--change', 'demo', '--max-agent-steps', '10', '--json', ...extra]);
}

function events(dir) {
  const file = path.join(dir, '.factory/observability/events.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function readRecord(dir, task = '1.1') {
  return JSON.parse(fs.readFileSync(path.join(dir, `.factory/blocked/demo--${task}.json`), 'utf8'));
}

test('every stop reason in the bounded-run-sessions list maps to a code', () => {
  const spec = fs.readFileSync(path.join(repoRoot, 'openspec/specs/bounded-run-sessions/spec.md'), 'utf8');
  const sentence = spec.split('\n').find((line) => line.includes('The reason SHALL be one of'));
  assert.ok(sentence, 'the stop reason list must exist in the spec');
  const reasons = [...sentence.matchAll(/`([a-z-]+)`/g)].map((match) => match[1]);
  assert.ok(reasons.length >= 21);
  for (const reason of reasons) {
    assert.ok(Object.hasOwn(STOP_REASON_CODES, reason), `stop reason ${reason} has no mapping`);
    const code = STOP_REASON_CODES[reason];
    assert.ok(code === null || BLOCKED_CODES.includes(code), `${reason} maps to unknown code ${code}`);
  }
  assert.equal(codeForStopReason('not-a-reason'), 'unclassified');
});

test('each code has a retry class and options that name real commands', () => {
  for (const [code, row] of Object.entries(BLOCKED_TABLE)) {
    assert.ok(['safe', 'only-after-change', 'never'].includes(row.retry), code);
    for (const entry of row.options) {
      assert.ok(Object.hasOwn(AUTHORITY, entry.id), `${code}/${entry.id}`);
      assert.equal(typeof entry.resolves, 'boolean');
    }
  }
  assert.equal(BLOCKED_TABLE['infrastructure-failure'].retry, 'safe');
  assert.equal(BLOCKED_TABLE['vacuous-red'].retry, 'only-after-change');
  assert.equal(BLOCKED_TABLE['retry-cap'].retry, 'never');
});

test('actors follow who holds the authority', async () => {
  const dir = tempProject();
  try {
    ok(await idefactory(dir, ['init']));
    assert.equal(buildBlockedReport(dir, { code: 'approval-missing', change: 'demo', task: '1.1', action: 'accept' }).actor, 'human');
    assert.equal(buildBlockedReport(dir, { code: 'reviewer-lockout', change: 'demo' }).actor, 'human');
    const review = buildBlockedReport(dir, {
      code: 'needs-review',
      attempt: { id: 'a1', change: 'demo', taskId: '1.1', state: 'awaiting-review' },
    });
    assert.equal(review.actor, 'independent-agent');
    const rejected = buildBlockedReport(dir, {
      code: 'attempt-rejected',
      attempt: { id: 'a1', change: 'demo', taskId: '1.1', state: 'rejected' },
    });
    const start = rejected.recovery.options.find((entry) => entry.id === 'start-new-attempt');
    assert.equal(start.supported, true);
    assert.equal(start.command, 'idefactory attempt start demo 1.1');
  } finally {
    cleanup(dir);
  }
});

test('a vacuous red offers the already-satisfied proposal first, and each proposal names the states it accepts', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const vacuous = { id: 'a1', change: 'demo', taskId: '1.1', state: 'implementing', evidence: { redFailures: [{ kind: 'unit', classification: 'vacuous-red' }] } };
    const report = buildBlockedReport(dir, { code: 'vacuous-red', attempt: vacuous });
    const first = report.recovery.options[0];
    assert.equal(first.id, 'propose-already-satisfied');
    assert.equal(first.supported, true);
    for (const flag of ['--reason already-satisfied', '--test-path', '--kind']) assert.match(first.command, new RegExp(flag));
    const propose = report.recovery.options.find((entry) => entry.id === 'propose-method');
    assert.match(propose.requires, /planned, assigned, or implementing/);
    assert.doesNotMatch(propose.requires, /before verification/);

    const verifying = buildBlockedReport(dir, { code: 'vacuous-red', attempt: { ...vacuous, state: 'verifying' } });
    assert.equal(verifying.recovery.options.find((entry) => entry.id === 'propose-already-satisfied').supported, false);
    assert.equal(verifying.recovery.options.find((entry) => entry.id === 'propose-method').supported, false);

    const noVacuous = buildBlockedReport(dir, { code: 'red-missing', attempt: { ...vacuous, evidence: {} } });
    assert.equal(noVacuous.recovery.options.find((entry) => entry.id === 'propose-already-satisfied'), undefined);
    assert.equal(noVacuous.recovery.options.find((entry) => entry.id === 'propose-method').supported, true);
  } finally {
    cleanup(dir);
  }
});

test('a stop with no supported resolving option says so and names the human', async () => {
  const dir = tempProject();
  try {
    ok(await idefactory(dir, ['init']));
    const report = buildBlockedReport(dir, {
      code: 'red-missing',
      attempt: { id: 'a1', change: 'demo', taskId: '1.1', state: 'finalized' },
    });
    assert.equal(report.recovery.supported, false);
    assert.match(report.recovery.message, /no supported recovery/);
    assert.equal(report.actor, 'human');
    assert.ok(report.recovery.options.length > 0);
    for (const entry of report.recovery.options) {
      assert.equal(entry.supported, false);
      assert.equal(entry.command, undefined);
    }
    const accepted = buildBlockedReport(dir, {
      code: 'red-missing',
      attempt: { id: 'a1', change: 'demo', taskId: '1.1', state: 'accepted' },
    });
    assert.equal(accepted.recovery.supported, true);
    assert.match(accepted.recovery.options.find((entry) => entry.id === 'reopen-attempt').command, /attempt reopen a1/);
  } finally {
    cleanup(dir);
  }
});

test('an option for a command that does not exist reports unsupported', async () => {
  const dir = tempProject();
  try {
    ok(await idefactory(dir, ['init']));
    const row = BLOCKED_TABLE.unclassified;
    row.options.push({
      id: 'ghost', key: ['no', 'such'], command: 'idefactory no such', actor: 'tooling', requires: 'nothing', resolves: true, when: () => true,
    });
    try {
      const report = buildBlockedReport(dir, { code: 'unclassified', message: 'boom' });
      assert.equal(report.recovery.supported, false);
      assert.equal(report.recovery.options.find((entry) => entry.id === 'ghost').supported, false);
      assert.equal(report.invariant.message, 'boom');
      assert.match(report.recovery.message, /No recovery is known/);
    } finally {
      row.options.pop();
    }
  } finally {
    cleanup(dir);
  }
});

test('run --json reports a human gate and keeps the exit code and the text', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    await toAwaitingReview(dir);
    const text = await idefactory(dir, ['run', '--change', 'demo', '--max-agent-steps', '10']);
    assert.equal(text.code, 0, text.err + text.out);
    assert.match(text.out, /Run stopped \(human-gate\)/);
    assert.throws(() => JSON.parse(text.out));

    const json = await runJson(dir);
    assert.equal(json.code, text.code);
    const doc = JSON.parse(json.out);
    assert.equal(doc.stopReason, 'human-gate');
    assert.equal(doc.exitCode, 0);
    assert.equal(doc.blocked.invariant.code, 'approval-missing');
    assert.equal(doc.blocked.actor, 'human');
    assert.equal(doc.blocked.retry, 'only-after-change');
    assert.equal(doc.blocked.task, '1.1');
    assert.match(doc.blocked.recovery.options.find((entry) => entry.id === 'record-approval').command, /--action accept/);
  } finally {
    cleanup(dir);
  }
});

test('a reported stop writes one record and a control event without dirtying HEAD', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const attemptId = await toAwaitingReview(dir);
    ok(await runJson(dir));
    ok(await runJson(dir));
    const record = readRecord(dir);
    assert.equal(record.status, 'open');
    assert.equal(record.invariant.code, 'approval-missing');
    assert.equal(record.attemptId, attemptId);
    assert.ok(record.recordedAt);
    const recorded = events(dir).filter((event) => event.type === 'blocked.recorded');
    assert.equal(recorded.length, 1);
    assert.deepEqual(
      [recorded[0].invariant, recorded[0].actor, recorded[0].retry, recorded[0].agentActionable],
      ['approval-missing', 'human', 'only-after-change', false],
    );
    const approved = await idefactory(dir, [
      'approve', 'gate-1', '--note', 'ok', '--change', 'demo', '--task', '1.1', '--action', 'accept',
      '--approver', 'human-1', '--expiry', new Date(Date.now() + HOUR_MS).toISOString(),
    ]);
    ok(approved);
  } finally {
    cleanup(dir);
  }
});

test('a human approval ends the stop, the next run proceeds, and the record names the approval', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    await toAwaitingReview(dir);
    ok(await runJson(dir));
    ok(await idefactory(dir, [
      'approve', 'gate-1', '--note', 'ok', '--change', 'demo', '--task', '1.1', '--action', 'accept',
      '--approver', 'human-1', '--expiry', new Date(Date.now() + HOUR_MS).toISOString(),
    ]));
    const next = await runJson(dir);
    assert.equal(next.code, 2, next.err + next.out);
    const doc = JSON.parse(next.out);
    assert.equal(doc.stopReason, 'needs-agent');
    assert.equal(doc.blocked.invariant.code, 'needs-review');
    assert.equal(doc.blocked.actor, 'independent-agent');
    assert.match(doc.request.role, /reviewer/);
    assert.match(doc.text, /Standing decisions/);
    assert.match(doc.text, /approval gate-1/);

    const record = readRecord(dir);
    assert.equal(record.status, 'resolved');
    assert.deepEqual(record.resolvedBy, { kind: 'approval', id: 'gate-1' });
    const resolved = events(dir).filter((event) => event.type === 'blocked.resolved');
    assert.equal(resolved.length, 1);
    assert.deepEqual([resolved[0].resolution, resolved[0].id], ['approval', 'gate-1']);
  } finally {
    cleanup(dir);
  }
});

test('a stale open record never blocks a run and is marked resolved', async () => {
  const dir = tempProject();
  try {
    await seed(dir, { humanGate: false });
    const attemptId = await toAwaitingReview(dir);
    const attempt = getAttempt(dir, attemptId);
    writeJson(dir, '.factory/blocked/demo--1.1.json', {
      schemaVersion: 1,
      change: 'demo',
      task: '1.1',
      attemptId,
      attemptState: attempt.state,
      invariant: { code: 'approval-missing', message: 'stale' },
      actor: 'human',
      retry: 'only-after-change',
      recovery: { supported: false, options: [] },
      status: 'open',
      recordedAt: new Date().toISOString(),
    });
    const result = await runJson(dir);
    assert.equal(result.code, 2, result.err + result.out);
    assert.equal(JSON.parse(result.out).stopReason, 'needs-agent');
    const record = readRecord(dir);
    assert.equal(record.status, 'resolved');
    assert.equal(record.resolvedBy.kind, 'profile-waiver');
  } finally {
    cleanup(dir);
  }
});

test('a lockout stop is recorded and resolved by the lockout resolution', async () => {
  const dir = tempProject();
  try {
    await seed(dir, { humanGate: false });
    await toAwaitingReview(dir);
    const created = ok(await idefactory(dir, ['lockout', 'create', '--agent', 'engineer-1', '--reviewer', 'reviewer-1', '--reason', 'failed']));
    const lockoutId = /([0-9a-f-]{36})/.exec(created.out)[1];
    const stopped = await runJson(dir);
    assert.equal(stopped.code, 1);
    const doc = JSON.parse(stopped.out);
    assert.equal(doc.stopReason, 'lockout');
    assert.equal(doc.blocked.invariant.code, 'reviewer-lockout');
    assert.equal(doc.blocked.actor, 'independent-agent');
    assert.equal(readRecord(dir).status, 'open');

    ok(await idefactory(dir, ['lockout', 'resolve', lockoutId, '--resolver', 'human-1', '--reason', 'fixed']));
    const next = await runJson(dir);
    assert.equal(next.code, 2, next.err + next.out);
    const record = readRecord(dir);
    assert.equal(record.status, 'resolved');
    assert.deepEqual(record.resolvedBy, { kind: 'lockout-resolution', id: lockoutId });
  } finally {
    cleanup(dir);
  }
});

test('complete --json reports a missing red with the reopen option and keeps the text and exit code', async () => {
  const dir = tempProject();
  try {
    await seed(dir, { taskType: 'code', humanGate: false });
    const started = ok(await idefactory(dir, ['attempt', 'start', 'demo', '1.1']));
    const { id } = JSON.parse(started.out);
    ok(await idefactory(dir, ['attempt', 'transition', id, 'implementing', '--evidence', '{"implementerId":"engineer-1"}']));
    patchJson(dir, '.factory/attempts/' + `${id}.json`, (attempt) => {
      attempt.state = 'accepted';
      attempt.reviewerId = 'reviewer-1';
      attempt.evidence.review = { reviewerId: 'reviewer-1', verdict: 'ACCEPT' };
    });
    ok(await idefactory(dir, ['verify', 'run', id, '--check', 'unit']));
    commitAll(dir);
    const plain = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', id]);
    assert.notEqual(plain.code, 0);
    assert.match(plain.err, /requires a recorded failing CLI red or red exception for: unit/);
    assert.equal(plain.out, '');

    const json = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', id, '--json']);
    assert.equal(json.code, plain.code);
    const doc = JSON.parse(json.out);
    assert.equal(doc.ok, false);
    assert.equal(doc.blocked.invariant.code, 'red-missing');
    assert.equal(doc.blocked.actor, 'independent-agent');
    assert.match(doc.blocked.recovery.options.find((entry) => entry.id === 'reopen-attempt').command, /attempt reopen/);
    assert.equal(doc.message, plain.err.trim());
  } finally {
    cleanup(dir);
  }
});

test('attempt transition --json and an unmapped failure report unclassified', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const started = ok(await idefactory(dir, ['attempt', 'start', 'demo', '1.1']));
    const { id } = JSON.parse(started.out);
    const plain = await idefactory(dir, ['attempt', 'transition', id, 'accepted', '--evidence', '{}']);
    assert.notEqual(plain.code, 0);
    assert.equal(plain.out, '');
    const json = await idefactory(dir, ['attempt', 'transition', id, 'accepted', '--evidence', '{}', '--json']);
    assert.equal(json.code, plain.code);
    const doc = JSON.parse(json.out);
    assert.equal(doc.ok, false);
    assert.equal(doc.blocked.invariant.code, 'unclassified');
    assert.equal(doc.blocked.invariant.message, plain.err.trim());
    assert.equal(doc.blocked.recovery.supported, false);
    assert.match(doc.blocked.recovery.message, /No recovery is known/);
    assert.equal(fs.existsSync(path.join(dir, '.factory/blocked')), false);
  } finally {
    cleanup(dir);
  }
});

test('sync-tasks --json reports a reconciliation error that names --plan', async () => {
  const dir = tempProject();
  try {
    ok(await idefactory(dir, ['init']));
    fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
    const tasks = path.join(dir, 'openspec/changes/demo/tasks.md');
    fs.writeFileSync(tasks, '- [ ] 1.1 First unchecked task\n- [ ] 1.2 Second unchecked task\n');
    ok(await idefactory(dir, ['sync-tasks', 'demo']));
    fs.writeFileSync(tasks, '- [ ] 1.1 Combined unchecked task\n');
    const result = await idefactory(dir, ['sync-tasks', 'demo', '--json']);
    assert.notEqual(result.code, 0);
    const doc = JSON.parse(result.out);
    assert.equal(doc.blocked.invariant.code, 'reconciliation-required');
    assert.match(doc.message, /sync-tasks demo --plan/);
    const plan = doc.blocked.recovery.options.find((entry) => entry.id === 'plan-reconciliation');
    assert.equal(plan.command, 'idefactory sync-tasks demo --plan');
    const ok2 = await idefactory(dir, ['sync-tasks', 'demo', '--plan', '--json']);
    assert.equal(JSON.parse(ok2.out).schemaVersion, 1);
  } finally {
    cleanup(dir);
  }
});

test('next --json reports the empty case and run --json reports a halt', async () => {
  const dir = tempProject();
  try {
    ok(await idefactory(dir, ['init']));
    const empty = await idefactory(dir, ['next', '--change', 'demo', '--json']);
    assert.equal(empty.code, 0, empty.err + empty.out);
    const doc = JSON.parse(empty.out);
    assert.equal(doc.empty, true);
    assert.equal(doc.blocked.invariant.code, 'no-ready-work');
    const plain = await idefactory(dir, ['next', '--change', 'demo']);
    assert.match(plain.out, /No ready To Do work item/);

    fs.writeFileSync(path.join(dir, 'HALT'), 'stop\n');
    const halted = await idefactory(dir, ['run', '--change', 'demo', '--json']);
    assert.equal(halted.code, 1);
    const haltDoc = JSON.parse(halted.out);
    assert.equal(haltDoc.blocked.invariant.code, 'halted');
    assert.equal(haltDoc.blocked.retry, 'never');
    assert.equal(haltDoc.blocked.actor, 'human');
  } finally {
    cleanup(dir);
  }
});

test('standing decisions list valid approvals, omit expired ones, and match across roles', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    await toAwaitingReview(dir);
    const item = getWorkItem(dir, 'demo', '1.1');
    assert.deepEqual(standingDecisions(dir, item), []);
    assert.doesNotMatch(renderWorkPacket(dir, item, 'reviewer'), /Standing decisions/);

    ok(await idefactory(dir, [
      'approve', 'gate-1', '--note', 'ok', '--change', 'demo', '--task', '1.1', '--action', 'accept',
      '--approver', 'human-1', '--expiry', new Date(Date.now() + HOUR_MS).toISOString(),
    ]));
    const rows = standingDecisions(dir, item);
    assert.deepEqual(rows.map((row) => [row.kind, row.id, row.approver]), [['approval', 'gate-1', 'human-1']]);
    const reviewer = renderWorkPacket(dir, item, 'reviewer');
    const engineer = renderWorkPacket(dir, item, 'engineer');
    const block = (text) => text.slice(text.indexOf('Standing decisions'), text.indexOf('Standing decisions') + 220).split('\n').slice(0, 2).join('\n');
    assert.match(reviewer, /approval gate-1: accept/);
    assert.equal(block(reviewer), block(engineer));

    const approvalFile = path.join(dir, '.factory/approvals/gate-1.json');
    const record = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
    record.issuance = new Date(Date.now() - 3 * HOUR_MS).toISOString();
    record.expiry = new Date(Date.now() - 2 * HOUR_MS).toISOString();
    fs.writeFileSync(approvalFile, JSON.stringify(record, null, 2));
    assert.deepEqual(standingDecisions(dir, item), []);
    const result = await idefactory(dir, ['authorize', '--change', 'demo', '--task', '1.1', '--action', 'accept', '--json']);
    assert.equal(JSON.parse(result.out).authorized, false);
  } finally {
    cleanup(dir);
  }
});

test('a reconciliation decision for the item is listed', async () => {
  const dir = tempProject();
  try {
    await seed(dir);
    const item = getWorkItem(dir, 'demo', '1.1');
    writeJson(dir, '.factory/work/reconciliations/rec-1.json', {
      schemaVersion: 1,
      id: 'rec-1',
      change: 'demo',
      status: 'applied',
      decidedBy: 'lead-1',
      time: new Date().toISOString(),
      before: { '1.1': 'sha256:x' },
    });
    const rows = standingDecisions(dir, item);
    assert.deepEqual(rows.map((row) => [row.kind, row.id, row.approver]), [['reconciliation', 'rec-1', 'lead-1']]);
  } finally {
    cleanup(dir);
  }
});

test('shipped skills tell the agent to branch on the report and not to re-ask', () => {
  for (const name of ['factory-run', 'factory-build', 'factory-coordinator', 'factory-governance']) {
    const text = fs.readFileSync(path.join(repoRoot, 'templates/skills', name, 'SKILL.md'), 'utf8');
    assert.match(text, /Standing decisions/, name);
    assert.match(text, /do not ask for/i, name);
    assert.match(text, /retry/i, name);
  }
  const run = fs.readFileSync(path.join(repoRoot, 'templates/skills/factory-run/SKILL.md'), 'utf8');
  for (const word of ['actor', 'supported', 'safe', 'only-after-change', 'never']) assert.match(run, new RegExp(word));
});

test('the method proposal rows name the reopened case that the command accepts', () => {
  for (const [code, id] of [['red-missing', 'propose-method'], ['vacuous-red', 'propose-method'], ['vacuous-red', 'propose-already-satisfied']]) {
    const option = BLOCKED_TABLE[code].options.find((entry) => entry.id === id);
    assert.match(option.requires, /reopened for a method/, `${code} ${id}`);
  }
});
