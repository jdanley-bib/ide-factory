import { spawnSync } from 'node:child_process';
import { assertNoTokenOnArgv, azureChildEnv, resolveToolInvocation } from './azure-cli.mjs';

const FORGE_BINARIES = new Set(['gh', 'az']);

const FORBIDDEN_FORGE_ARGV = [
  { pattern: /\bmerge\b/i, message: 'forge argv must not merge' },
  { pattern: /--auto-complete\b/i, message: 'forge argv must not enable auto-complete' },
  { pattern: /--bypass-policy\b/i, message: 'forge argv must not bypass policy' },
  { pattern: /--status\b/i, message: 'forge argv must not change pull request status' },
  { pattern: /\brulesets\b/i, message: 'forge argv must not call the forge admin API' },
  { pattern: /branches\/.+\/protection/i, message: 'forge argv must not call the forge admin API' },
  { pattern: /api\.github\.com/i, message: 'forge argv must not call the forge admin API' },
  { pattern: /^az repos (policy|ref)\b/i, message: 'forge argv must not call the forge admin API' },
];

/**
 * Refuse argv that could merge, complete, or change protection.
 * @param {string[]} argv full argv including the binary
 */
export function assertSafeForgeArgv(argv) {
  const joined = argv.join(' ');
  for (const { pattern, message } of FORBIDDEN_FORGE_ARGV) {
    if (pattern.test(joined)) throw new Error(message);
  }
}

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
 * Build argv for reading pull request comments. Not an admin API call.
 * @param {{ number: number }} input
 * @returns {string[]}
 */
export function buildListCommentsArgv({ number }) {
  return [
    'gh',
    'pr',
    'view',
    String(number),
    '--json',
    'comments',
  ];
}

/**
 * Build argv for opening an Azure Repos pull request.
 * @param {{ organization: string, project: string, repository: string, branch: string, title: string, body: string }} input
 * @returns {string[]}
 */
export function buildAzureCreatePullRequestArgv({ organization, project, repository, branch, title, body }) {
  return [
    'az', 'repos', 'pr', 'create',
    '--org', organization,
    '--project', project,
    '--repository', repository,
    '--source-branch', branch,
    '--title', title,
    '--description', body,
    '--output', 'json',
  ];
}

/**
 * Build argv for updating an Azure Repos pull request description.
 * @param {{ organization: string, number: number, body: string }} input
 * @returns {string[]}
 */
export function buildAzureUpdatePullRequestArgv({ organization, number, body }) {
  return [
    'az', 'repos', 'pr', 'update',
    '--id', String(number),
    '--org', organization,
    '--description', body,
    '--output', 'json',
  ];
}

/**
 * Build argv for posting (with a body file) or listing Azure Repos pull request threads.
 * @param {{ organization: string, project: string, repository: string, number: number, file?: string }} input
 * @returns {string[]}
 */
export function buildAzureThreadsArgv({ organization, project, repository, number, file }) {
  const argv = [
    'az', 'devops', 'invoke',
    '--org', organization,
    '--area', 'git',
    '--resource', 'pullRequestThreads',
    '--route-parameters',
    `project=${project}`,
    `repositoryId=${repository}`,
    `pullRequestId=${number}`,
    '--http-method', file ? 'POST' : 'GET',
  ];
  if (file) argv.push('--in-file', file);
  argv.push('--api-version', '7.1', '--output', 'json');
  return argv;
}

/**
 * Web URL for an Azure Repos pull request.
 * @param {{ organization: string, project: string, repository: string }} forge
 * @param {number} number
 * @returns {string}
 */
export function azurePullRequestUrl(forge, number) {
  const org = String(forge.organization).replace(/\/+$/, '');
  return `${org}/${encodeURIComponent(forge.project)}/_git/${encodeURIComponent(forge.repository)}/pullrequest/${number}`;
}

/**
 * Resolve how to invoke the forge binary. Tests set IDEFACTORY_FORGE to a stub.
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} fullArgv argv from build* (first element is `gh` or `az`)
 * @returns {{ cmd: string, args: string[] }}
 */
export function resolveForgeInvocation(env, fullArgv) {
  if (!Array.isArray(fullArgv) || fullArgv.length === 0 || !FORGE_BINARIES.has(fullArgv[0])) {
    throw new Error('forge argv must be built by the forge argv helpers');
  }
  return resolveToolInvocation(env?.IDEFACTORY_FORGE, fullArgv[0], fullArgv.slice(1));
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
  assertSafeForgeArgv(fullArgv);
  assertNoTokenOnArgv(fullArgv, env);
  const { cmd, args } = resolveForgeInvocation(env, fullArgv);
  const result = spawnSync(cmd, args, {
    cwd: project,
    env: fullArgv[0] === 'az' ? azureChildEnv(env) : env,
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
