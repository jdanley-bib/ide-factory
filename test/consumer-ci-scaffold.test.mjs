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

function assertConsumerWorkflow(yaml) {
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
}

test('init names the consumer workflow only when it creates that file', async () => {
  const namedPath = '.github/workflows/factory-consumer.yml';

  // Fresh init creates the workflow and the Created line names that path.
  const fresh = tempProject();
  try {
    const first = await idefactory(fresh, ['init']);
    assert.equal(first.code, 0, first.err || first.out);
    assert.ok(fs.existsSync(workflowPath(fresh)), 'init must create the consumer workflow');
    assert.match(
      first.out,
      /\.github\/workflows\/factory-consumer\.yml/,
      `fresh init output must name ${namedPath}; got: ${first.out}`,
    );

    // After the file is deleted and factory state remains, re-init recreates it and names it.
    fs.unlinkSync(workflowPath(fresh));
    assert.equal(fs.existsSync(workflowPath(fresh)), false);
    const again = await idefactory(fresh, ['init']);
    assert.equal(again.code, 0, again.err || again.out);
    assert.ok(fs.existsSync(workflowPath(fresh)), 're-init must recreate the missing workflow');
    assert.match(
      again.out,
      /\.github\/workflows\/factory-consumer\.yml/,
      `re-init output must name ${namedPath}; got: ${again.out}`,
    );
  } finally {
    cleanup(fresh);
  }

  // Existing custom workflow: exit 0, bytes unchanged, output does not name the path.
  const custom = 'custom-consumer-workflow-bytes\n# keep me\n';
  const existingDir = tempProject();
  try {
    const existing = workflowPath(existingDir);
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, custom);
    const result = await idefactory(existingDir, ['init']);
    assert.equal(result.code, 0, result.err || result.out);
    assert.equal(fs.readFileSync(existing, 'utf8'), custom);
    assert.doesNotMatch(
      result.out,
      /factory-consumer\.yml/,
      `existing workflow must not be named in output; got: ${result.out}`,
    );
  } finally {
    cleanup(existingDir);
  }
});

test('init keeps custom workflow bytes; upgrade and scaffold refuse overwrite', async () => {
  const custom = 'custom-consumer-workflow-bytes\n# keep me\n';

  // Init leaves an existing custom workflow byte-for-byte unchanged and exits 0.
  const initDir = tempProject();
  try {
    const existing = workflowPath(initDir);
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, custom);
    const initResult = await idefactory(initDir, ['init']);
    assert.equal(initResult.code, 0, initResult.err || initResult.out);
    assert.equal(fs.readFileSync(existing, 'utf8'), custom);
  } finally {
    cleanup(initDir);
  }

  // Init with HALT present and an existing workflow still exits 0 and keeps bytes
  // (init uses writeConsumerWorkflowIfAbsent, not the throwing scaffoldConsumerCi).
  const haltDir = tempProject();
  try {
    const existing = workflowPath(haltDir);
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, custom);
    fs.writeFileSync(path.join(haltDir, 'HALT'), 'stop\n');
    const haltInit = await idefactory(haltDir, ['init']);
    assert.equal(haltInit.code, 0, haltInit.err || haltInit.out);
    assert.equal(fs.readFileSync(existing, 'utf8'), custom);
  } finally {
    cleanup(haltDir);
  }

  // Upgrade does not create a missing workflow.
  const upgradeDir = tempProject();
  try {
    fs.mkdirSync(path.join(upgradeDir, '.factory'), { recursive: true });
    fs.writeFileSync(path.join(upgradeDir, '.factory', 'team.md'), '# team\n');
    assert.equal((await idefactory(upgradeDir, ['upgrade'])).code, 0);
    assert.equal(
      fs.existsSync(workflowPath(upgradeDir)),
      false,
      'upgrade must not create the consumer workflow',
    );
  } finally {
    cleanup(upgradeDir);
  }

  // ci scaffold still exits non-zero and leaves existing bytes unchanged.
  const scaffoldDir = tempProject();
  const logPath = path.join(scaffoldDir, 'forge-argv.log');
  const ghLog = path.join(scaffoldDir, 'gh-calls.log');
  try {
    const existing = workflowPath(scaffoldDir);
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, custom);
    const bin = path.join(scaffoldDir, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, 'gh'),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$IDEFACTORY_GH_LOG"\nexit 1\n',
    );
    fs.chmodSync(path.join(bin, 'gh'), 0o755);
    const refused = await idefactory(scaffoldDir, ['ci', 'scaffold'], {
      IDEFACTORY_FORGE: fakeForge,
      IDEFACTORY_FORGE_LOG: logPath,
      IDEFACTORY_GH_LOG: ghLog,
      PATH: `${bin}:${process.env.PATH || ''}`,
    });
    assert.notEqual(refused.code, 0, 'scaffold must exit non-zero when the file exists');
    assert.equal(fs.readFileSync(existing, 'utf8'), custom);
    assert.equal(fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').trim() : '', '');
    assert.equal(fs.existsSync(ghLog) ? fs.readFileSync(ghLog, 'utf8').trim() : '', '');
  } finally {
    cleanup(scaffoldDir);
  }
});

test('init writes the consumer workflow once; scaffold and upgrade stay write-once', async () => {
  const dir = tempProject();
  const logPath = path.join(dir, 'forge-argv.log');
  const ghLog = path.join(dir, 'gh-calls.log');
  const ciBefore = fs.readFileSync(repoCi);
  const releaseBefore = fs.readFileSync(repoRelease);
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    assert.ok(fs.existsSync(workflowPath(dir)), 'init must create the consumer workflow');
    const initYaml = fs.readFileSync(workflowPath(dir), 'utf8');
    assertConsumerWorkflow(initYaml);
    assert.equal(fs.existsSync(path.join(dir, '.github', 'workflows', 'ci.yml')), false);
    assert.equal(fs.existsSync(path.join(dir, '.github', 'workflows', 'release.yml')), false);

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

    // After init created the file, scaffold on that directory must exit non-zero.
    const written = fs.readFileSync(workflowPath(dir));
    const again = await idefactory(dir, ['ci', 'scaffold'], forgeEnv);
    assert.notEqual(again.code, 0, 'scaffold must exit non-zero when the file exists');
    assert.deepEqual(fs.readFileSync(workflowPath(dir)), written);

    // Upgrade must not create a missing workflow (use a dir that was not just initialized).
    const upgradeDir = tempProject();
    try {
      fs.mkdirSync(path.join(upgradeDir, '.factory'), { recursive: true });
      fs.writeFileSync(path.join(upgradeDir, '.factory', 'team.md'), '# team\n');
      assert.equal((await idefactory(upgradeDir, ['upgrade'])).code, 0);
      assert.equal(
        fs.existsSync(workflowPath(upgradeDir)),
        false,
        'upgrade must not create the consumer workflow',
      );
    } finally {
      cleanup(upgradeDir);
    }

    // Scaffold still writes when absent — use a directory that was not just initialized.
    const scaffoldDir = tempProject();
    const scaffoldLog = path.join(scaffoldDir, 'forge-argv.log');
    const scaffoldGhLog = path.join(scaffoldDir, 'gh-calls.log');
    try {
      const scaffoldEnv = {
        ...forgeEnv,
        IDEFACTORY_FORGE_LOG: scaffoldLog,
        IDEFACTORY_GH_LOG: scaffoldGhLog,
      };
      const created = await idefactory(scaffoldDir, ['ci', 'scaffold'], scaffoldEnv);
      assert.equal(created.code, 0, created.err || created.out);
      assert.ok(fs.existsSync(workflowPath(scaffoldDir)), 'absent consumer workflow must be written');
      assertConsumerWorkflow(fs.readFileSync(workflowPath(scaffoldDir), 'utf8'));
      assert.equal(fs.existsSync(path.join(scaffoldDir, '.github', 'workflows', 'ci.yml')), false);
      assert.equal(fs.existsSync(path.join(scaffoldDir, '.github', 'workflows', 'release.yml')), false);
      assert.equal(fs.existsSync(scaffoldLog) ? fs.readFileSync(scaffoldLog, 'utf8').trim() : '', '');
      assert.equal(
        fs.existsSync(scaffoldGhLog) ? fs.readFileSync(scaffoldGhLog, 'utf8').trim() : '',
        '',
      );

      const scaffoldWritten = fs.readFileSync(workflowPath(scaffoldDir));
      const scaffoldAgain = await idefactory(scaffoldDir, ['ci', 'scaffold'], scaffoldEnv);
      assert.notEqual(scaffoldAgain.code, 0, 'scaffold must exit non-zero when the file exists');
      assert.deepEqual(fs.readFileSync(workflowPath(scaffoldDir)), scaffoldWritten);
    } finally {
      cleanup(scaffoldDir);
    }

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

    assert.equal(fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').trim() : '', '');
    assert.equal(fs.existsSync(ghLog) ? fs.readFileSync(ghLog, 'utf8').trim() : '', '');
    assert.deepEqual(fs.readFileSync(repoCi), ciBefore);
    assert.deepEqual(fs.readFileSync(repoRelease), releaseBefore);
  } finally {
    cleanup(dir);
  }
});
