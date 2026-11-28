import { standingDecisionsText } from './standing-decisions.mjs';
import { BlockedError, haltError } from './blocked-error.mjs';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { attemptsRoot, getAttempt } from './attempt.mjs';
import { describeReopens } from './attempt-reopen.mjs';
import { latestRunSession } from './run-session.mjs';
import { classifyTask, defaultAcceptanceCriteria, parseFactoryBlock } from './classify.mjs';
import { describeException, listAttemptExceptions } from './red-exceptions.mjs';
import { halted, ledger, readText, writeText } from './layout.mjs';
import { describeProblems, redKindsFor, resolveRequirements } from './required-checks.mjs';
import { describeAttemptMethod, describeCoverage, describeMethod, methodCoveredKinds } from './red-method.mjs';
import { classifyDiff, driftFor, itemHasAttempt, itemText } from './reconcile-diff.mjs';
import {
  ensureWorkDirs,
  getWorkItem,
  listWorkItems,
  removeWorkItemFile,
  selectReady,
  upsertWorkItem,
} from './work.mjs';

export function parseChangeRoute(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  for (const line of lines) {
    if (/^- \[[^\]]*\]/.test(line)) return null;
    const match = line.match(/^factory-route:\s*(\S+)\s*$/);
    if (!match) continue;
    if (match[1] !== 'quick' && match[1] !== 'full') {
      throw new Error(`factory-route must be quick or full, got ${match[1]}`);
    }
    return match[1];
  }
  return null;
}

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

export function normalizeTaskText(title) {
  return String(title || '').trim().replace(/\s+/g, ' ');
}

export function provenanceForTitle(title) {
  const text = normalizeTaskText(title);
  return {
    algorithm: 'sha256',
    text,
    digest: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}

export function loadChangeTasks(project, change) {
  assertChangeName(change);
  const file = path.join(project, 'openspec', 'changes', change, 'tasks.md');
  if (!fs.existsSync(file)) {
    throw new Error(`OpenSpec change not found: openspec/changes/${change}/tasks.md`);
  }
  const markdown = fs.readFileSync(file, 'utf8');
  const changeRoute = parseChangeRoute(markdown);
  return parseCheckboxes(markdown).map((task) => {
    const { factory, acceptanceCriteria } = parseFactoryBlock(markdown, task.id);
    return { ...task, factory, acceptanceCriteria, markdown, changeRoute };
  });
}

export function syncTasks(project, change, _env, hooks = {}) {
  if (halted(project)) throw haltError();
  ensureWorkDirs(project);
  finishPendingRenumber(project, change);
  const tasks = loadChangeTasks(project, change);
  const suggestions = [];
  for (const task of tasks) {
    classifyTask({
      id: task.id,
      title: task.title,
      body: task.title,
      factory: task.factory,
      routeDefault: task.changeRoute,
    });
    if (!task.factory?.route && !task.changeRoute && /\b(fix|bug|hotfix|bugfix)\b/i.test(task.title)) {
      suggestions.push('suggested route: quick');
    }
  }
  const existing = listWorkItems(project, change);

  if (existing.length === 0) {
    return { ...createInitialItems(project, change, tasks), suggestions, drift: [] };
  }

  return { ...reconcileExistingItems(project, change, tasks, existing, hooks), suggestions };
}

function createInitialItems(project, change, tasks) {
  let created = 0;
  let skipped = 0;
  for (const task of tasks) {
    if (task.done) {
      skipped += 1;
      continue;
    }
    writeNewWorkItem(project, change, task);
    created += 1;
  }
  return finishSync(project, change, created, skipped);
}

function reconcileExistingItems(project, change, tasks, existing, hooks) {
  const diff = classifyDiff(tasks, existing);
  if (diff.kind === 'ambiguous') {
    throw reconciliationError(change, unmatchedPreviousIds(diff.tasks, diff.active), unmatchedCurrentIds(diff.tasks, diff.active));
  }
  if (diff.kind === 'renumber') {
    return applyRenumbers(project, change, diff.tasks, diff.pairs, hooks);
  }
  const result = applyTitleAndProvenance(project, change, diff.pairs);
  if (diff.kind === 'addition') {
    for (const task of diff.additions) writeNewWorkItem(project, change, task);
    return finishSync(project, change, diff.additions.length, diff.pairs.length, result.drift);
  }
  return finishSync(project, change, 0, diff.pairs.length, result.drift);
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

/**
 * Bring titles and provenance up to date. An item that has an attempt keeps its classification,
 * dependencies, and acceptance criteria; a difference is reported as drift instead.
 */
function applyTitleAndProvenance(project, change, pairs) {
  const drift = [];
  for (const { task, item } of pairs) {
    const provenance = provenanceForTitle(task.title);
    const wordingChanged = normalizeTaskText(task.title) !== itemNormalizedText(item);
    const attempted = itemHasAttempt(project, item);
    const found = driftFor(project, item, task);
    if (!wordingChanged) {
      const existingProv = item.provenance;
      const provenanceEqual = existingProv
        && existingProv.algorithm === provenance.algorithm
        && existingProv.text === provenance.text
        && existingProv.digest === provenance.digest;
      if (!provenanceEqual) upsertWorkItem(project, { ...item, provenance });
      if (found) drift.push(found);
      continue;
    }
    if (attempted) {
      upsertWorkItem(project, {
        ...item,
        title: task.title,
        provenance,
        titleHistory: [...(item.titleHistory || []), titleHistoryEntry(item)],
      });
      if (found) drift.push(found);
      continue;
    }
    const classified = classifyTask({
      id: task.id,
      title: task.title,
      body: task.title,
      factory: task.factory,
      routeDefault: task.changeRoute,
    });
    upsertWorkItem(project, {
      ...item,
      id: item.id,
      change,
      title: task.title,
      status: item.status,
      attemptId: item.attemptId,
      dependencies: classified.dependencies,
      acceptanceCriteria: defaultAcceptanceCriteria(task.title, task.acceptanceCriteria),
      factory: classified,
      provenance,
      titleHistory: [...(item.titleHistory || []), titleHistoryEntry(item)],
    });
  }
  return { drift };
}

function renumberJournalPath(project, change) {
  return path.join(project, '.factory', 'work', 'pending', `${change}.renumber.json`);
}

function applyRenumbers(project, change, tasks, pairs, hooks = {}) {
  const planned = pairs.map(({ task, item }) => ({
    ...item,
    id: task.id,
    change,
    title: task.title,
    status: item.status,
    attemptId: item.attemptId,
    factory: item.factory || {},
    acceptanceCriteria: Array.isArray(item.acceptanceCriteria) ? item.acceptanceCriteria : [],
    provenance: item.provenance || provenanceForTitle(task.title),
  }));
  const plannedIds = new Set(planned.map((item) => item.id));
  const moved = new Map(pairs.filter(({ task, item }) => task.id !== item.id).map(({ task, item }) => [item.id, task.id]));
  const journal = {
    version: 1,
    change,
    items: planned,
    removeIds: [...moved.keys()].filter((id) => !plannedIds.has(id)),
    retargets: attemptsToRetarget(project, change, moved),
  };
  writeText(renumberJournalPath(project, change), JSON.stringify(journal, null, 2));
  runRenumberJournal(project, journal, hooks);
  return finishSync(project, change, 0, tasks.length, []);
}

function attemptsToRetarget(project, change, moved) {
  const root = attemptsRoot(project);
  if (!fs.existsSync(root)) return [];
  const rows = [];
  for (const name of fs.readdirSync(root).sort()) {
    if (!name.endsWith('.json')) continue;
    const attempt = getAttempt(project, name.slice(0, -'.json'.length));
    if (attempt && attempt.change === change && moved.has(attempt.taskId)) {
      rows.push({ attemptId: attempt.id, to: moved.get(attempt.taskId) });
    }
  }
  return rows;
}

/** Item files are written before any file is removed, so a crash never leaves the change without items. */
function runRenumberJournal(project, journal, hooks = {}) {
  journal.items.forEach((item, index) => {
    upsertWorkItem(project, item);
    hooks.afterWrite?.(index);
  });
  for (const id of journal.removeIds) removeWorkItemFile(project, journal.change, id);
  for (const { attemptId, to } of journal.retargets) {
    const attempt = getAttempt(project, attemptId);
    if (!attempt || attempt.taskId === to) continue;
    writeText(
      path.join(attemptsRoot(project), `${attemptId}.json`),
      JSON.stringify({ ...attempt, taskId: to, updatedAt: new Date().toISOString() }, null, 2),
    );
  }
  const file = renumberJournalPath(project, journal.change);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function finishPendingRenumber(project, change) {
  if (!change || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(change)) return;
  const file = renumberJournalPath(project, change);
  if (!fs.existsSync(file)) return;
  runRenumberJournal(project, JSON.parse(readText(file)));
}

export function writeNewWorkItem(project, change, task) {
  const classified = classifyTask({
    id: task.id,
    title: task.title,
    body: task.title,
    factory: task.factory,
    routeDefault: task.changeRoute,
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
    provenance: provenanceForTitle(task.title),
  });
}

function finishSync(project, change, created, skipped, drift = []) {
  writeText(
    path.join(project, '.factory', 'active-change.json'),
    JSON.stringify({ change, updatedAt: new Date().toISOString() }, null, 2),
  );
  ledger(project, 'sync-tasks', { change, created, skipped });
  return { created, skipped, change, drift };
}

function itemNormalizedText(item) {
  return itemText(item);
}

function unmatchedPreviousIds(tasks, existing) {
  const currentTexts = new Set(tasks.map((task) => normalizeTaskText(task.title)));
  return existing
    .filter((item) => !currentTexts.has(itemNormalizedText(item)))
    .map((item) => item.id);
}

function unmatchedCurrentIds(tasks, existing) {
  const previousTexts = new Set(existing.map((item) => itemNormalizedText(item)));
  return tasks
    .filter((task) => !previousTexts.has(normalizeTaskText(task.title)))
    .map((task) => task.id);
}

function reconciliationError(change, previousIds, currentIds) {
  const prev = [...new Set(previousIds)].sort().join(', ') || '(none)';
  const curr = [...new Set(currentIds)].sort().join(', ') || '(none)';
  return new BlockedError(
    `Reconciliation failed for change ${change}: `
    + `unmatched previous checkbox ids: ${prev}; `
    + `unmatched current checkbox ids: ${curr}. `
    + `Run idefactory sync-tasks ${change} --plan to preview the decisions needed.`,
    'reconciliation-required',
    { change },
  );
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
  const text = renderPacket({ role, item, modelProfile, project });
  ledger(project, 'next', { role, change: item.change, task: item.id });
  return { empty: false, text, role, task: item, item };
}

function selectAcrossChanges(project) {
  const items = listWorkItems(project);
  return items.find((item) => item.status === 'todo' && (!item.dependencies || !item.dependencies.length))
    || items.find((item) => item.status === 'todo')
    || null;
}

function standingBlock(project, item) {
  const text = standingDecisionsText(project, item);
  return text ? `\n${text}` : '';
}

function renderPacket({ role, item, modelProfile, project }) {
  const criteria = (item.acceptanceCriteria || []).map((entry) => `- ${entry}`).join('\n');
  const roles = (item.factory?.roles || []).join(', ');
  const prior = priorRejectionBlock(project, item, role) + redExceptionBlock(project, item, role) + methodBlock(project, item, role) + reopenBlock(project, item, role) + acceptedBaselineBlock(project, item, role) + standingBlock(project, item);
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
${requirementLines(project, item)}Task class: ${taskClassOf(item)}
Red required for: ${redRequiredKinds(project, item).join(', ') || 'none'}

Description:
openspec-task: ${item.id}

Change: openspec/changes/${item.change}/tasks.md

${item.title}

Acceptance criteria:
${criteria || '- (see the task)'}
${prior}
Method:
- Prefer common scaffolds and libraries over hand-rolled toolchains (for example npm create vite@latest for a SPA).
- Write a failing test before production code only for the kinds listed under Red required for. A human-authorized red exception satisfies a kind in place of a red.
- If a failing test cannot specify the change and the task class was inferred, record a no-red method with idefactory method propose before editing (docs-or-text, configuration, behavior-preserving, mechanical, or exploratory). The reviewer must accept it.
- Record evidence on the attempt via idefactory attempt transition. Pass JSON evidence with --evidence-file <path> to a temporary file outside the project, or --evidence <json> inline, never both.
- Print the resolved requirement set with idefactory requirements ${item.change} ${item.id}.
- Run verification profile checks before claiming done.
- Review is a different role: reviewer. The implementer does not approve their own work.
- Finalize with idefactory complete ${item.change} ${item.id} --attempt <id>.

The IDE session model does the work. Do not start a model process.
`;
}

function priorRejectionBlock(project, item, role) {
  if (!project || role === 'reviewer' || role === 'security-reviewer' || role === 'scribe') return '';
  const notes = priorRejections(project, item.change, item.id);
  if (notes.length === 0) return '';
  return `\nPrior rejections:\n${notes.join('\n')}\n`;
}

function taskClassOf(item) {
  return item.factory?.taskType === 'lightweight' ? 'lightweight' : 'code';
}

function currentAttempt(project, item) {
  return project && item.attemptId ? getAttempt(project, item.attemptId) : null;
}

function redRequiredKinds(project, item) {
  if (taskClassOf(item) === 'lightweight') return [];
  const kinds = redKindsFor(project, item);
  const attempt = currentAttempt(project, item);
  if (!attempt) return kinds;
  const covered = new Set(methodCoveredKinds(project, attempt));
  return kinds.filter((kind) => !covered.has(kind));
}

function methodBlock(project, item, role) {
  const attempt = currentAttempt(project, item);
  const row = attempt ? describeAttemptMethod(project, attempt) : null;
  if (!row) return '';
  const lines = [describeMethod(row), ...describeCoverage(row)];
  if (role === 'reviewer' || role === 'security-reviewer') {
    lines.push(
      `Record a method review: idefactory method review ${row.attemptId} --verdict ACCEPT|REJECT --reviewer <id> --note "text". `
      + 'Reject the method when its reason class does not fit the diff.',
    );
  } else if (!row.review) {
    lines.push('A different role must record a method review before this attempt can be accepted.');
  }
  return `\nRed method:\n${lines.map((line) => `- ${line}`).join('\n')}\n`;
}

function acceptedBaselineBlock(project, item, role) {
  if (!project || (role !== 'reviewer' && role !== 'security-reviewer')) return '';
  const baseline = latestRunSession(project, item.change)?.testBaseline;
  if (baseline?.result !== 'accepted') return '';
  return `\nAccepted baseline (a failing baseline the run accepted for this HEAD only):\n- HEAD: ${baseline.sourceRevision}\n- Reason: ${baseline.reason || '(none recorded)'}\n- Accepted at: ${baseline.acceptedAt || 'unknown'}\n`;
}

function reopenBlock(project, item, role) {
  if (role !== 'reviewer' && role !== 'security-reviewer') return '';
  const attempt = currentAttempt(project, item);
  const lines = attempt ? describeReopens(attempt) : [];
  if (lines.length === 0) return '';
  return `\nReopened attempt (the earlier verdict does not cover the amended evidence):\n${lines.map((line) => `- ${line}`).join('\n')}\n`;
}

function requirementLines(project, item) {
  if (!project) return '';
  const { checks, problems } = resolveRequirements(project, item);
  const listed = checks.map((entry) => `${entry.kind} (${entry.sources.join(', ')})`).join(', ');
  const lines = [`Required checks: ${listed || 'none'}`];
  if (problems.length) {
    lines.push('Requirement problems (no attempt can start until fixed):', ...describeProblems(problems));
  }
  return `${lines.join('\n')}\n`;
}

function redExceptionBlock(project, item, role) {
  if (!project || (role !== 'reviewer' && role !== 'security-reviewer')) return '';
  const root = attemptsRoot(project);
  if (!fs.existsSync(root)) return '';
  const lines = [];
  for (const name of fs.readdirSync(root).sort()) {
    if (!name.endsWith('.json')) continue;
    const attempt = getAttempt(project, name.slice(0, -'.json'.length));
    if (!attempt || attempt.change !== item.change || attempt.taskId !== item.id) continue;
    for (const row of listAttemptExceptions(project, attempt)) lines.push(`- ${describeException(row)}`);
  }
  return lines.length ? `\nRed exceptions:\n${lines.join('\n')}\n` : '';
}

function priorRejections(project, change, taskId) {
  const root = attemptsRoot(project);
  if (!fs.existsSync(root)) return [];
  const rows = [];
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith('.json')) continue;
    const attempt = getAttempt(project, name.slice(0, -'.json'.length));
    if (!attempt || attempt.change !== change || attempt.taskId !== taskId || !attempt.id) continue;
    const reviewReject = attempt.state === 'rejected' || attempt.evidence?.review?.verdict === 'REJECT';
    const securityReject = attempt.evidence?.securityReview?.verdict === 'REJECT';
    if (!reviewReject && !securityReject) continue;
    rows.push(attempt);
  }
  rows.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const lines = [];
  for (const attempt of rows) {
    if (attempt.state === 'rejected' || attempt.evidence?.review?.verdict === 'REJECT') {
      lines.push(`- ${attempt.id}: ${attempt.evidence?.review?.notes || ''}`);
    }
    if (attempt.evidence?.securityReview?.verdict === 'REJECT') {
      const note = attempt.evidence.securityReview.notes || attempt.evidence.securityReview.verdict;
      lines.push(`- ${attempt.id} security review: ${note}`);
    }
  }
  return lines;
}

function primaryRole(item) {
  if (item.factory?.route === 'quick') return 'engineer';
  const roles = item.factory?.roles || [];
  if (roles.includes('architect')) return 'architect';
  const implementer = roles.find((role) => !['reviewer', 'scribe', 'security-reviewer', 'test-engineer'].includes(role));
  return implementer || 'engineer';
}

export function renderWorkPacket(project, item, role) {
  return renderPacket({
    role,
    item,
    modelProfile: 'coding-standard',
    project,
  });
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

export { haltError };
