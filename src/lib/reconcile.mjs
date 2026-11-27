import fs from 'node:fs';
import path from 'node:path';
import { appendControlEvent } from './event-log.mjs';
import { assertIdentity } from './identity.mjs';
import { halted, ledger, readText, writeText } from './layout.mjs';
import { confirmPrincipal, readPolicyVersion } from './principal.mjs';
import { loadChangeTasks, provenanceForTitle, writeNewWorkItem } from './queue.mjs';
import {
  attemptsForItem,
  classificationDigest,
  classifyDiff,
  driftFor,
  itemText,
  normalizeText,
  sha256Json,
  unmatchedSets,
} from './reconcile-diff.mjs';
import { classifyTask, defaultAcceptanceCriteria } from './classify.mjs';
import { attemptsRoot } from './attempt.mjs';
import {
  isHeld,
  listWorkItems,
  removeWorkItemFile,
  upsertWorkItem,
  workRoot,
} from './work.mjs';

export const PLAN_SCHEMA_VERSION = 1;
export const DECISIONS = [
  'keep', 'renumber', 'defer', 'resume', 'drop', 'split', 'merge', 'move',
  'adopt-classification', 'keep-classification',
];
const HOLDING = new Set(['defer', 'drop', 'split', 'merge', 'move']);
const DROPPING = new Set(['drop', 'split', 'merge', 'move']);
const SAME_ID = new Set(['keep', 'adopt-classification', 'keep-classification', 'resume']);
const LOOSENING = new Set(['adopt-classification', 'drop', 'split', 'merge', 'move']);

export function reconciliationsDir(project) {
  return path.join(workRoot(project), 'reconciliations');
}

function recordPath(project, id) {
  return path.join(reconciliationsDir(project), `${id}.json`);
}

function assertChange(change) {
  if (!change || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(change)) {
    throw new Error('Usage: idefactory sync-tasks <change-name> --plan | --apply');
  }
}

function overlapReport(project, change) {
  const root = path.join(project, 'openspec', 'changes');
  const capabilities = (name) => {
    const dir = path.join(root, name, 'specs');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((entry) => fs.statSync(path.join(dir, entry)).isDirectory()).sort();
  };
  const mine = new Set(capabilities(change));
  if (mine.size === 0 || !fs.existsSync(root)) return [];
  const rows = [];
  for (const name of fs.readdirSync(root).sort()) {
    if (name === change || name === 'archive' || !fs.statSync(path.join(root, name)).isDirectory()) continue;
    const shared = capabilities(name).filter((capability) => mine.has(capability));
    if (shared.length === 0) continue;
    const open = listWorkItems(project, name).filter((item) => item.status !== 'done' && !isHeld(item));
    if (open.length === 0) continue;
    for (const capability of shared) rows.push({ change: name, capability, openItems: open.map((item) => item.id) });
  }
  return rows;
}

function attemptSummary(project, item) {
  const attempts = attemptsForItem(project, item);
  const last = attempts[attempts.length - 1] || null;
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    attemptId: last?.id ?? item.attemptId ?? null,
    attemptState: last?.state ?? null,
    implementerId: last?.implementerId ?? null,
  };
}

function dependentsOf(items, id) {
  return items.filter((item) => !isHeld(item) && (item.dependencies || []).includes(id)).map((item) => item.id);
}

/**
 * Describe what sync-tasks would do and what needs a decision. Writes nothing.
 */
export function buildReconciliationPlan(project, change) {
  assertChange(change);
  const tasks = loadChangeTasks(project, change);
  const items = listWorkItems(project, change);
  const diff = classifyDiff(tasks, items);
  const taskById = new Map(diff.tasks.map((task) => [task.id, task]));

  const automatic = [];
  for (const task of diff.ignored) automatic.push({ action: 'ignore-checked', id: task.id, title: task.title });
  if (diff.kind === 'addition') {
    for (const task of diff.additions) automatic.push({ action: 'create', id: task.id, title: task.title });
  }
  if (diff.kind === 'renumber') {
    for (const { task, item } of diff.pairs) {
      if (task.id !== item.id) automatic.push({ action: 'renumber', from: item.id, to: task.id, title: task.title });
    }
  }
  if (diff.kind === 'reword') {
    for (const { task, item } of diff.pairs) {
      if (normalizeText(task.title) !== itemText(item)) {
        automatic.push({ action: 'retitle', id: item.id, title: task.title, classification: attemptsForItem(project, item).length || item.attemptId ? 'kept' : 'adopted' });
      }
    }
  }

  const ambiguous = diff.kind === 'ambiguous';
  const unmatched = ambiguous ? unmatchedSets(diff) : { items: [], tasks: [] };
  const drift = [];
  for (const item of diff.active) {
    const task = taskById.get(item.id);
    if (!task) continue;
    const found = driftFor(project, item, task);
    if (found) drift.push(found);
  }

  const inFlight = diff.active
    .filter((item) => item.status === 'in_progress' || item.attemptId || attemptsForItem(project, item).length > 0)
    .map((item) => attemptSummary(project, item));
  const heldRows = diff.held.map((item) => ({
    id: item.id,
    kind: item.hold.kind,
    previousStatus: item.hold.previousStatus ?? null,
    decisionRecord: item.hold.decisionRecord ?? null,
    supersededBy: item.hold.supersededBy ?? [],
    taskPresent: diff.heldPresent.some((task) => task.id === item.id),
  }));
  const dependents = {};
  for (const item of [...unmatched.items, ...diff.held]) {
    const names = dependentsOf(items, item.id);
    if (names.length) dependents[item.id] = names;
  }
  const required = [...new Set([
    ...unmatched.items.map((item) => item.id),
    ...drift.map((row) => row.id),
  ])].sort();

  const digest = sha256Json({
    change,
    tasks: tasks.map((task) => ({
      id: task.id,
      done: task.done,
      text: normalizeText(task.title),
      classification: classificationDigest(classifyTask({
        id: task.id, title: task.title, body: task.title, factory: task.factory, routeDefault: task.changeRoute,
      }), classifyTask({
        id: task.id, title: task.title, body: task.title, factory: task.factory, routeDefault: task.changeRoute,
      }).dependencies),
    })),
    items: items.map((item) => ({
      id: item.id,
      status: item.status,
      attemptId: item.attemptId ?? null,
      hold: item.hold ? { kind: item.hold.kind, previousStatus: item.hold.previousStatus ?? null } : null,
      text: itemText(item),
      classification: classificationDigest(item.factory, item.dependencies),
    })),
  });

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    change,
    digest,
    kind: diff.kind,
    needsDecisions: ambiguous || drift.length > 0,
    automatic,
    unmatchedItems: unmatched.items.map((item) => ({ id: item.id, title: item.title, status: item.status })),
    unmatchedTasks: unmatched.tasks.map((task) => ({ id: task.id, title: task.title })),
    requiredDecisions: required,
    inFlight,
    drift,
    held: heldRows,
    dependents,
    overlaps: overlapReport(project, change),
  };
}

export function renderPlanText(plan) {
  const lines = [`Reconciliation plan for ${plan.change} (digest ${plan.digest})`, `Difference: ${plan.kind}`];
  const section = (title, rows) => {
    if (rows.length === 0) return;
    lines.push('', `${title}:`, ...rows.map((row) => `- ${row}`));
  };
  section('Automatic actions', plan.automatic.map((row) => {
    if (row.action === 'create') return `create ${row.id}: ${row.title}`;
    if (row.action === 'renumber') return `renumber ${row.from} to ${row.to}: ${row.title}`;
    if (row.action === 'retitle') return `retitle ${row.id} (classification ${row.classification}): ${row.title}`;
    return `ignore checked task ${row.id}: ${row.title}`;
  }));
  section('Unmatched stored items', plan.unmatchedItems.map((row) => `${row.id} [${row.status}]: ${row.title}`));
  section('Unmatched current tasks', plan.unmatchedTasks.map((row) => `${row.id}: ${row.title}`));
  section('Items with work in flight', plan.inFlight.map((row) => `${row.id} [${row.status}] attempt ${row.attemptId ?? 'none'} state ${row.attemptState ?? 'none'}`));
  section('Classification drift', plan.drift.map((row) => {
    const side = (value) => `${value.taskType} ${value.verificationProfile} checks [${value.requiredChecks.join(', ')}] dependencies [${value.dependencies.join(', ')}]`;
    return `${row.id}: stored ${side(row.old)}; plan ${side(row.new)}`;
  }));
  section('Held items', plan.held.map((row) => `${row.id} ${row.kind}${row.decisionRecord ? ` by ${row.decisionRecord}` : ''}${row.taskPresent ? ' (task still present; resume to return it)' : ''}`));
  section('Dependents', Object.entries(plan.dependents).map(([id, names]) => `${names.join(', ')} depend on ${id}`));
  section('Overlapping active changes', plan.overlaps.map((row) => `${row.change} also changes ${row.capability} (open: ${row.openItems.join(', ')})`));
  if (plan.requiredDecisions.length) {
    lines.push('', `Decisions needed for: ${plan.requiredDecisions.join(', ')}`);
    lines.push(`Apply with: idefactory sync-tasks ${plan.change} --apply --decisions-file <path> --plan-digest ${plan.digest} --decided-by <id>`);
  } else {
    lines.push('', 'No decisions needed. Run idefactory sync-tasks to apply the automatic actions.');
  }
  return lines.join('\n');
}

function readDecisions(file) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`--decisions-file could not be read as JSON: ${error.message}`);
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('--decisions-file must hold a JSON object keyed by stored item id');
  }
  const decisions = {};
  for (const [id, raw] of Object.entries(doc)) {
    const value = typeof raw === 'string' ? { decision: raw } : raw;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`decision for ${id} must be a name or an object with a decision field`);
    }
    if (!DECISIONS.includes(value.decision)) {
      throw new Error(`decision for ${id} must be one of: ${DECISIONS.join(', ')}`);
    }
    decisions[id] = { ...value };
  }
  return decisions;
}

function targetRef(change, ref) {
  if (typeof ref === 'string') return { change, id: ref };
  if (ref && typeof ref === 'object' && typeof ref.id === 'string') return { change: ref.change || change, id: ref.id };
  throw new Error('a successor must be a task id or { change, id }');
}

function classifyFor(task) {
  return classifyTask({
    id: task.id, title: task.title, body: task.title, factory: task.factory, routeDefault: task.changeRoute,
  });
}

function titleHistoryEntry(item) {
  const text = itemText(item);
  return {
    title: item.title,
    text,
    digest: item.provenance?.digest ?? provenanceForTitle(text).digest,
    replacedAt: new Date().toISOString(),
  };
}

function itemDigest(project, change, id) {
  const file = path.join(workRoot(project), 'items', `${change}--${id}.json`);
  if (!fs.existsSync(file)) return null;
  return sha256Json(JSON.parse(readText(file)));
}

function applyKeyFor(plan, decisions) {
  return sha256Json({ change: plan.change, planDigest: plan.digest, decisions }).slice('sha256:'.length, 'sha256:'.length + 16);
}

function authorize(project, plan, decisions, items, options) {
  const decidedBy = assertIdentity(options.decidedBy, '--decided-by');
  const loosened = [];
  for (const [id, decision] of Object.entries(decisions)) {
    const item = items.find((entry) => entry.id === id);
    if (!item) continue;
    const dependentsReleased = decision.dependents === 'release';
    if (LOOSENING.has(decision.decision)) loosened.push({ item, why: decision.decision });
    if (dependentsReleased) {
      for (const dependentId of dependentsOf(items, id)) {
        const dependent = items.find((entry) => entry.id === dependentId);
        if (dependent) loosened.push({ item: dependent, why: `release of ${id}` });
      }
    }
  }
  let needsPrincipal = false;
  for (const { item, why } of loosened) {
    const past = attemptsForItem(project, item).filter((attempt) => attempt.state !== 'planned');
    if (past.length === 0) continue;
    needsPrincipal = true;
    for (const attempt of past) {
      if (typeof attempt.implementerId === 'string' && attempt.implementerId === decidedBy) {
        throw new Error(`${why} on ${item.id} needs a --decided-by identity other than the implementer's of attempt ${attempt.id}`);
      }
    }
  }
  if (needsPrincipal && readPolicyVersion(project) >= 2) {
    const principal = confirmPrincipal(project, {
      provider: options.principalProvider,
      subject: options.principalSubject,
    });
    if (decidedBy !== principal.subject) {
      throw new Error('--decided-by must equal the verified principal subject');
    }
    return { decidedBy, principal };
  }
  return { decidedBy };
}

/**
 * Turn the decisions into a list of file operations and the record that describes them.
 * Throws, writing nothing, when the file is incomplete, conflicting, or names an invalid target.
 */
function buildOperations(project, plan, decisions, recordId) {
  const change = plan.change;
  const tasks = loadChangeTasks(project, change);
  const items = listWorkItems(project, change);
  const diff = classifyDiff(tasks, items);
  const taskById = new Map(diff.tasks.map((task) => [task.id, task]));
  const allTaskById = new Map(tasks.map((task) => [task.id, task]));
  const itemById = new Map(items.map((item) => [item.id, item]));

  for (const id of Object.keys(decisions)) {
    if (!itemById.has(id)) throw new Error(`decision names ${id}, which is not a stored item of ${change}`);
  }
  const missing = plan.requiredDecisions.filter((id) => !decisions[id]);
  if (missing.length) {
    throw new Error(`decisions file has no decision for: ${missing.join(', ')}. Run idefactory sync-tasks ${change} --plan.`);
  }
  const driftIds = new Set(plan.drift.map((row) => row.id));

  const claimedTasks = new Map();
  const claim = (taskId, byId) => {
    if (claimedTasks.has(taskId) && claimedTasks.get(taskId) !== byId) {
      throw new Error(`decisions conflict: task ${taskId} is claimed by both ${claimedTasks.get(taskId)} and ${byId}`);
    }
    claimedTasks.set(taskId, byId);
  };
  const exactIds = new Set(diff.active
    .filter((item) => taskById.has(item.id) && normalizeText(taskById.get(item.id).title) === itemText(item))
    .map((item) => item.id));

  const writes = new Map();
  const removals = new Set();
  const retargets = [];
  const holds = [];
  const released = [];
  const creations = new Set();

  const dropLike = (item, decision, successors) => {
    const dependents = dependentsOf(items, item.id);
    if (DROPPING.has(decision.decision) && dependents.length && !['block', 'release'].includes(decision.dependents)) {
      throw new Error(`${decision.decision} of ${item.id} needs dependents: block or release (dependents: ${dependents.join(', ')})`);
    }
    if (decision.dependents !== undefined && !['block', 'release'].includes(decision.dependents)) {
      throw new Error(`dependents for ${item.id} must be block or release`);
    }
    holds.push({
      item,
      kind: DROPPING.has(decision.decision) ? 'dropped' : 'deferred',
      successors,
    });
    if (decision.dependents === 'release') {
      for (const dependentId of dependents) released.push({ dependent: itemById.get(dependentId), removed: item.id });
    }
  };

  for (const [id, decision] of Object.entries(decisions)) {
    const item = itemById.get(id);
    const name = decision.decision;
    if (isHeld(item) && name !== 'resume') {
      throw new Error(`${id} is ${item.hold.kind}; only resume applies to a held item`);
    }
    if (!isHeld(item) && name === 'resume') throw new Error(`${id} is not held, so there is nothing to resume`);
    if (SAME_ID.has(name)) {
      const task = allTaskById.get(id);
      if (!task) throw new Error(`${name} for ${id} needs a task with the same id in tasks.md`);
      if (name === 'keep' && driftIds.has(id)) {
        throw new Error(`${id} has classification drift; use adopt-classification or keep-classification`);
      }
      if (name === 'resume') {
        const { hold, ...rest } = item;
        writes.set(id, { ...rest, status: hold.previousStatus || 'todo' });
        continue;
      }
      const wordingChanged = normalizeText(task.title) !== itemText(item);
      let next = { ...item };
      if (wordingChanged) {
        next = {
          ...next,
          title: task.title,
          provenance: provenanceForTitle(task.title),
          titleHistory: [...(item.titleHistory || []), titleHistoryEntry(item)],
        };
      }
      if (name === 'adopt-classification') {
        const classified = classifyFor(task);
        next = {
          ...next,
          dependencies: classified.dependencies,
          acceptanceCriteria: defaultAcceptanceCriteria(task.title, task.acceptanceCriteria),
          factory: classified,
        };
      }
      writes.set(id, next);
      continue;
    }
    if (name === 'renumber') {
      const to = typeof decision.to === 'string' ? decision.to : '';
      const task = taskById.get(to);
      if (!task) throw new Error(`renumber for ${id} needs "to" naming a current task id`);
      if (to === id) throw new Error(`renumber for ${id} names its own id; use keep`);
      claim(to, id);
      writes.set(to, {
        ...item,
        id: to,
        title: task.title,
        provenance: provenanceForTitle(task.title),
        titleHistory: normalizeText(task.title) === itemText(item)
          ? item.titleHistory
          : [...(item.titleHistory || []), titleHistoryEntry(item)],
      });
      removals.add(id);
      retargets.push({ from: id, to });
      continue;
    }
    if (name === 'defer') {
      dropLike(item, decision, []);
      continue;
    }
    let successors = [];
    if (name === 'drop') {
      successors = (decision.supersededBy || []).map((ref) => targetRef(change, ref));
    } else if (name === 'split') {
      const into = Array.isArray(decision.into) ? decision.into.map(String) : [];
      if (into.length < 2) throw new Error(`split for ${id} needs "into" naming at least two current task ids`);
      for (const taskId of into) {
        if (!taskById.has(taskId)) throw new Error(`split for ${id} names ${taskId}, which is not a current task`);
        if (exactIds.has(taskId)) throw new Error(`split for ${id} names ${taskId}, which already has an unchanged item`);
        claim(taskId, id);
        creations.add(taskId);
      }
      successors = into.map((taskId) => ({ change, id: taskId }));
    } else if (name === 'merge') {
      const into = typeof decision.into === 'string' ? decision.into : '';
      if (!allTaskById.has(into)) throw new Error(`merge for ${id} needs "into" naming a task id in tasks.md`);
      if (into === id) throw new Error(`merge for ${id} names its own id`);
      if (!exactIds.has(into) && !itemById.has(into)) creations.add(into);
      successors = [{ change, id: into }];
    } else if (name === 'move') {
      const target = targetRef(change, decision.to);
      if (target.change === change) throw new Error(`move for ${id} needs "to" in another change; use renumber or merge here`);
      assertChange(target.change);
      let otherTasks;
      try {
        otherTasks = loadChangeTasks(project, target.change);
      } catch (error) {
        throw new Error(`move for ${id}: ${error.message}`);
      }
      if (!otherTasks.some((task) => task.id === target.id)) {
        throw new Error(`move for ${id} needs task ${target.id} in openspec/changes/${target.change}/tasks.md`);
      }
      successors = [target];
    }
    dropLike(item, decision, successors);
  }

  for (const { from, to } of retargets) {
    if (itemById.has(to) && decisions[to]?.decision !== 'renumber') {
      throw new Error(`renumber of ${from} to ${to}: ${to} is already used by a stored item that stays`);
    }
  }

  for (const taskId of creations) {
    if (itemById.has(taskId) && !removals.has(taskId)) continue;
    const task = allTaskById.get(taskId);
    writes.set(taskId, { __new: true, task });
  }

  const additions = diff.tasks.filter((task) => {
    if (task.done) return false;
    if (itemById.has(task.id) && !removals.has(task.id)) return false;
    return !claimedTasks.has(task.id) && !writes.has(task.id);
  });
  for (const task of additions) writes.set(task.id, { __new: true, task });

  const operations = [];
  const touched = new Set();
  for (const [id, body] of writes) {
    touched.add(id);
    if (body.__new) {
      operations.push({ op: 'create', change, id, task: { id: body.task.id, title: body.task.title } });
    } else {
      operations.push({ op: 'write', change, id, item: body });
    }
  }
  for (const { item, kind, successors } of holds) {
    touched.add(item.id);
    operations.push({
      op: 'write',
      change,
      id: item.id,
      item: {
        ...item,
        status: 'blocked',
        hold: {
          kind,
          previousStatus: item.status,
          decisionRecord: recordId,
          ...(successors.length ? { supersededBy: successors } : {}),
        },
      },
    });
  }
  for (const { dependent, removed } of released) {
    const existing = operations.find((entry) => entry.op === 'write' && entry.id === dependent.id);
    const base = existing ? existing.item : dependent;
    const next = { ...base, dependencies: (base.dependencies || []).filter((dep) => dep !== removed) };
    touched.add(dependent.id);
    if (existing) existing.item = next;
    else operations.push({ op: 'write', change, id: dependent.id, item: next });
  }
  const writtenIds = new Set(operations.filter((entry) => entry.op !== 'remove').map((entry) => entry.id));
  for (const id of removals) {
    if (!writtenIds.has(id)) {
      touched.add(id);
      operations.push({ op: 'remove', change, id });
    }
  }
  const attemptRetargets = [];
  const moved = new Map(retargets.map((row) => [row.from, row.to]));
  const root = attemptsRoot(project);
  if (moved.size && fs.existsSync(root)) {
    for (const name of fs.readdirSync(root).sort()) {
      if (!name.endsWith('.json')) continue;
      try {
        const attempt = JSON.parse(readText(path.join(root, name)));
        if (attempt.change === change && moved.has(attempt.taskId)) {
          attemptRetargets.push({ attemptId: attempt.id, to: moved.get(attempt.taskId) });
        }
      } catch {
        // unreadable attempt files are not retargeted
      }
    }
  }
  return { operations, attemptRetargets, touched: [...touched].sort(), items };
}

function executeOperations(project, record) {
  for (const entry of record.operations) {
    if (entry.op === 'create') {
      const tasks = loadChangeTasks(project, entry.change);
      const task = tasks.find((candidate) => candidate.id === entry.id);
      if (!task) throw new Error(`task ${entry.id} is no longer in tasks.md`);
      writeNewWorkItem(project, entry.change, task);
    } else if (entry.op === 'write') {
      upsertWorkItem(project, entry.item);
    }
  }
  for (const { attemptId, to } of record.attemptRetargets) {
    const file = path.join(attemptsRoot(project), `${attemptId}.json`);
    const attempt = JSON.parse(readText(file));
    if (attempt.taskId === to) continue;
    writeText(file, JSON.stringify({ ...attempt, taskId: to, updatedAt: new Date().toISOString() }, null, 2));
  }
  for (const entry of record.operations) {
    if (entry.op === 'remove') removeWorkItemFile(project, entry.change, entry.id);
  }
}

/**
 * Apply explicit decisions to a changed task list. Idempotent for the same plan digest and decisions.
 *
 * @param {string} project
 * @param {string} change
 * @param {{ decisionsFile: string, planDigest: string, decidedBy: string, principalProvider?: string, principalSubject?: string }} options
 */
export function applyReconciliation(project, change, options) {
  if (halted(project)) throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  assertChange(change);
  if (!options.decisionsFile) throw new Error('--apply needs --decisions-file <path>');
  if (!options.planDigest) throw new Error('--apply needs --plan-digest <digest>');
  const decisions = readDecisions(options.decisionsFile);
  const key = applyKeyFor({ change, digest: options.planDigest }, decisions);
  const recordId = `rec-${key}`;
  const file = recordPath(project, recordId);

  if (fs.existsSync(file)) {
    const existing = JSON.parse(readText(file));
    if (existing.status === 'applied') return { record: existing, unchanged: true };
    executeOperations(project, existing);
    return { record: finalize(project, file, existing), unchanged: false };
  }

  const plan = buildReconciliationPlan(project, change);
  if (plan.digest !== options.planDigest) {
    throw new Error(`plan digest mismatch: the queue or tasks.md changed since the plan (current ${plan.digest}). Run idefactory sync-tasks ${change} --plan again.`);
  }
  const built = buildOperations(project, plan, decisions, recordId);
  const authority = authorize(project, plan, decisions, built.items, options);
  const before = Object.fromEntries(built.touched.map((id) => [id, itemDigest(project, change, id)]));
  const record = {
    schemaVersion: 1,
    id: recordId,
    change,
    status: 'pending',
    planDigest: plan.digest,
    decisions,
    decidedBy: authority.decidedBy,
    ...(authority.principal ? { principal: authority.principal } : {}),
    time: new Date().toISOString(),
    before,
    operations: built.operations,
    attemptRetargets: built.attemptRetargets,
  };
  writeText(file, `${JSON.stringify(record, null, 2)}\n`);
  executeOperations(project, record);
  return { record: finalize(project, file, record), unchanged: false };
}

function finalize(project, file, record) {
  const after = Object.fromEntries(Object.keys(record.before).map((id) => [id, itemDigest(project, record.change, id)]));
  const applied = {
    ...record,
    status: 'applied',
    after,
    touched: Object.keys(record.before).map((id) => ({ id, before: record.before[id], after: after[id] })),
  };
  writeText(file, `${JSON.stringify(applied, null, 2)}\n`);
  ledger(project, 'sync-tasks-reconcile', { change: record.change, record: record.id });
  appendControlEvent(project, {
    type: 'tasks.reconciled',
    time: new Date().toISOString(),
    id: record.id,
    change: record.change,
  });
  return applied;
}
