import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { idefactory } from './helpers.mjs';

export function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'idefactory-test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'idefactory-test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

/** Init git if needed and commit the whole worktree so HEAD is clean. */
export function commitAll(dir, message = 'checkpoint') {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    git(dir, ['init']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'idefactory-test']);
  }
  git(dir, ['add', '-A']);
  if (git(dir, ['status', '--porcelain']).length > 0) git(dir, ['commit', '-m', message]);
  return git(dir, ['rev-parse', 'HEAD']);
}

export function writeJson(dir, rel, value) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson(dir, rel) {
  return JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
}

/** Registry with a unit check running a Node one-liner. */
export function nodeCheck(script, extra = {}) {
  return {
    argv: [process.execPath, '-e', script],
    cwdPolicy: 'project',
    timeoutMs: 30_000,
    artifacts: [],
    ...extra,
  };
}

/**
 * Initialize a factory project with one OpenSpec change and synced work items.
 * `tasks` is the raw tasks.md text.
 */
export async function seedChange(dir, { change = 'demo', tasks, checks } = {}) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  if (checks) writeJson(dir, '.factory/checks.json', { schemaVersion: 1, checks });
  fs.mkdirSync(path.join(dir, 'openspec/changes', change), { recursive: true });
  fs.writeFileSync(path.join(dir, 'openspec/changes', change, 'tasks.md'), tasks);
  const synced = await idefactory(dir, ['sync-tasks', change]);
  assert.equal(synced.code, 0, synced.err + synced.out);
  return change;
}

export const BASIC_TASK = [
  '- [ ] 1.1 Add parser',
  '  factory:',
  '    kind: general',
  '    checks: [unit]',
  '    verificationProfile: frontend-low',
  '    roles: [engineer, reviewer, scribe]',
  '',
].join('\n');
