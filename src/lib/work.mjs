import fs from 'node:fs';
import path from 'node:path';
import { writeText } from './layout.mjs';

const STATUSES = new Set(['todo', 'in_progress', 'done', 'blocked']);

export function workRoot(project) {
  return path.join(project, '.factory', 'work');
}

export function itemPath(project, change, id) {
  return path.join(workRoot(project), 'items', `${change}--${id}.json`);
}

export function ensureWorkDirs(project) {
  const root = workRoot(project);
  fs.mkdirSync(path.join(root, 'items'), { recursive: true });
  const indexPath = path.join(root, 'index.json');
  if (!fs.existsSync(indexPath)) {
    writeText(indexPath, JSON.stringify({ version: 1, items: [] }, null, 2));
  }
}

export function listWorkItems(project, change) {
  ensureWorkDirs(project);
  const dir = path.join(workRoot(project), 'items');
  if (!fs.existsSync(dir)) return [];
  const prefix = change ? `${change}--` : '';
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json') && (!change || name.startsWith(prefix)))
    .map((name) => readWorkItemFile(path.join(dir, name)))
    .filter(Boolean)
    .sort(compareWorkItems);
}

/** Dotted OpenSpec task ids (1.2, 10.1) sort numerically, not lexicographically. */
export function compareTaskIds(a, b) {
  const left = String(a ?? '').split('.');
  const right = String(b ?? '').split('.');
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const lPart = left[i] ?? '';
    const rPart = right[i] ?? '';
    const lNum = Number(lPart);
    const rNum = Number(rPart);
    const lIsNum = lPart !== '' && Number.isFinite(lNum);
    const rIsNum = rPart !== '' && Number.isFinite(rNum);
    if (lIsNum && rIsNum) {
      if (lNum !== rNum) return lNum - rNum;
      continue;
    }
    const cmp = lPart.localeCompare(rPart, undefined, { numeric: true });
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function compareWorkItems(a, b) {
  const changeCmp = String(a.change ?? '').localeCompare(String(b.change ?? ''));
  if (changeCmp !== 0) return changeCmp;
  return compareTaskIds(a.id, b.id);
}

export function getWorkItem(project, change, id) {
  const file = itemPath(project, change, id);
  if (!fs.existsSync(file)) return null;
  return readWorkItemFile(file);
}

export function upsertWorkItem(project, item) {
  ensureWorkDirs(project);
  if (!item?.change || !item?.id) throw new Error('Work item requires change and id');
  const status = normalizeStatus(item.status || 'todo');
  const next = {
    ...item,
    status,
    dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
    acceptanceCriteria: Array.isArray(item.acceptanceCriteria) ? item.acceptanceCriteria : [],
    factory: item.factory || {},
    updatedAt: new Date().toISOString(),
  };
  writeText(itemPath(project, next.change, next.id), JSON.stringify(next, null, 2));
  refreshIndex(project);
  return next;
}

export function updateWorkItem(project, change, id, patch) {
  const current = getWorkItem(project, change, id);
  if (!current) throw new Error(`Work item not found: ${change}/${id}`);
  return upsertWorkItem(project, { ...current, ...patch, change, id });
}

export function isReady(project, item, allItems) {
  if (!item || normalizeStatus(item.status) !== 'todo') return false;
  const deps = item.dependencies || [];
  if (!deps.length) return true;
  const siblings = allItems || listWorkItems(project, item.change);
  return deps.every((depId) => {
    const dep = siblings.find((entry) => entry.id === depId);
    return dep && normalizeStatus(dep.status) === 'done';
  });
}

export function selectReady(project, change) {
  const items = listWorkItems(project, change);
  return items.find((item) => isReady(project, item, items)) || null;
}

export function workCounts(project, change) {
  const items = listWorkItems(project, change);
  const counts = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
  for (const item of items) {
    const status = normalizeStatus(item.status);
    if (counts[status] !== undefined) counts[status] += 1;
  }
  return counts;
}

function refreshIndex(project) {
  const items = listWorkItems(project);
  writeText(
    path.join(workRoot(project), 'index.json'),
    JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      items: items.map((item) => ({ change: item.change, id: item.id, status: item.status })),
    }, null, 2),
  );
}

function readWorkItemFile(file) {
  try {
    const item = JSON.parse(fs.readFileSync(file, 'utf8'));
    item.status = normalizeStatus(item.status);
    return item;
  } catch {
    return null;
  }
}

function normalizeStatus(status) {
  const value = String(status || 'todo').toLowerCase().replace(/\s+/g, '_');
  if (value === 'to_do') return 'todo';
  if (!STATUSES.has(value)) return 'todo';
  return value;
}
