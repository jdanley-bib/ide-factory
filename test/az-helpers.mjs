import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './helpers.mjs';

export const fakeAz = path.join(repoRoot, 'support/fake-az.mjs');

export function azEnv(dir, extra = {}) {
  return {
    IDEFACTORY_FORGE: fakeAz,
    IDEFACTORY_BOARD: fakeAz,
    IDEFACTORY_AZ_LOG: path.join(dir, 'az-argv.log'),
    IDEFACTORY_AZ_DB: path.join(dir, 'az-db.json'),
    IDEFACTORY_AZ_ENV_LOG: path.join(dir, 'az-env.log'),
    ADO_TOKEN: '',
    AZURE_DEVOPS_EXT_PAT: '',
    ...extra,
  };
}

export function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

export function azLog(dir) {
  return readJsonLines(path.join(dir, 'az-argv.log'));
}

export function azDb(dir) {
  const file = path.join(dir, 'az-db.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

export function writeAzDb(dir, db) {
  fs.writeFileSync(path.join(dir, 'az-db.json'), JSON.stringify(db, null, 2));
}

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

export function commitAll(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    git(dir, ['init']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'idefactory-test']);
  }
  git(dir, ['add', '-A']);
  if (git(dir, ['status', '--porcelain']).length > 0) git(dir, ['commit', '-m', 'checkpoint']);
  return git(dir, ['rev-parse', 'HEAD']);
}

export function writeChange(dir, change, tasks = '- [ ] 1.1 First task\n- [ ] 1.2 Second task\n') {
  const root = path.join(dir, 'openspec', 'changes', change);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'proposal.md'), [
    '# Proposal',
    '',
    '## Why',
    '',
    'Customers need <faster> checkout & fewer steps.',
    '',
    '## What Changes',
    '',
    '- Add one-click checkout',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'tasks.md'), `# Tasks\n\n${tasks}`);
}
