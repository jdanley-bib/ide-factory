import fs, { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/lib/run.mjs';
import { resolveRequirements } from '../src/lib/required-checks.mjs';
import { listWorkItems } from '../src/lib/work.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, '..');
export const fakeBacklog = path.join(repoRoot, 'support/fake-backlog.mjs');

export function tempProject() {
  return mkdtempSync(path.join(tmpdir(), 'idefactory-'));
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Map every required check kind that the registry lacks, so fixtures that only exercise the
 * attempt lifecycle are not refused by the requirement preflight. Existing entries are kept.
 */
export function mapMissingCheckKinds(dir, change) {
  const missing = new Set();
  for (const item of listWorkItems(dir, change)) {
    for (const problem of resolveRequirements(dir, item).problems) {
      if (problem.id.startsWith('unmapped-kind:')) missing.add(problem.id.slice('unmapped-kind:'.length));
    }
  }
  if (missing.size === 0) return;
  const file = path.join(dir, '.factory', 'checks.json');
  let registry = { schemaVersion: 1, checks: {} };
  if (fs.existsSync(file)) {
    try {
      registry = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return;
    }
  }
  registry.checks = registry.checks && typeof registry.checks === 'object' ? registry.checks : {};
  for (const kind of missing) {
    registry.checks[kind] = {
      argv: [process.execPath, '-e', 'process.exit(0)'],
      cwdPolicy: 'project',
      timeoutMs: 30_000,
      artifacts: [],
    };
  }
  fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`);
}

export async function idefactory(dir, args, extraEnv = {}, io = {}) {
  let out = '';
  let err = '';
  const code = await run([...args, '--path', dir], {
    cwd: dir,
    env: { ...process.env, ...extraEnv },
    isTTY: io.isTTY ?? false,
    stdout: { write(chunk) { out += chunk; return true; } },
    stderr: { write(chunk) { err += chunk; return true; } },
  });
  if (code === 0 && args[0] === 'sync-tasks' && args[1] && !io.rawRegistry) mapMissingCheckKinds(dir, args[1]);
  return { code, out, err };
}
