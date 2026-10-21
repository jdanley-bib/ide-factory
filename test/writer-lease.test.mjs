import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  LEASE_HELD,
  acquireWriterLease,
  isMutatingCommand,
  isReadOnlyCommand,
  readWriterLease,
  releaseWriterLease,
  withReadOnlyCommand,
  withWriterLease,
  writerLeaseDir,
} from '../src/lib/writer-lease.mjs';
import { cleanup, tempProject } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const leaseModule = path.join(repoRoot, 'src/lib/writer-lease.mjs');

function seedFactory(dir) {
  fs.mkdirSync(path.join(dir, '.factory', 'orchestration'), { recursive: true });
}

function ownerPath(dir) {
  return path.join(writerLeaseDir(dir), 'owner.json');
}

function raceAcquireOnce(project) {
  const script = `
import { acquireWriterLease } from ${JSON.stringify(leaseModule)};
try {
  const lease = acquireWriterLease(process.argv[1], 'complete');
  process.stdout.write(JSON.stringify({ ok: true, leaseId: lease.leaseId }));
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    code: error.code || null,
    message: error.message || String(error),
  }));
  process.exitCode = 1;
}
`;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, project], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(out);
      } catch {
        parsed = { ok: false, message: out || err, parseFailed: true };
      }
      resolve({ code, ...parsed, stderr: err });
    });
  });
}

test('schema version 1 owner record is written on acquire', () => {
  const dir = tempProject();
  try {
    seedFactory(dir);
    const before = Date.now();
    const lease = acquireWriterLease(dir, 'complete');
    const after = Date.now();
    assert.equal(lease.schemaVersion, 1);
    assert.equal(typeof lease.leaseId, 'string');
    assert.ok(lease.leaseId.length > 0);
    assert.equal(lease.command, 'complete');
    assert.equal(lease.pid, process.pid);
    assert.equal(typeof lease.hostname, 'string');
    assert.ok(lease.hostname.length > 0);
    const acquiredAt = Date.parse(lease.acquiredAt);
    const expiresAt = Date.parse(lease.expiresAt);
    assert.ok(Number.isFinite(acquiredAt));
    assert.ok(Number.isFinite(expiresAt));
    assert.ok(acquiredAt >= before - 1000);
    assert.ok(acquiredAt <= after + 1000);
    assert.equal(expiresAt - acquiredAt, 5 * 60 * 1000);
    const stored = JSON.parse(fs.readFileSync(ownerPath(dir), 'utf8'));
    assert.deepEqual(stored, lease);
  } finally {
    cleanup(dir);
  }
});

test('atomic lease acquisition has exactly one winner', async () => {
  const dir = tempProject();
  try {
    seedFactory(dir);
    const [a, b] = await Promise.all([raceAcquireOnce(dir), raceAcquireOnce(dir)]);
    const wins = [a, b].filter((r) => r.ok);
    const losses = [a, b].filter((r) => !r.ok);
    assert.equal(wins.length, 1, `expected one winner, got ${JSON.stringify([a, b])}`);
    assert.equal(losses.length, 1);
    assert.equal(losses[0].code, LEASE_HELD);
    assert.match(String(losses[0].message), /lease/i);
    const stored = readWriterLease(dir);
    assert.equal(stored.leaseId, wins[0].leaseId);
  } finally {
    cleanup(dir);
  }
});

test('non-expired owner makes a second writer fail clearly without mutation', async () => {
  const dir = tempProject();
  try {
    seedFactory(dir);
    const marker = path.join(dir, 'mutation.txt');
    await withWriterLease(dir, 'complete', async () => {
      let ran = false;
      await assert.rejects(
        () => withWriterLease(dir, 'approve', async () => {
          ran = true;
          fs.writeFileSync(marker, 'mutated\n');
          return 'should-not-return';
        }),
        (error) => {
          assert.equal(error.code, LEASE_HELD);
          assert.match(String(error.message), /lease/i);
          return true;
        },
      );
      assert.equal(ran, false);
      assert.equal(fs.existsSync(marker), false);
      const owner = readWriterLease(dir);
      assert.equal(owner.command, 'complete');
      assert.ok(Date.parse(owner.expiresAt) > Date.now());
    });
  } finally {
    cleanup(dir);
  }
});

test('success releases only the matching lease id', async () => {
  const dir = tempProject();
  try {
    seedFactory(dir);
    await withWriterLease(dir, 'complete', async () => 'ok');
    assert.equal(fs.existsSync(writerLeaseDir(dir)), false);

    const first = acquireWriterLease(dir, 'complete');
    const successor = {
      ...first,
      leaseId: 'successor-lease-id',
      command: 'approve',
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
    fs.writeFileSync(ownerPath(dir), `${JSON.stringify(successor, null, 2)}\n`);
    releaseWriterLease(dir, first.leaseId);
    assert.equal(fs.existsSync(writerLeaseDir(dir)), true);
    assert.deepEqual(readWriterLease(dir), successor);
    releaseWriterLease(dir, successor.leaseId);
    assert.equal(fs.existsSync(writerLeaseDir(dir)), false);
  } finally {
    cleanup(dir);
  }
});

test('handled errors release only the matching lease id', async () => {
  const dir = tempProject();
  try {
    seedFactory(dir);
    await assert.rejects(
      () => withWriterLease(dir, 'complete', async () => {
        throw new Error('handled boom');
      }),
      /handled boom/,
    );
    assert.equal(fs.existsSync(writerLeaseDir(dir)), false);

    const first = acquireWriterLease(dir, 'next');
    const successor = {
      ...first,
      leaseId: 'error-successor-id',
      command: 'run',
    };
    fs.writeFileSync(ownerPath(dir), `${JSON.stringify(successor, null, 2)}\n`);
    // Simulate an owner that still holds a stale handle after succession.
    releaseWriterLease(dir, first.leaseId);
    assert.equal(fs.existsSync(writerLeaseDir(dir)), true);
    assert.equal(readWriterLease(dir).leaseId, 'error-successor-id');
  } finally {
    cleanup(dir);
  }
});

test('read-only commands neither acquire nor remove a lease', async () => {
  const dir = tempProject();
  try {
    seedFactory(dir);
    assert.equal(isReadOnlyCommand('status'), true);
    assert.equal(isReadOnlyCommand('doctor'), true);
    assert.equal(isReadOnlyCommand('help'), true);
    assert.equal(isReadOnlyCommand('attempt show'), true);
    assert.equal(isMutatingCommand('status'), false);
    assert.equal(isMutatingCommand('complete'), true);
    assert.equal(isMutatingCommand('attempt start'), true);

    await withReadOnlyCommand(dir, 'status', async () => {
      assert.equal(fs.existsSync(writerLeaseDir(dir)), false);
      return 'status-ok';
    });
    assert.equal(fs.existsSync(writerLeaseDir(dir)), false);

    const lease = acquireWriterLease(dir, 'complete');
    const before = readWriterLease(dir);
    const result = await withReadOnlyCommand(dir, 'doctor', async () => 'doctor-ok');
    assert.equal(result, 'doctor-ok');
    assert.deepEqual(readWriterLease(dir), before);
    assert.equal(fs.existsSync(writerLeaseDir(dir)), true);
    assert.equal(readWriterLease(dir).leaseId, lease.leaseId);

    await withReadOnlyCommand(dir, 'attempt show', async () => 'show-ok');
    assert.deepEqual(readWriterLease(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('hostname is recorded from the local machine', () => {
  const dir = tempProject();
  try {
    seedFactory(dir);
    const lease = acquireWriterLease(dir, 'init');
    assert.equal(lease.hostname, os.hostname());
  } finally {
    cleanup(dir);
  }
});
