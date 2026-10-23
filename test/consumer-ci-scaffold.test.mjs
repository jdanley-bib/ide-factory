import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

const fakeForge = path.join(repoRoot, 'support/fake-forge.mjs');
const consumerRelative = path.join('.github', 'workflows', 'factory-consumer.yml');
const repoCi = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
const repoRelease = path.join(repoRoot, '.github', 'workflows', 'release.yml');

const REQUIRED_COMMANDS = [
  'npm ci',
  'npm test',
  'npm audit --audit-level=high',
  'npx openspec validate --all',
];

const FORBIDDEN_WORKFLOW = [
  /semgrep/i,
  /pull_request_target/,
  /continue-on-error\s*:\s*true/i,
  /\bgh\s+api\b/i,
  /\brulesets\b/i,
  /branches\/.+\/protection/i,
  /api\.github\.com/i,
];

function workflowPath(dir) {
  return path.join(dir, consumerRelative);
}

function nodeVersions(yaml) {
  return [...yaml.matchAll(/\bnode-version\s*:\s*['"]?(\d+)['"]?/g)].map((match) => match[1]);
}

test('ci scaffold writes the consumer workflow once and init does not', async () => {
  const dir = tempProject();
  const logPath = path.join(dir, 'forge-argv.log');
  const ghLog = path.join(dir, 'gh-calls.log');
  const ciBefore = fs.readFileSync(repoCi);
  const releaseBefore = fs.readFileSync(repoRelease);
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.equal(fs.existsSync(workflowPath(dir)), false, 'init must not create the consumer workflow');
    assert.equal((await idefactory(dir, ['upgrade'])).code, 0);
    assert.equal(fs.existsSync(workflowPath(dir)), false, 'upgrade must not create the consumer workflow');

    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, 'gh'),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$IDEFACTORY_GH_LOG"\nexit 1\n',
    );
    fs.chmodSync(path.join(bin, 'gh'), 0o755);
    const forgeEnv = {
      IDEFACTORY_FORGE: fakeForge,
      IDEFACTORY_FORGE_LOG: logPath,
      IDEFACTORY_GH_LOG: ghLog,
      PATH: `${bin}:${process.env.PATH || ''}`,
    };

    const created = await idefactory(dir, ['ci', 'scaffold'], forgeEnv);
    assert.equal(created.code, 0, created.err || created.out);
    assert.ok(fs.existsSync(workflowPath(dir)), 'absent consumer workflow must be written');
    const yaml = fs.readFileSync(workflowPath(dir), 'utf8');
    for (const command of REQUIRED_COMMANDS) {
      assert.match(yaml, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    const versions = nodeVersions(yaml);
    assert.ok(versions.length > 0, 'workflow must set node-version');
    for (const version of versions) {
      assert.equal(version, '24', `node-version must be 24, found ${version}`);
    }
    assert.match(yaml, /contents:\s*read/);
    for (const pattern of FORBIDDEN_WORKFLOW) {
      assert.doesNotMatch(yaml, pattern, `workflow must not match ${pattern}`);
    }
    assert.equal(fs.existsSync(path.join(dir, '.github', 'workflows', 'ci.yml')), false);
    assert.equal(fs.existsSync(path.join(dir, '.github', 'workflows', 'release.yml')), false);
    assert.equal(fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').trim() : '', '');
    assert.equal(fs.existsSync(ghLog) ? fs.readFileSync(ghLog, 'utf8').trim() : '', '');

    const written = fs.readFileSync(workflowPath(dir));
    const again = await idefactory(dir, ['ci', 'scaffold'], forgeEnv);
    assert.notEqual(again.code, 0, 'scaffold must exit non-zero when the file exists');
    assert.deepEqual(fs.readFileSync(workflowPath(dir)), written);

    const kept = 'custom-consumer-workflow\n';
    const other = tempProject();
    try {
      const existing = workflowPath(other);
      fs.mkdirSync(path.dirname(existing), { recursive: true });
      fs.writeFileSync(existing, kept);
      const refused = await idefactory(other, ['ci', 'scaffold'], forgeEnv);
      assert.notEqual(refused.code, 0);
      assert.equal(fs.readFileSync(existing, 'utf8'), kept);
    } finally {
      cleanup(other);
    }

    assert.deepEqual(fs.readFileSync(repoCi), ciBefore);
    assert.deepEqual(fs.readFileSync(repoRelease), releaseBefore);
  } finally {
    cleanup(dir);
  }
});
