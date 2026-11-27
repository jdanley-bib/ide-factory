import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { repoRoot } from './helpers.mjs';
import {
  REQUIRED_BEHAVIORS,
  acceptanceState,
  parseAcceptanceRecord,
  validateAcceptanceRecord,
} from './acceptance-record.mjs';

const recordsDir = path.join(repoRoot, 'docs/acceptance');

function passedRecord(overrides = {}) {
  const text = fs.readFileSync(path.join(recordsDir, 'azure-devops-mcp.md'), 'utf8');
  const record = parseAcceptanceRecord(text);
  Object.assign(record, {
    trigger: 'cursor-automation',
    run: 'auto-123',
    link: 'https://cursor.com/agents/auto-123',
    commit: 'abc1234',
    pullRequest: 'https://dev.azure.com/org/project/_git/repo/pullrequest/12',
    time: '2026-11-27T10:00:00Z',
    producer: 'cursor-agent',
    reviewer: 'dana',
  }, overrides);
  for (const behavior of REQUIRED_BEHAVIORS) {
    record.behaviors[behavior] = 'passed';
    record.evidence[behavior] = 'https://dev.azure.com/org/project/_git/repo/pullrequest/12';
  }
  return record;
}

test('the runbook names every required behavior and the no-mock and no-self-approval rules', () => {
  const text = fs.readFileSync(path.join(repoRoot, 'docs/cloud-acceptance.md'), 'utf8');
  for (const behavior of REQUIRED_BEHAVIORS) assert.ok(text.includes(`\`${behavior}\``), behavior);
  assert.match(text, /does not count/);
  assert.match(text, /not approved by its producer/);
});

test('every shipped record is well formed and none claims a pass', () => {
  const names = fs.readdirSync(recordsDir).filter((name) => name.endsWith('.md'));
  assert.deepEqual(names.sort(), ['azure-devops-mcp.md', 'github-automation.md']);
  const states = {};
  for (const name of names) {
    const record = parseAcceptanceRecord(fs.readFileSync(path.join(recordsDir, name), 'utf8'));
    assert.deepEqual(validateAcceptanceRecord(record), [], name);
    states[name] = acceptanceState(record);
  }
  assert.deepEqual(states, { 'azure-devops-mcp.md': 'not-run', 'github-automation.md': 'not-available' });
});

test('a record that omits a behavior fails naming it', () => {
  const record = passedRecord();
  delete record.behaviors['duplicate-claim-protection'];
  assert.deepEqual(validateAcceptanceRecord(record), ['behavior duplicate-claim-protection is missing']);
});

test('a fully passed record with real identifiers is valid', () => {
  const record = passedRecord();
  assert.deepEqual(validateAcceptanceRecord(record), []);
  assert.equal(acceptanceState(record), 'passed');
});

test('a passed behavior cannot cite a fixture, a path, or a mock', () => {
  for (const evidence of ['mock:run-1', 'fixture:replay', 'file:///tmp/run.json', './recorded/run.json', '/tmp/run.json', 'C:\\runs\\1.json', 'replay:abc']) {
    const record = passedRecord();
    record.evidence['recovered-transient-failure'] = evidence;
    const problems = validateAcceptanceRecord(record);
    assert.equal(problems.length, 1, evidence);
    assert.match(problems[0], /recovered-transient-failure/);
  }
  const bare = passedRecord();
  delete bare.evidence['recovered-transient-failure'];
  assert.match(validateAcceptanceRecord(bare)[0], /without an identifier/);
});

test('the reviewer must not be the producing agent identity', () => {
  const problems = validateAcceptanceRecord(passedRecord({ reviewer: 'cursor-agent' }));
  assert.deepEqual(problems, ['the reviewer is the producing agent identity']);
});

test('each provider is judged on its own record', () => {
  const azure = passedRecord();
  const github = parseAcceptanceRecord(fs.readFileSync(path.join(recordsDir, 'github-automation.md'), 'utf8'));
  assert.equal(acceptanceState(azure), 'passed');
  assert.equal(acceptanceState(github), 'not-available');
});

test('a not-available record cannot carry a passing behavior', () => {
  const record = parseAcceptanceRecord(fs.readFileSync(path.join(recordsDir, 'github-automation.md'), 'utf8'));
  record.behaviors['clean-stop-for-unauthorized-effect'] = 'passed';
  assert.ok(validateAcceptanceRecord(record).some((problem) => /not-available/.test(problem)));
});
