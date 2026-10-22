import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
const secretlintRcPath = path.join(repoRoot, '.secretlintrc.json');

const BASELINE_COMMANDS = [
  'npm ci',
  'npm test',
  'npm audit --audit-level=high',
  'npx openspec validate --all',
];

/** Shared local/CI secretlint invocation (exact string must appear as a CI run step). */
const SECRETLINT_COMMAND = 'npx secretlint "**/*"';

/** Exact Semgrep CLI pin (PyPI); not a product/runtime npm dependency. */
const SEMGREP_VERSION = '1.182.0';

/** Shared local/CI Semgrep invocation (exact string must appear as a CI run step). */
const SEMGREP_COMMAND = 'semgrep --error --metrics=off --config p/javascript';

/**
 * Deterministic high-confidence Slack bot token fixture — not a live credential.
 * Built at runtime so the contiguous token never appears in the committed tree.
 */
const SEEDED_SLACK_BOT_TOKEN = Buffer.from(
  'eG94Yi0xMjM0NTY3ODkwMTItMTIzNDU2Nzg5MDEyMy1BYkNkRWZHaElqS2xNbk9wUXJTdFV2V3g=',
  'base64',
).toString('utf8');

/**
 * Seeded JS finding for p/javascript (express XSS direct-response-write).
 * Assembled at runtime so no insecure fixture file is committed (keeps
 * secret-scan clean and avoids landing vulnerable samples in the tree).
 */
function seededJavascriptFindingSource() {
  return [
    "const express = require('express');",
    'const app = express();',
    "app.get('/user', (req, res) => {",
    '  res.send(req.query.name);',
    '});',
    '',
  ].join('\n');
}

function readWorkflow() {
  assert.ok(fs.existsSync(workflowPath), `missing ${workflowPath}`);
  return fs.readFileSync(workflowPath, 'utf8');
}

function baselineJobBlock(yaml) {
  const match = yaml.match(/(?:^|\n)(\s*)baseline\s*:\s*\n([\s\S]*?)(?=\n\1[A-Za-z0-9_-]+\s*:\s*\n|\n*$)/);
  assert.ok(match, 'workflow must define a job named baseline');
  return match[2];
}

function runSteps(jobBody) {
  const steps = [];
  const stepBlocks = jobBody.split(/\n\s*-\s+/).slice(1);
  for (const block of stepBlocks) {
    const runMatch = block.match(/\brun\s*:\s*(?:\|\s*\n([\s\S]*?)(?=\n\s*\w|\n*$)|(.+))/);
    if (!runMatch) continue;
    const body = (runMatch[1] || runMatch[2] || '').trim();
    const command = body.split('\n')[0].trim();
    const continueOnError = /^\s*continue-on-error\s*:\s*true\s*$/m.test(block)
      || /\n\s+continue-on-error\s*:\s*true\s*(?:\n|$)/.test(`\n${block}`);
    steps.push({ command, continueOnError, raw: block });
  }
  return steps;
}

test('baseline CI job runs the four Phase 0 commands on pull_request and push with Node 22', () => {
  const yaml = readWorkflow();

  assert.match(yaml, /^\s*on\s*:/m, 'workflow must declare on triggers');
  assert.match(yaml, /\bpull_request\b/, 'workflow must trigger on pull_request');
  assert.match(yaml, /\bpush\b/, 'workflow must trigger on push');

  const job = baselineJobBlock(yaml);
  assert.match(job, /\bnode-version\s*:\s*['"]?22['"]?\b/, 'baseline job must use Node 22');

  const steps = runSteps(job);
  const commands = steps.map((step) => step.command);
  for (const required of BASELINE_COMMANDS) {
    assert.ok(
      commands.some((command) => command === required || command.startsWith(`${required} `)),
      `baseline job must run \`${required}\`; found: ${JSON.stringify(commands)}`,
    );
  }

  for (const required of BASELINE_COMMANDS) {
    const step = steps.find(
      (candidate) => candidate.command === required || candidate.command.startsWith(`${required} `),
    );
    assert.ok(step, `missing run step for ${required}`);
    assert.equal(
      step.continueOnError,
      false,
      `\`${required}\` must fail the job on non-zero exit (no continue-on-error)`,
    );
  }
});

const FULL_SHA = /^[0-9a-f]{40}$/;

function thirdPartyUses(yaml) {
  const refs = [];
  for (const line of yaml.split('\n')) {
    const match = line.match(/^\s*-\s*uses\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    const raw = match[1].replace(/\s+#.*$/, '').trim();
    // Local or reusable workflow refs are not third-party marketplace actions.
    if (raw.startsWith('./') || raw.startsWith('.github/') || raw.startsWith('docker://')) continue;
    refs.push(raw);
  }
  return refs;
}

test('baseline workflow uses contents:read, full-SHA action pins, and forbids pull_request_target and continue-on-error', () => {
  const yaml = readWorkflow();

  assert.match(
    yaml,
    /^\s*permissions\s*:\s*\n(?:\s+.+\n)*?\s+contents\s*:\s*read\s*$/m,
    'workflow must set permissions.contents to read',
  );
  assert.doesNotMatch(
    yaml,
    /^\s*contents\s*:\s*write\b/m,
    'workflow must not request contents: write',
  );

  assert.doesNotMatch(
    yaml,
    /\bpull_request_target\b/,
    'workflow must not use pull_request_target',
  );
  assert.doesNotMatch(
    yaml,
    /^\s*continue-on-error\s*:\s*true\s*$/m,
    'workflow must not set continue-on-error: true',
  );

  const uses = thirdPartyUses(yaml);
  assert.ok(uses.length > 0, 'baseline workflow must use at least one third-party action');
  for (const ref of uses) {
    const at = ref.lastIndexOf('@');
    assert.ok(at > 0, `action ref must include @pin: ${ref}`);
    const pin = ref.slice(at + 1);
    assert.ok(
      FULL_SHA.test(pin),
      `third-party action must be pinned to a full 40-char commit SHA (not a tag/branch): ${ref}`,
    );
  }
});

function secretScanJobBlock(yaml) {
  const match = yaml.match(/(?:^|\n)(\s*)secret-scan\s*:\s*\n([\s\S]*?)(?=\n\1[A-Za-z0-9_-]+\s*:\s*\n|\n*$)/);
  assert.ok(match, 'workflow must define a job named secret-scan');
  return match[2];
}

function runSharedSecretlint(cwd) {
  const binDir = path.join(repoRoot, 'node_modules', '.bin');
  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
  };
  return spawnSync(SECRETLINT_COMMAND, {
    cwd,
    env,
    encoding: 'utf8',
    shell: true,
  });
}

function prepareSecretlintFixture(contentsByRelativePath) {
  assert.ok(fs.existsSync(secretlintRcPath), `missing ${secretlintRcPath}`);
  const dir = mkdtempSync(path.join(tmpdir(), 'secretlint-fixture-'));
  fs.copyFileSync(secretlintRcPath, path.join(dir, '.secretlintrc.json'));
  // Same command as CI resolves rules from cwd; link the repo install into the temp tree.
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  for (const [relative, body] of Object.entries(contentsByRelativePath)) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body, 'utf8');
  }
  return dir;
}

test('shared secretlint command fails on seeded secret, passes clean tree, masks secret, and matches CI', () => {
  const yaml = readWorkflow();
  const job = secretScanJobBlock(yaml);
  const steps = runSteps(job);
  const commands = steps.map((step) => step.command);
  assert.ok(
    commands.includes(SECRETLINT_COMMAND),
    `secret-scan job must run \`${SECRETLINT_COMMAND}\`; found: ${JSON.stringify(commands)}`,
  );
  const secretStep = steps.find((step) => step.command === SECRETLINT_COMMAND);
  assert.equal(
    secretStep.continueOnError,
    false,
    `\`${SECRETLINT_COMMAND}\` must fail the job on non-zero exit (no continue-on-error)`,
  );

  let dirtyDir;
  let cleanDir;
  try {
    dirtyDir = prepareSecretlintFixture({
      'seed.env': `SLACK_TOKEN=${SEEDED_SLACK_BOT_TOKEN}\n`,
    });
    const dirty = runSharedSecretlint(dirtyDir);
    const dirtyOutput = `${dirty.stdout || ''}${dirty.stderr || ''}`;
    assert.notEqual(
      dirty.status,
      0,
      `seeded secret must make secretlint exit non-zero; output:\n${dirtyOutput}`,
    );
    assert.ok(
      !dirtyOutput.includes(SEEDED_SLACK_BOT_TOKEN),
      'secretlint output must not contain the seeded secret value',
    );

    cleanDir = prepareSecretlintFixture({
      'notes.txt': 'no credentials here\n',
    });
    const clean = runSharedSecretlint(cleanDir);
    const cleanOutput = `${clean.stdout || ''}${clean.stderr || ''}`;
    assert.equal(
      clean.status,
      0,
      `clean tree must make secretlint exit zero; output:\n${cleanOutput}`,
    );
  } finally {
    if (dirtyDir) rmSync(dirtyDir, { recursive: true, force: true });
    if (cleanDir) rmSync(cleanDir, { recursive: true, force: true });
  }
});

function sastJobBlock(yaml) {
  const match = yaml.match(/(?:^|\n)(\s*)sast\s*:\s*\n([\s\S]*?)(?=\n\1[A-Za-z0-9_-]+\s*:\s*\n|\n*$)/);
  assert.ok(match, 'workflow must define a job named sast');
  return match[2];
}

function ensurePinnedSemgrep() {
  const versionCheck = spawnSync('semgrep', ['--version'], { encoding: 'utf8' });
  const versionText = `${versionCheck.stdout || ''}${versionCheck.stderr || ''}`;
  if (versionCheck.status === 0 && versionText.includes(SEMGREP_VERSION)) {
    return;
  }
  const install = spawnSync(
    'python3',
    ['-m', 'pip', 'install', '--user', `semgrep==${SEMGREP_VERSION}`],
    { encoding: 'utf8' },
  );
  assert.equal(
    install.status,
    0,
    `failed to install semgrep==${SEMGREP_VERSION}:\n${install.stdout || ''}${install.stderr || ''}`,
  );
}

function runSharedSemgrep(cwd) {
  const userBin = path.join(process.env.HOME || '', '.local', 'bin');
  const env = {
    ...process.env,
    PATH: `${userBin}${path.delimiter}${process.env.PATH || ''}`,
  };
  return spawnSync(SEMGREP_COMMAND, {
    cwd,
    env,
    encoding: 'utf8',
    shell: true,
  });
}

test('pinned Semgrep fails on seeded JS finding and sast job has no continue-on-error', () => {
  const yaml = readWorkflow();
  const job = sastJobBlock(yaml);
  assert.doesNotMatch(
    job,
    /^\s*continue-on-error\s*:\s*true\s*$/m,
    'sast job must not set continue-on-error: true',
  );
  const steps = runSteps(job);
  const commands = steps.map((step) => step.command);
  assert.ok(
    commands.includes(SEMGREP_COMMAND),
    `sast job must run \`${SEMGREP_COMMAND}\`; found: ${JSON.stringify(commands)}`,
  );
  const semgrepStep = steps.find((step) => step.command === SEMGREP_COMMAND);
  assert.equal(
    semgrepStep.continueOnError,
    false,
    `\`${SEMGREP_COMMAND}\` must fail the job on non-zero exit (no continue-on-error)`,
  );
  assert.ok(
    commands.some((command) => command === `pip install semgrep==${SEMGREP_VERSION}`
      || command === `python3 -m pip install semgrep==${SEMGREP_VERSION}`
      || command === `python3 -m pip install --user semgrep==${SEMGREP_VERSION}`),
    `sast job must install exact semgrep==${SEMGREP_VERSION}; found: ${JSON.stringify(commands)}`,
  );

  ensurePinnedSemgrep();

  let fixtureDir;
  try {
    fixtureDir = mkdtempSync(path.join(tmpdir(), 'semgrep-fixture-'));
    fs.writeFileSync(
      path.join(fixtureDir, 'seed.js'),
      seededJavascriptFindingSource(),
      'utf8',
    );
    const result = runSharedSemgrep(fixtureDir);
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.notEqual(
      result.status,
      0,
      `seeded JS finding must make Semgrep exit non-zero; output:\n${output}`,
    );
  } finally {
    if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
  }
});
