import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'verify-local-principal.mjs',
);

function run(provider, subject) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      FACTORY_PRINCIPAL_PROVIDER: provider,
      FACTORY_PRINCIPAL_SUBJECT: subject,
    },
  });
}

test('local verifier confirms only jason-danley on provider local', () => {
  const ok = run('local', 'jason-danley');
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout), {
    provider: 'local',
    subject: 'jason-danley',
    issuer: 'ide-factory-local',
  });

  const denied = [
    ['local', 'ada'],
    ['github', 'jason-danley'],
    ['local', 'Jason-Danley'],
    ['local', ''],
    ['', 'jason-danley'],
  ];
  for (const [provider, subject] of denied) {
    const result = run(provider, subject);
    assert.notEqual(result.status, 0, `${provider}/${subject} must be rejected`);
    assert.equal(result.stdout, '', `${provider}/${subject} must not echo a subject`);
  }
});
