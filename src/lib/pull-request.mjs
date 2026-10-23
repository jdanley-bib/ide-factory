import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildCreatePullRequestArgv,
  buildUpdatePullRequestArgv,
  runForge,
} from './forge.mjs';
import { halted, writeText } from './layout.mjs';

const CHANGE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Open or update the single pull request for an OpenSpec change.
 * @param {string} project
 * @param {string} change
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ record: object, created: boolean }}
 */
export function openPullRequest(project, change, env = process.env) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const name = String(change || '').trim();
  if (!CHANGE_NAME.test(name)) {
    throw new Error('Usage: idefactory pr open <change>');
  }

  const branch = `factory/${name}`;
  const recordPath = pullRequestRecordPath(project, name);
  const existing = readPullRequestRecord(project, name);
  const body = buildPullRequestBody(name);
  const bodyDigest = digestBody(body);

  if (!existing) {
    ensureBranch(project, branch);
    const argv = buildCreatePullRequestArgv({
      branch,
      title: name,
      body,
    });
    assertSafeForgeArgv(argv);
    const result = runForge(project, argv, env);
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || `forge exited ${result.status}`);
    }
    let created;
    try {
      created = JSON.parse(result.stdout);
    } catch {
      throw new Error('forge create returned invalid JSON');
    }
    const number = Number(created?.number);
    if (!Number.isInteger(number) || number <= 0) {
      throw new Error('forge create did not return a pull request number');
    }
    const record = {
      change: name,
      branch,
      pullRequest: {
        number,
        url: typeof created.url === 'string' ? created.url : '',
      },
      bodyDigest,
      postedVerdicts: [],
      capturedComments: [],
    };
    writePullRequestRecord(project, record);
    return { record, created: true };
  }

  const argv = buildUpdatePullRequestArgv({
    number: existing.pullRequest.number,
    body,
  });
  assertSafeForgeArgv(argv);
  const result = runForge(project, argv, env);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `forge exited ${result.status}`);
  }
  const record = {
    ...existing,
    change: name,
    branch: existing.branch || branch,
    bodyDigest,
    postedVerdicts: Array.isArray(existing.postedVerdicts) ? existing.postedVerdicts : [],
    capturedComments: Array.isArray(existing.capturedComments) ? existing.capturedComments : [],
  };
  writePullRequestRecord(project, record);
  return { record, created: false };
}

/**
 * @param {string} project
 * @param {string} change
 * @returns {string}
 */
export function pullRequestRecordPath(project, change) {
  return path.join(project, '.factory', 'pull-requests', `${change}.json`);
}

/**
 * @param {string} project
 * @param {string} change
 * @returns {object|null}
 */
export function readPullRequestRecord(project, change) {
  const file = pullRequestRecordPath(project, change);
  if (!fs.existsSync(file)) return null;
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!record || record.change !== change) return null;
    if (!record.pullRequest || !Number.isInteger(record.pullRequest.number)) return null;
    return record;
  } catch {
    return null;
  }
}

function writePullRequestRecord(project, record) {
  writeText(pullRequestRecordPath(project, record.change), `${JSON.stringify(record, null, 2)}\n`);
}

function buildPullRequestBody(change) {
  return [
    `# ${change}`,
    '',
    'Factory pull request for this OpenSpec change.',
    '',
    `Change: ${change}`,
    'Evidence: see `.factory/` in this branch.',
  ].join('\n');
}

function digestBody(body) {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

function ensureBranch(project, branch) {
  const existing = spawnSync('git', ['rev-parse', '--verify', branch], {
    cwd: project,
    encoding: 'utf8',
    shell: false,
  });
  if (existing.status === 0) return;
  const created = spawnSync('git', ['branch', branch, 'HEAD'], {
    cwd: project,
    encoding: 'utf8',
    shell: false,
  });
  if (created.status !== 0) {
    throw new Error(created.stderr.trim() || `failed to create branch ${branch}`);
  }
}

function assertSafeForgeArgv(argv) {
  const joined = argv.join(' ');
  if (/\bmerge\b/i.test(joined)) {
    throw new Error('forge argv must not merge');
  }
  if (/\brulesets\b/i.test(joined) || /branches\/.+\/protection/i.test(joined)
    || /api\.github\.com/i.test(joined)) {
    throw new Error('forge argv must not call the forge admin API');
  }
}
