import fs from 'node:fs';
import path from 'node:path';
import { classifyTask, defaultAcceptanceCriteria, parseFactoryBlock } from './classify.mjs';
import { halted, ledger, readText, writeText } from './layout.mjs';
import {
  ensureWorkDirs,
  getWorkItem,
  listWorkItems,
  selectReady,
  upsertWorkItem,
} from './work.mjs';

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
  const markdown = fs.readFileSync(file, 'utf8');
  return parseCheckboxes(markdown).map((task) => {
    const { factory, acceptanceCriteria } = parseFactoryBlock(markdown, task.id);
    return { ...task, factory, acceptanceCriteria, markdown };
  });
}

export function syncTasks(project, change, _env) {
  if (halted(project)) throw haltError();
  ensureWorkDirs(project);
  const tasks = loadChangeTasks(project, change);
  let created = 0;
  let skipped = 0;
  for (const task of tasks) {
    if (task.done) {
      skipped += 1;
      continue;
    }
    if (getWorkItem(project, change, task.id)) {
      skipped += 1;
      continue;
    }
    const classified = classifyTask({
      id: task.id,
      title: task.title,
      body: task.title,
      factory: task.factory,
    });
    upsertWorkItem(project, {
      id: task.id,
      change,
      title: task.title,
      status: 'todo',
      dependencies: classified.dependencies,
      acceptanceCriteria: defaultAcceptanceCriteria(task.title, task.acceptanceCriteria),
      factory: classified,
      attemptId: null,
    });
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
  const item = change
    ? selectReady(project, change) || listWorkItems(project, change).find((entry) => entry.status === 'todo')
    : selectAcrossChanges(project);
  if (!item) {
    return { empty: true, text: 'No ready To Do work item.\n' };
  }
  const config = readConfig(project);
  const role = primaryRole(item);
  const modelProfile = item.factory?.modelProfile || config.roles?.[role]?.modelProfile || 'coding-standard';
  const text = renderPacket({ role, item, modelProfile });
  ledger(project, 'next', { role, change: item.change, task: item.id });
  return { empty: false, text, role, task: item, item };
}

function selectAcrossChanges(project) {
  const items = listWorkItems(project);
  return items.find((item) => item.status === 'todo' && (!item.dependencies || !item.dependencies.length))
    || items.find((item) => item.status === 'todo')
    || null;
}

function renderPacket({ role, item, modelProfile }) {
  const criteria = (item.acceptanceCriteria || []).map((entry) => `- ${entry}`).join('\n');
  const roles = (item.factory?.roles || []).join(', ');
  return `# Work packet

Role: ${role}
Implementing agent: ${role}
Model profile: ${modelProfile}
Charter: .factory/agents/${role}/charter.md
History: .factory/agents/${role}/history.md

Read that charter and that history only. Do not read any other agent's charter.

Work item: ${item.change}/${item.id}
Title: ${item.title}
Status: ${item.status}
Change: ${item.change}
Roles pipeline: ${roles || role}
Verification profile: ${item.factory?.verificationProfile || '(default)'}
Checks: ${(item.factory?.checks || []).join(', ') || '(default)'}

Description:
openspec-task: ${item.id}

Change: openspec/changes/${item.change}/tasks.md

${item.title}

Acceptance criteria:
${criteria || '- (see the task)'}

Method:
- Prefer common scaffolds and libraries over hand-rolled toolchains (for example npm create vite@latest for a SPA).
- Write a failing test before production code when the profile includes unit or equivalent checks.
- Record evidence on the attempt via idefactory attempt transition.
- Run verification profile checks before claiming done.
- Review is a different role: reviewer. The implementer does not approve their own work.
- Finalize with idefactory complete ${item.change} ${item.id} --attempt <id>.

The IDE session model does the work. Do not start a model process.
`;
}

function primaryRole(item) {
  const roles = item.factory?.roles || [];
  if (roles.includes('architect')) return 'architect';
  const implementer = roles.find((role) => !['reviewer', 'scribe', 'security-reviewer', 'test-engineer'].includes(role));
  return implementer || 'engineer';
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

function readConfig(project) {
  const file = path.join(project, '.factory', 'config.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(readText(file));
  } catch {
    return {};
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
