import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const JS_ENTRY = /\.(cjs|mjs|js)$/i;

/**
 * Build argv for opening a pull request (GitHub `gh` shape).
 * Always starts with `gh`. Tokens are never placed on argv.
 * @param {{ branch: string, title: string, body: string }} input
 * @returns {string[]}
 */
export function buildCreatePullRequestArgv({ branch, title, body }) {
  return [
    'gh',
    'pr',
    'create',
    '--head',
    branch,
    '--title',
    title,
    '--body',
    body,
    '--json',
    'number,url',
  ];
}

/**
 * Build argv for updating an existing pull request body.
 * @param {{ number: number, body: string }} input
 * @returns {string[]}
 */
export function buildUpdatePullRequestArgv({ number, body }) {
  return [
    'gh',
    'pr',
    'edit',
    String(number),
    '--body',
    body,
  ];
}

/**
 * Build argv for posting a comment on an existing pull request.
 * @param {{ number: number, body: string }} input
 * @returns {string[]}
 */
export function buildCommentPullRequestArgv({ number, body }) {
  return [
    'gh',
    'pr',
    'comment',
    String(number),
    '--body',
    body,
  ];
}

/**
 * Resolve how to invoke the forge binary. Tests set IDEFACTORY_FORGE to a stub.
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} fullArgv argv from build* (first element is `gh`)
 * @returns {{ cmd: string, args: string[] }}
 */
export function resolveForgeInvocation(env, fullArgv) {
  if (!Array.isArray(fullArgv) || fullArgv.length === 0 || fullArgv[0] !== 'gh') {
    throw new Error('forge argv must be built by the GitHub argv helpers');
  }
  const rest = fullArgv.slice(1);
  const configured = env?.IDEFACTORY_FORGE;
  if (typeof configured === 'string' && configured.length > 0) {
    const resolved = path.resolve(configured);
    if (JS_ENTRY.test(resolved) && fs.existsSync(resolved)) {
      return { cmd: process.execPath, args: [resolved, ...rest] };
    }
    return { cmd: configured, args: rest };
  }
  return { cmd: 'gh', args: rest };
}

/**
 * Run a forge argv list with the shell disabled. Does not open sockets in tests
 * when IDEFACTORY_FORGE points at the stub.
 * @param {string} project
 * @param {string[]} fullArgv
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ status: number|null, stdout: string, stderr: string }}
 */
export function runForge(project, fullArgv, env) {
  const { cmd, args } = resolveForgeInvocation(env, fullArgv);
  const result = spawnSync(cmd, args, {
    cwd: project,
    env,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}
