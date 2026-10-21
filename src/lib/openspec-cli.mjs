import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { findBinary } from './backlog.mjs';
import { packageRoot } from './layout.mjs';

const JS_ENTRY = /\.(cjs|mjs|js)$/i;

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Map an npm shim, .cmd launcher, or explicit path to @fission-ai/openspec's JS bin. */
export function resolveOpenspecEntry(binPath) {
  if (!binPath) return null;
  const resolved = path.resolve(binPath);
  if (JS_ENTRY.test(resolved) && fs.existsSync(resolved)) return resolved;

  const dir = path.dirname(resolved);
  return firstExisting([
    path.resolve(dir, '..', '@fission-ai', 'openspec', 'bin', 'openspec.js'),
    path.resolve(dir, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js'),
    // Global npm shims sometimes live next to the real package under lib/node_modules.
    path.resolve(dir, '..', 'lib', 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js'),
    path.resolve(dir, '..', 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js'),
  ]);
}

export function openspecEntry(project, env = process.env) {
  if (env.IDEFACTORY_OPENSPEC) {
    const fromConfigured = resolveOpenspecEntry(env.IDEFACTORY_OPENSPEC);
    if (fromConfigured) return fromConfigured;
    if (JS_ENTRY.test(env.IDEFACTORY_OPENSPEC) && fs.existsSync(env.IDEFACTORY_OPENSPEC)) {
      return path.resolve(env.IDEFACTORY_OPENSPEC);
    }
  }

  const localCli = firstExisting([
    path.join(project, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js'),
    path.join(packageRoot, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js'),
  ]);
  if (localCli) return localCli;

  const bin = findBinary('openspec', project, env);
  return resolveOpenspecEntry(bin);
}

export function runOpenspec(project, args, env = process.env) {
  const entry = openspecEntry(project, env);
  if (!entry) {
    const error = new Error('openspec CLI not found. Install @fission-ai/openspec, then re-run with --with-openspec.');
    error.code = 'NO_OPENSPEC';
    throw error;
  }
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: project,
    env: { ...env, OPENSPEC_TELEMETRY: '0' },
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr || ''}${result.stdout || ''}`.trim();
    throw new Error(detail || `openspec exited ${result.status}`);
  }
  return result;
}
