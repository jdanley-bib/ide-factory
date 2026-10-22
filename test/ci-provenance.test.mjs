import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');

const BASELINE_COMMANDS = [
  'npm ci',
  'npm test',
  'npm audit --audit-level=high',
  'npx openspec validate --all',
];

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
