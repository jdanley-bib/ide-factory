import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { attemptsRoot } from './attempt.mjs';
import { classifyTask } from './classify.mjs';
import { resolveRequirements } from './required-checks.mjs';
import { isHeld } from './work.mjs';

export function normalizeText(title) {
  return String(title || '').trim().replace(/\s+/g, ' ');
}

export function itemText(item) {
  if (item?.provenance?.text != null) return normalizeText(item.provenance.text);
  return normalizeText(item?.title || '');
}

export function sha256Json(value) {
  return `sha256:${createHash('sha256').update(stableJson(value), 'utf8').digest('hex')}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Every attempt stored for one work item, oldest id first. */
export function attemptsForItem(project, item) {
  const root = attemptsRoot(project);
  if (!fs.existsSync(root)) return [];
  const rows = [];
  for (const name of fs.readdirSync(root).sort()) {
    if (!name.endsWith('.json')) continue;
    try {
      const attempt = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
      if (attempt?.change === item.change && attempt?.taskId === item.id) rows.push(attempt);
    } catch {
      // unreadable attempt files are ignored here and surface elsewhere
    }
  }
  return rows;
}

export function itemHasAttempt(project, item) {
  return Boolean(item.attemptId) || attemptsForItem(project, item).length > 0;
}

function classifiedFor(task) {
  return classifyTask({
    id: task.id,
    title: task.title,
    body: task.title,
    factory: task.factory,
    routeDefault: task.changeRoute,
  });
}

function gateShape(factory, dependencies) {
  return {
    taskType: factory?.taskType ?? null,
    checks: [...(factory?.checks || [])].map(String).sort(),
    verificationProfile: factory?.verificationProfile ?? null,
    route: factory?.route ?? null,
    dependencies: [...(dependencies || [])].map(String).sort(),
  };
}

export function classificationDigest(factory, dependencies) {
  return sha256Json(gateShape(factory, dependencies));
}

function requiredKinds(project, item, factory, dependencies) {
  try {
    return resolveRequirements(project, { ...item, factory, dependencies }).checks.map((entry) => entry.kind);
  } catch {
    return [];
  }
}

/**
 * A difference between what the plan now says about an item and what is stored.
 * @returns {null | { id: string, old: object, new: object }}
 */
export function driftFor(project, item, task) {
  const classified = classifiedFor(task);
  const stored = gateShape(item.factory, item.dependencies);
  const next = gateShape(classified, classified.dependencies);
  if (sha256Json(stored) === sha256Json(next)) return null;
  return {
    id: item.id,
    old: { ...stored, requiredChecks: requiredKinds(project, item, item.factory, item.dependencies) },
    new: { ...next, requiredChecks: requiredKinds(project, item, classified, classified.dependencies) },
  };
}

export function describeDrift(row) {
  const side = (value) => `${value.taskType} ${value.verificationProfile} checks [${value.requiredChecks.join(', ')}] dependencies [${value.dependencies.join(', ')}]`;
  return `drift for ${row.id}: stored ${side(row.old)}; plan ${side(row.new)}`;
}

function hasDuplicates(texts) {
  return new Set(texts).size !== texts.length;
}

function oneToOneTextMatch(tasks, items) {
  const byText = new Map();
  for (const item of items) {
    const key = itemText(item);
    if (byText.has(key)) return null;
    byText.set(key, item);
  }
  const seen = new Set();
  const pairs = [];
  for (const task of tasks) {
    const key = normalizeText(task.title);
    if (seen.has(key)) return null;
    seen.add(key);
    const item = byText.get(key);
    if (!item) return null;
    pairs.push({ task, item });
  }
  if (seen.size !== byText.size) return null;
  return pairs;
}

/**
 * Label the difference between the current task list and the stored items.
 *
 * kind: exact (nothing changed), reword (same ids, some text changed), renumber (same texts, new
 * ids), addition (only new tasks), or ambiguous (anything else). Held items and checked tasks
 * that never had an item are set aside first. No similarity matching is done.
 */
export function classifyDiff(tasks, items) {
  const held = items.filter(isHeld);
  const active = items.filter((item) => !isHeld(item));
  const heldIds = new Set(held.map((item) => item.id));
  const activeById = new Map(active.map((item) => [item.id, item]));
  const activeTexts = new Set(active.map(itemText));

  const heldPresent = tasks.filter((task) => heldIds.has(task.id));
  const candidate = tasks.filter((task) => !heldIds.has(task.id));
  const ignored = candidate.filter((task) => task.done
    && !activeById.has(task.id)
    && !activeTexts.has(normalizeText(task.title)));
  const ignoredIds = new Set(ignored.map((task) => task.id));
  const current = candidate.filter((task) => !ignoredIds.has(task.id));

  const base = { held, active, heldPresent, ignored, tasks: current };
  const taskById = new Map(current.map((task) => [task.id, task]));
  const sameIds = current.length === active.length && current.every((task) => activeById.has(task.id));

  if (hasDuplicates(current.map((task) => normalizeText(task.title))) || hasDuplicates(active.map(itemText))) {
    return { ...base, kind: 'ambiguous', reason: 'duplicate task text' };
  }
  if (sameIds) {
    const pairs = current.map((task) => ({ task, item: activeById.get(task.id) }));
    const changed = pairs.filter(({ task, item }) => normalizeText(task.title) !== itemText(item));
    return { ...base, kind: changed.length === 0 ? 'exact' : 'reword', pairs };
  }
  const textPairs = oneToOneTextMatch(current, active);
  if (textPairs && current.length > 0) return { ...base, kind: 'renumber', pairs: textPairs };

  const additions = current.filter((task) => !activeById.has(task.id));
  const othersExact = active.every((item) => {
    const task = taskById.get(item.id);
    return task && normalizeText(task.title) === itemText(item);
  });
  if (additions.length > 0 && othersExact) {
    return {
      ...base,
      kind: 'addition',
      additions,
      pairs: active.map((item) => ({ task: taskById.get(item.id), item })),
    };
  }
  return { ...base, kind: 'ambiguous', reason: 'unmatched tasks' };
}

/** Items and tasks that do not match one to one by id and text. */
export function unmatchedSets(diff) {
  const taskById = new Map(diff.tasks.map((task) => [task.id, task]));
  const itemById = new Map(diff.active.map((item) => [item.id, item]));
  const items = diff.active.filter((item) => {
    const task = taskById.get(item.id);
    return !task || normalizeText(task.title) !== itemText(item);
  });
  const tasks = diff.tasks.filter((task) => {
    const item = itemById.get(task.id);
    return !item || normalizeText(task.title) !== itemText(item);
  });
  return { items, tasks };
}
