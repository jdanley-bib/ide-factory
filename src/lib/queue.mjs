import fs from 'node:fs';
import path from 'node:path';
import { createTask, listTasks, viewTask } from './backlog.mjs';
import { halted, ledger, writeText } from './layout.mjs';

export function parseCheckboxes(markdown) {
  const tasks = [];
  const pattern = /^- \[([^\]]*)\]\s+(\d+(?:\.\d+)+)\s+(.+)$/gm;
  let match = pattern.exec(markdown);
  while (match) {
    const mark = match[1].trim().toLowerCase();
    tasks.push({
      done: mark === 'x',
      id: match[2],
      title: match[3].trim(),
    });
    match = pattern.exec(markdown);
  }
  return tasks;
}

export function loadChangeTasks(project, change) {
  assertChangeName(change);
  const file = path.join(project, 'openspec', 'changes', change, 'tasks.md');
  if (!fs.existsSync(file)) {
    throw new Error(`OpenSpec change not found: openspec/changes/${change}/tasks.md`);
  }
  return parseCheckboxes(fs.readFileSync(file, 'utf8'));
}

export function syncTasks(project, change, env) {
  if (halted(project)) throw haltError();
  const tasks = loadChangeTasks(project, change);
  const existing = listTasks(project, env);
  let created = 0;
  let skipped = 0;
  for (const task of tasks) {
    if (task.done) {
      skipped += 1;
      continue;
    }
    if (alreadySynced(existing, change, task.id)) {
      skipped += 1;
      continue;
    }
    createTask(project, env, { change, id: task.id, title: task.title });
    created += 1;
  }
  writeText(
    path.join(project, '.factory', 'active-change.json'),
    JSON.stringify({ change, updatedAt: new Date().toISOString() }, null, 2),
  );
  ledger(project, 'sync-tasks', { change, created, skipped });
  return { created, skipped, change };
}

export function buildPacket(project, env, changeName) {
  if (halted(project)) throw haltError();
  const change = changeName || readActiveChange(project);
  let tasks = listTasks(project, env).filter((task) => isTodo(task));
  if (change) {
    const scoped = tasks.filter((task) => (task.labels || []).includes(change));
    if (scoped.length) tasks = scoped;
  }
  const ready = tasks.find((task) => task.isReady !== false) || tasks[0];
  if (!ready) {
    return { empty: true, text: 'No To Do backlog task.\n' };
  }
  const task = ready.description ? ready : { ...ready, ...viewTask(project, ready.id, env) };
  const role = routeRole(`${task.title}\n${task.description || ''}`);
  const text = renderPacket({ role, task, change });
  ledger(project, 'next', { role, task: task.id });
  return { empty: false, text, role, task };
}

function renderPacket({ role, task, change }) {
  const criteria = (task.acceptanceCriteria || [])
    .map((item) => `- ${item.text || item}`)
    .join('\n');
  return `# Work packet

Role: ${role}
Implementing agent: ${role}
Charter: .factory/agents/${role}/charter.md
History: .factory/agents/${role}/history.md

Read that charter and that history only. Do not read any other agent's charter.

Task: ${task.id}
Title: ${task.title}
Status: ${task.status}
Change: ${change || '(none selected)'}

Description:
${task.description || '(no description)'}

Acceptance criteria:
${criteria || '- (see the task)'}

Method:
- Write a failing test before production code.
- Run a verification command before claiming done.
- Review is a different role: reviewer. The implementer does not approve their own work.

The IDE session model does the work. Do not start a model process.
`;
}

function routeRole(text) {
  if (/\b(architect|production architecture|production-architecture)\b/i.test(text)) return 'architect';
  return 'engineer';
}

function alreadySynced(tasks, change, id) {
  return tasks.some((task) => {
    const labels = task.labels || [];
    if (!labels.includes(change)) return false;
    const title = String(task.title || '');
    const description = String(task.description || '');
    return title.startsWith(`[${id}]`) || description.includes(`openspec-task: ${id}`);
  });
}

function isTodo(task) {
  return String(task.status || '').toLowerCase() === 'to do' && !task.archived;
}

function readActiveChange(project) {
  const file = path.join(project, '.factory', 'active-change.json');
  if (!fs.existsSync(file)) return '';
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).change || '';
  } catch {
    return '';
  }
}

function assertChangeName(change) {
  if (!change || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(change)) {
    throw new Error('Usage: idefactory sync-tasks <change-name>');
  }
}

function haltError() {
  const error = new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  error.code = 'HALT';
  return error;
}

export { haltError };
