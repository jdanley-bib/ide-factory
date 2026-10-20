import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { packageRoot } from './layout.mjs';

export function findBinary(name, project, env) {
  const candidates = [
    path.join(project, 'node_modules', '.bin', name),
    path.join(packageRoot, 'node_modules', '.bin', name),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const found = spawnSync('which', [name], { encoding: 'utf8', env });
  if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  return null;
}

export function backlogBinary(project, env) {
  if (env.IDEFACTORY_BACKLOG) return env.IDEFACTORY_BACKLOG;
  return findBinary('backlog', project, env);
}

export function runBacklog(project, args, env) {
  const bin = backlogBinary(project, env);
  if (!bin) {
    const error = new Error('Backlog.md CLI not found. Install backlog.md, or set IDEFACTORY_BACKLOG to the binary.');
    error.code = 'NO_BACKLOG';
    throw error;
  }
  const result = spawnSync(bin, args, { cwd: project, env, encoding: 'utf8' });
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

export function createTask(project, env, { change, id, title }) {
  runBacklog(project, [
    'task', 'create', `[${id}] ${title}`,
    '-d', `openspec-task: ${id}\n\nChange: openspec/changes/${change}/tasks.md\n\n${title}`,
    '-l', `${change},factory`,
    '--ac', `Checkbox ${id} is implemented and checked in openspec/changes/${change}/tasks.md.`,
    '--plain',
    '-a', '',
  ], env);
}
