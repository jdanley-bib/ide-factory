import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { packageRoot } from './layout.mjs';

const JS_ENTRY = /\.(cjs|mjs|js)$/i;

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Map an npm shim, .cmd launcher, or explicit path to the JS entry backlog.md exposes. */
export function resolveBacklogEntry(binPath) {
  if (!binPath) return null;
  const resolved = path.resolve(binPath);
  if (JS_ENTRY.test(resolved) && fs.existsSync(resolved)) return resolved;

  const dir = path.dirname(resolved);
  return firstExisting([
    path.resolve(dir, '..', 'backlog.md', 'cli.js'),
    path.resolve(dir, 'node_modules', 'backlog.md', 'cli.js'),
  ]);
}

function findOnPath(name, env) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const found = spawnSync(cmd, [name], { encoding: 'utf8', env, shell: false });
  if (found.status !== 0) return null;
  const line = found.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return line || null;
}

export function findBinary(name, project, env) {
  const candidates = [
    path.join(project, 'node_modules', '.bin', name),
    path.join(packageRoot, 'node_modules', '.bin', name),
  ];
  if (process.platform === 'win32') {
    candidates.push(
      path.join(project, 'node_modules', '.bin', `${name}.cmd`),
      path.join(packageRoot, 'node_modules', '.bin', `${name}.cmd`),
    );
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return findOnPath(name, env);
}

export function backlogBinary(project, env) {
  if (env.IDEFACTORY_BACKLOG) return env.IDEFACTORY_BACKLOG;
  return findBinary('backlog', project, env);
}

export function backlogEntry(project, env) {
  const configured = env.IDEFACTORY_BACKLOG;
  if (configured) {
    const fromConfigured = resolveBacklogEntry(configured);
    if (fromConfigured) return fromConfigured;
  }

  const localCli = firstExisting([
    path.join(project, 'node_modules', 'backlog.md', 'cli.js'),
    path.join(packageRoot, 'node_modules', 'backlog.md', 'cli.js'),
  ]);
  if (localCli) return localCli;

  const bin = backlogBinary(project, env);
  return resolveBacklogEntry(bin);
}

export function runBacklog(project, args, env) {
  const entry = backlogEntry(project, env);
  if (!entry) {
    const error = new Error('Backlog.md CLI not found. Install backlog.md, or set IDEFACTORY_BACKLOG to the binary.');
    error.code = 'NO_BACKLOG';
    throw error;
  }
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: project, env, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr || ''}${result.stdout || ''}`.trim();
    throw new Error(detail || `backlog exited ${result.status}`);
  }
  return result;
}

export function listTasks(project, env) {
  const result = runBacklog(project, ['task', 'list', '--json'], env);
  const parsed = JSON.parse(result.stdout);
  return parsed.tasks || [];
}

export function viewTask(project, id, env) {
  const result = runBacklog(project, ['task', 'view', id, '--json'], env);
  const parsed = JSON.parse(result.stdout);
  return parsed.task || parsed;
}

/** Backlog.md derives the task filename from the title; keep it short for Windows MAX_PATH. */
export function backlogTaskTitle(id, title) {
  const cleaned = String(title || '')
    .replace(/[`'"\\/:*?<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const maxBody = 72;
  const body = cleaned.length > maxBody ? `${cleaned.slice(0, maxBody - 1)}…` : cleaned;
  return body ? `[${id}] ${body}` : `[${id}]`;
}

export function createTask(project, env, { change, id, title }) {
  runBacklog(project, [
    'task', 'create', backlogTaskTitle(id, title),
    '-d', `openspec-task: ${id}\n\nChange: openspec/changes/${change}/tasks.md\n\n${title}`,
    '-l', `${change},factory`,
    '--ac', `Checkbox ${id} is implemented and checked in openspec/changes/${change}/tasks.md.`,
    '--plain',
    '-a', '',
  ], env);
}
