import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const JS_ENTRY = /\.(cjs|mjs|js)$/i;

/**
 * Child environment for the Azure CLI. ADO_TOKEN reaches the Azure DevOps
 * extension as AZURE_DEVOPS_EXT_PAT, never on argv.
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function azureChildEnv(env = {}) {
  const child = { ...env };
  if (env.ADO_TOKEN && !env.AZURE_DEVOPS_EXT_PAT) child.AZURE_DEVOPS_EXT_PAT = env.ADO_TOKEN;
  return child;
}

/**
 * Resolve a tool binary. A configured override (tests point it at a stub)
 * replaces the binary; a JS stub runs through the current Node.
 * @param {string|undefined} configured
 * @param {string} defaultCmd
 * @param {string[]} rest argv after the binary name
 * @returns {{ cmd: string, args: string[] }}
 */
export function resolveToolInvocation(configured, defaultCmd, rest) {
  if (typeof configured === 'string' && configured.length > 0) {
    const resolved = path.resolve(configured);
    if (JS_ENTRY.test(resolved) && fs.existsSync(resolved)) {
      return { cmd: process.execPath, args: [resolved, ...rest] };
    }
    return { cmd: configured, args: rest };
  }
  return { cmd: defaultCmd, args: rest };
}

/**
 * Throw when a token value from the environment appears on argv.
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} env
 */
export function assertNoTokenOnArgv(argv, env = {}) {
  for (const key of ['ADO_TOKEN', 'AZURE_DEVOPS_EXT_PAT', 'GH_TOKEN']) {
    const value = env[key];
    if (typeof value === 'string' && value.length >= 4 && argv.some((arg) => String(arg).includes(value))) {
      throw new Error(`${key} must not appear on argv`);
    }
  }
}

/**
 * Run the Azure CLI with the shell disabled and return parsed JSON stdout.
 * @param {string} project
 * @param {string[]} args argv after `az`
 * @param {NodeJS.ProcessEnv} env
 * @param {string|undefined} override binary override
 * @returns {any}
 */
export function runAzJson(project, args, env, override) {
  assertNoTokenOnArgv(args, env);
  const { cmd, args: argv } = resolveToolInvocation(override, 'az', args);
  const result = spawnSync(cmd, argv, {
    cwd: project,
    env: azureChildEnv(env),
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || '').trim() || (result.stdout || '').trim() || `az exited ${result.status}`);
  }
  const stdout = (result.stdout || '').trim();
  if (!stdout) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`az ${args.slice(0, 3).join(' ')} returned invalid JSON`);
  }
}
