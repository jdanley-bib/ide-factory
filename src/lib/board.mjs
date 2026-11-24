import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runAzJson } from './azure-cli.mjs';
import { appendControlEvent } from './event-log.mjs';
import { hasActiveLockout } from './govern.mjs';
import { readBoardConfig } from './integration-config.mjs';
import { halted, readText, writeText } from './layout.mjs';
import { createPlan, mcpOrgName } from './mcp-plan.mjs';
import { readPullRequestRecord } from './pull-request.mjs';
import { latestRunSession } from './run-session.mjs';
import { listWorkItems } from './work.mjs';

const CHANGE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** Board states the agent may request, keyed by CLI name. */
export const AGENT_TRANSITIONS = {
  'in-progress': 'inProgress',
  waiting: 'waiting',
  blocked: 'blocked',
  'in-review': 'inReview',
  'ready-for-human-review': 'readyForHumanReview',
};

const BLOCKING_STOPS = new Set(['rejected', 'blocked', 'lockout']);
const NON_WAITING_STOPS = new Set(['all-done', 'needs-agent']);
const HALT_MESSAGE = 'HALT file present. Factory commands are stopped. Remove it with idefactory resume.';

export function boardRecordPath(project, change) {
  return path.join(project, '.factory', 'boards', `${change}.json`);
}

function boardRecordRelative(change) {
  return `.factory/boards/${change}.json`;
}

export function readBoardRecord(project, change) {
  const file = boardRecordPath(project, change);
  if (!fs.existsSync(file)) return null;
  try {
    const record = JSON.parse(readText(file));
    if (record?.change !== change || !Number.isInteger(record?.workItem?.id)) return null;
    return {
      comments: [],
      claims: [],
      linkedPullRequests: [],
      ...record,
    };
  } catch {
    return null;
  }
}

function writeBoardRecord(project, record) {
  writeText(boardRecordPath(project, record.change), `${JSON.stringify(record, null, 2)}\n`);
}

export function requireBoardConfig(project) {
  const board = readBoardConfig(project);
  if (!board) throw new Error('board is not configured. Run idefactory board configure --organization <url> --project <name>.');
  return board;
}

export function assertChangeName(change, usage) {
  const name = String(change || '').trim();
  if (!CHANGE_NAME.test(name)) throw new Error(usage);
  return name;
}

export function changeDir(project, change) {
  return path.join(project, 'openspec', 'changes', change);
}

function requireRecord(project, change) {
  const record = readBoardRecord(project, change);
  if (!record) throw new Error(`No board record for ${change}. Run idefactory board publish ${change}.`);
  return record;
}

export function workItemUrl(board, id) {
  return `${board.organization}/${encodeURIComponent(board.project)}/_workitems/edit/${id}`;
}

export function showWorkItem(project, board, id, env) {
  return runAzJson(project, [
    'boards', 'work-item', 'show',
    '--id', String(id),
    '--org', board.organization,
    '--output', 'json',
  ], env, env.IDEFACTORY_BOARD);
}

/**
 * One `az boards work-item update` call. Fields go last because the Azure
 * CLI reads them as a space-separated list.
 */
export function updateWorkItem(project, board, id, { state, description, discussion, fields } = {}, env) {
  const argv = ['boards', 'work-item', 'update', '--id', String(id), '--org', board.organization];
  if (state) argv.push('--state', state);
  if (description) argv.push('--description', description);
  if (discussion) argv.push('--discussion', discussion);
  const pairs = Object.entries(fields || {}).filter(([, value]) => value !== undefined && value !== '');
  if (pairs.length) argv.push('--fields', ...pairs.map(([key, value]) => `${key}=${value}`));
  argv.push('--output', 'json');
  return runAzJson(project, argv, env, env.IDEFACTORY_BOARD);
}

function digest(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

/**
 * Board writes are described once as neutral operations:
 *   { op: 'create', title, description, fields }
 *   { op: 'update', id, state?, description?, comment?, fields?, rev? }
 *   { op: 'comment', id, text }
 *   { op: 'link', id, url }
 * The `az` transport runs them through the Azure CLI. The `mcp` transport turns
 * them into Azure DevOps MCP operations for the agent to apply.
 */
function runAzOperation(project, board, operation, env) {
  if (operation.op === 'create') {
    const fields = Object.entries(operation.fields).map(([key, value]) => `${key}=${value}`);
    return runAzJson(project, [
      'boards', 'work-item', 'create',
      '--org', board.organization,
      '--project', board.project,
      '--type', board.workItemType,
      '--title', operation.title,
      '--description', operation.description,
      '--fields', ...fields,
      '--output', 'json',
    ], env, env.IDEFACTORY_BOARD);
  }
  if (operation.op === 'update') {
    return updateWorkItem(project, board, operation.id, {
      state: operation.state,
      description: operation.description,
      discussion: operation.comment,
      fields: operation.fields,
    }, env);
  }
  if (operation.op === 'comment') {
    return updateWorkItem(project, board, operation.id, { discussion: operation.text }, env);
  }
  return runAzJson(project, [
    'boards', 'work-item', 'relation', 'add',
    '--id', String(operation.id),
    '--relation-type', 'Hyperlink',
    '--target-url', operation.url,
    '--org', board.organization,
    '--output', 'json',
  ], env, env.IDEFACTORY_BOARD);
}

function toMcpOperations(board, operation) {
  const base = { orgName: mcpOrgName(board.organization), project: board.project };
  if (operation.op === 'create') {
    return [{
      tool: 'wit_work_item_write',
      arguments: {
        action: 'create',
        ...base,
        workItemType: board.workItemType,
        fields: [
          { name: 'System.Title', value: operation.title },
          { name: 'System.Description', value: operation.description, format: 'Html' },
          ...Object.entries(operation.fields).map(([name, value]) => ({ name, value })),
        ],
      },
    }];
  }
  if (operation.op === 'update') {
    const updates = [];
    if (operation.rev) updates.push({ op: 'Test', path: '/rev', value: operation.rev });
    if (operation.state) updates.push({ op: 'Add', path: '/fields/System.State', value: operation.state });
    if (operation.description) {
      updates.push({ op: 'Add', path: '/fields/System.Description', value: operation.description, format: 'Html' });
    }
    for (const [name, value] of Object.entries(operation.fields || {})) {
      if (value !== undefined && value !== '') updates.push({ op: 'Add', path: `/fields/${name}`, value });
    }
    const out = [];
    if (updates.length) {
      out.push({
        tool: 'wit_work_item_write',
        arguments: { action: 'update', ...base, id: operation.id, updates },
      });
    }
    if (operation.comment) {
      out.push({
        tool: 'wit_work_item_comment_write',
        arguments: { action: 'add', ...base, workItemId: operation.id, comment: operation.comment },
      });
    }
    return out;
  }
  if (operation.op === 'comment') {
    return [{
      tool: 'wit_work_item_comment_write',
      arguments: { action: 'add', ...base, workItemId: operation.id, comment: operation.text },
    }];
  }
  return [{
    tool: 'wit_work_item_link_write',
    arguments: { action: 'link', ...base, id: operation.id, linkType: 'hyperlink', url: operation.url },
  }];
}

/**
 * Apply one unit of board work: operations plus the record to store afterward.
 * `az` runs the operations now. `mcp` saves a plan and stores the record at ack.
 * @returns {{ applied: boolean, record: object, plan: object|null }}
 */
function commitBoardWork(project, board, env, { kind, change, operations, record, events = [], createsWorkItem = false }) {
  if (board.transport === 'az') {
    let next = record;
    for (const operation of operations) {
      const result = runAzOperation(project, board, operation, env);
      if (operation.op === 'create') {
        const id = Number(result?.id);
        if (!Number.isInteger(id) || id <= 0) throw new Error('az boards work-item create did not return an id');
        next = { ...record, workItem: { id, url: workItemUrl(board, id) } };
      }
    }
    writeBoardRecord(project, next);
    for (const event of events) appendControlEvent(project, event);
    return { applied: true, record: next, plan: null };
  }
  const mcpOperations = operations.flatMap((operation) => toMcpOperations(board, operation));
  if (mcpOperations.length === 0) {
    writeBoardRecord(project, record);
    for (const event of events) appendControlEvent(project, event);
    return { applied: true, record, plan: null };
  }
  const plan = createPlan(project, {
    kind,
    change,
    operations: mcpOperations,
    effects: {
      writes: [{ path: boardRecordRelative(change), json: record }],
      events,
      ...(createsWorkItem
        ? {
          bind: [{
            result: 'workItemId',
            write: 0,
            pointer: ['workItem', 'id'],
            urlPointer: ['workItem', 'url'],
            urlTemplate: workItemUrl(board, '{id}').replace('%7Bid%7D', '{id}'),
          }],
        }
        : {}),
    },
  });
  return { applied: false, record, plan };
}

function newRecord(board, change, workItemId, extra = {}) {
  return {
    schemaVersion: 1,
    change,
    provider: board.provider,
    workItem: workItemId ? { id: workItemId, url: workItemUrl(board, workItemId) } : { id: null, url: null },
    state: 'new',
    descriptionDigest: null,
    comments: [],
    claims: [],
    linkedPullRequests: [],
    ...extra,
  };
}

/**
 * Create the story for a change once; later calls update its description.
 * @param {string} project
 * @param {string} change
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ record: object, created: boolean, updated: boolean, applied: boolean, plan: object|null }}
 */
export function publishBoard(project, change, env = process.env) {
  if (halted(project)) throw new Error(HALT_MESSAGE);
  const board = requireBoardConfig(project);
  const name = assertChangeName(change, 'Usage: idefactory board publish <change>');
  if (!fs.existsSync(changeDir(project, name))) {
    throw new Error(`OpenSpec change not found: openspec/changes/${name}/`);
  }
  const description = renderStoryDescription(project, name);
  const descriptionDigest = digest(description);
  const existing = readBoardRecord(project, name);

  if (!existing) {
    const record = { ...newRecord(board, name, null), descriptionDigest };
    const work = commitBoardWork(project, board, env, {
      kind: 'board-publish',
      change: name,
      operations: [{
        op: 'create',
        title: name,
        description,
        fields: { 'System.Tags': board.tag, [board.changeField]: name },
      }],
      record,
      createsWorkItem: true,
    });
    return { ...work, created: true, updated: false };
  }

  if (existing.descriptionDigest === descriptionDigest) {
    return { record: existing, created: false, updated: false, applied: true, plan: null };
  }
  const work = commitBoardWork(project, board, env, {
    kind: 'board-publish',
    change: name,
    operations: [{
      op: 'update',
      id: existing.workItem.id,
      description,
      fields: { [board.changeField]: name },
    }],
    record: { ...existing, descriptionDigest },
  });
  return { ...work, created: false, updated: true };
}

function planComment(record, { text, key }) {
  const commentKey = key || digest(text);
  if (record.comments.includes(commentKey)) return null;
  return {
    operations: [{ op: 'comment', id: record.workItem.id, text }],
    record: { ...record, comments: [...record.comments, commentKey] },
  };
}

function planTransition(board, record, { to, note, fields, rev }) {
  const stateKey = AGENT_TRANSITIONS[to];
  if (!stateKey) {
    throw new Error(`board transition --to must be one of ${Object.keys(AGENT_TRANSITIONS).join(', ')}`);
  }
  return {
    operations: [{
      op: 'update',
      id: record.workItem.id,
      state: board.states[stateKey],
      comment: typeof note === 'string' && note.trim() ? note.trim() : '',
      fields,
      rev,
    }],
    record: { ...record, state: to },
  };
}

/**
 * Post one comment per key.
 * @returns {{ record: object, posted: boolean, applied: boolean, plan: object|null }}
 */
export function commentBoard(project, change, { message, key } = {}, env = process.env) {
  const board = requireBoardConfig(project);
  const usage = 'Usage: idefactory board comment <change> --message "text" [--key key]';
  const name = assertChangeName(change, usage);
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) throw new Error(usage);
  const record = requireRecord(project, name);
  const planned = planComment(record, { text, key: typeof key === 'string' ? key.trim() : '' });
  if (!planned) return { record, posted: false, applied: true, plan: null };
  const work = commitBoardWork(project, board, env, { kind: 'board-comment', change: name, ...planned });
  return { ...work, posted: true };
}

/**
 * Move the story to one of the agent states. Never to ready, new, or done.
 * @returns {{ record: object, applied: boolean, plan: object|null }}
 */
export function transitionBoard(project, change, { to, note, fields } = {}, env = process.env) {
  const board = requireBoardConfig(project);
  const name = assertChangeName(change, 'Usage: idefactory board transition <change> --to <state>');
  if (!AGENT_TRANSITIONS[to]) {
    throw new Error(`board transition --to must be one of ${Object.keys(AGENT_TRANSITIONS).join(', ')}`);
  }
  const record = requireRecord(project, name);
  const planned = planTransition(board, record, { to, note, fields });
  return commitBoardWork(project, board, env, { kind: 'board-transition', change: name, ...planned });
}

/**
 * Factory state as a board state key plus the reason shown to humans.
 * @returns {{ to: string, reason: string, pullRequest: object|null }}
 */
export function mirroredState(project, change) {
  const items = listWorkItems(project, change);
  const pr = readPullRequestRecord(project, change);
  if (halted(project)) return { to: 'blocked', reason: 'Factory stopped: HALT is present.', pullRequest: pr };
  if (hasActiveLockout(project)) {
    return { to: 'blocked', reason: 'Factory stopped: an active reviewer lockout needs a human resolver.', pullRequest: pr };
  }
  const allDone = items.length > 0 && items.every((item) => item.status === 'done');
  if (pr && allDone) {
    return { to: 'ready-for-human-review', reason: `Pull request ready for human review: ${pr.pullRequest.url}`, pullRequest: pr };
  }
  if (pr) return { to: 'in-review', reason: `Pull request open: ${pr.pullRequest.url}`, pullRequest: pr };
  const session = latestRunSession(project, change);
  const stop = session?.status === 'closed' ? session.stopReason : null;
  if (stop && BLOCKING_STOPS.has(stop)) {
    return { to: 'blocked', reason: `Run stopped (${stop}). A human needs to look at this change.`, pullRequest: null };
  }
  if (stop && !NON_WAITING_STOPS.has(stop)) {
    return { to: 'waiting', reason: `Run stopped (${stop}). A human decision is needed before the factory continues.`, pullRequest: null };
  }
  return { to: 'in-progress', reason: '', pullRequest: null };
}

/**
 * Post newly done tasks, mirror the factory state, and link the pull request once.
 * @returns {{ record: object, posted: string[], state: string, applied: boolean, plan: object|null }}
 */
export function reportBoard(project, change, env = process.env) {
  const board = requireBoardConfig(project);
  const name = assertChangeName(change, 'Usage: idefactory board report <change>');
  let record = requireRecord(project, name);
  const operations = [];
  const posted = [];
  const items = listWorkItems(project, name)
    .filter((item) => item.status === 'done' && item.attemptId)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  for (const item of items) {
    const key = `task:${item.id}:${item.attemptId}`;
    const planned = planComment(record, {
      text: `Factory task ${item.id} done. Attempt ${item.attemptId}.`,
      key,
    });
    if (!planned) continue;
    operations.push(...planned.operations);
    record = planned.record;
    posted.push(item.id);
  }

  const mirror = mirroredState(project, name);
  if (mirror.to !== record.state) {
    const planned = planTransition(board, record, { to: mirror.to, note: mirror.reason });
    operations.push(...planned.operations);
    record = planned.record;
  }
  const prUrl = mirror.pullRequest?.pullRequest?.url;
  if (prUrl && !record.linkedPullRequests.includes(prUrl)) {
    operations.push({ op: 'link', id: record.workItem.id, url: prUrl });
    record = { ...record, linkedPullRequests: [...record.linkedPullRequests, prUrl] };
  }
  if (operations.length === 0) {
    return { record, posted, state: record.state, applied: true, plan: null };
  }
  const work = commitBoardWork(project, board, env, { kind: 'board-report', change: name, operations, record });
  return { ...work, posted, state: record.state };
}

const SKIP_STATES = new Set(['in-progress', 'in-review', 'ready-for-human-review']);
const RESUME_STATES = new Set(['waiting', 'blocked']);

function storyTags(fields) {
  return String(fields?.['System.Tags'] || '')
    .split(';')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The story as `wit_work_item get` returned it, saved to a file by the agent.
 * Accepts the bare work item, `{ workItem }`, or a one-element list.
 */
export function readWorkItemSnapshot(file) {
  let raw;
  try {
    raw = JSON.parse(readText(file));
  } catch (error) {
    throw new Error(`cannot read work item snapshot ${file}: ${error.message}`);
  }
  let item = raw;
  if (Array.isArray(raw)) [item] = raw;
  else if (raw?.workItem) item = raw.workItem;
  else if (Array.isArray(raw?.value)) [item] = raw.value;
  if (!item || typeof item !== 'object' || !item.fields || typeof item.fields !== 'object') {
    throw new Error(`work item snapshot ${file} has no fields. Save the wit_work_item get result unchanged.`);
  }
  return item;
}

function loadWorkItem(project, board, workItemId, { snapshot }, env) {
  if (board.transport === 'az') return showWorkItem(project, board, workItemId, env);
  if (!snapshot) {
    throw new Error(
      `board claim needs --snapshot <file> with the story. Run wit_work_item with action get, id ${workItemId}, orgName ${mcpOrgName(board.organization)}, and save the result to a file.`,
    );
  }
  const item = readWorkItemSnapshot(snapshot);
  if (item.id !== undefined && Number(item.id) !== workItemId) {
    throw new Error(`snapshot is work item ${item.id}, not ${workItemId}`);
  }
  return item;
}

/**
 * Decide whether a cloud run begins for a story a human moved to the ready state.
 * `not-ready` and `duplicate` write nothing.
 * With the `mcp` transport the result carries a `plan` the agent applies, then acknowledges.
 * @param {string} project
 * @param {string} change
 * @param {{ workItem: string|number, revision?: string|number, runUrl?: string, snapshot?: string }} options
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ decision: string, reason: string, change: string, workItemId: number, revision: number, next: string|null, plan: object|null }}
 */
export function claimBoard(project, change, { workItem, revision, runUrl, snapshot } = {}, env = process.env) {
  const usage = 'Usage: idefactory board claim <change> --work-item <id> [--snapshot <file>] [--revision N] [--run-url <url>] [--json]';
  const board = requireBoardConfig(project);
  const name = assertChangeName(change, usage);
  const workItemId = Number(workItem);
  if (!Number.isInteger(workItemId) || workItemId <= 0) throw new Error(usage);
  if (!fs.existsSync(changeDir(project, name))) {
    throw new Error(`OpenSpec change not found: openspec/changes/${name}/`);
  }
  let record = readBoardRecord(project, name);
  if (record && record.workItem.id !== workItemId) {
    throw new Error(`${name} is published as work item ${record.workItem.id}, not ${workItemId}`);
  }

  const item = loadWorkItem(project, board, workItemId, { snapshot }, env);
  const fields = item?.fields || {};
  const named = String(fields[board.changeField] || '').trim();
  if (named !== name) {
    throw new Error(`work item ${workItemId} ${board.changeField} is "${named}", not ${name}`);
  }
  if (!storyTags(fields).includes(String(board.tag).toLowerCase())) {
    throw new Error(`work item ${workItemId} is missing the ${board.tag} tag`);
  }
  const currentRevision = Number(item?.rev ?? fields['System.Rev']);
  const claimedRevision = revision !== undefined && revision !== true && String(revision).trim() !== ''
    ? Number(revision)
    : currentRevision;
  if (!Number.isInteger(claimedRevision) || claimedRevision <= 0) {
    throw new Error(`work item ${workItemId} has no usable revision`);
  }
  if (board.transport !== 'az' && !(Number.isInteger(currentRevision) && currentRevision > 0)) {
    throw new Error(`work item ${workItemId} snapshot has no rev. Save the wit_work_item get result unchanged.`);
  }
  const testRevision = board.transport === 'az' ? undefined : currentRevision;
  const result = (decision, reason, next = null, plan = null) => ({
    decision,
    reason,
    change: name,
    workItemId,
    revision: claimedRevision,
    next,
    plan,
  });

  if (fields['System.State'] !== board.states.ready) {
    return result('not-ready', `Work item state is "${fields['System.State'] || ''}", not "${board.states.ready}".`);
  }
  if (record?.claims.some((entry) => entry.revision === claimedRevision)) {
    return result('duplicate', `Revision ${claimedRevision} was already claimed.`);
  }

  if (!record) record = newRecord(board, name, workItemId);

  const priorState = record.state;
  let decision;
  let reason;
  let next = null;
  let planned;
  if (halted(project)) {
    decision = 'halted';
    reason = 'HALT is present. A human must remove it with idefactory resume.';
    planned = planTransition(board, record, {
      to: 'blocked',
      note: `Factory did not begin ${name}: HALT is present. A human must remove it with idefactory resume, then move this story to ${board.states.ready}.`,
      rev: testRevision,
    });
  } else if (SKIP_STATES.has(priorState)) {
    decision = 'skip';
    reason = `The factory already recorded ${priorState} for this change.`;
    planned = planTransition(board, record, {
      to: priorState,
      note: `Factory is already working on ${name} (${priorState}). This move to ${board.states.ready} was ignored. To resume after a stop, move the story to ${board.states.waiting} first.`,
      rev: testRevision,
    });
  } else {
    const resume = RESUME_STATES.has(priorState);
    next = `idefactory run --change ${name} --until human-gate${resume ? ' --new-run' : ''}`;
    decision = resume ? 'resume' : 'start';
    reason = resume
      ? `A human returned the story to ${board.states.ready} after ${priorState}.`
      : 'First claim for this change.';
    const lines = [
      `Factory ${resume ? 'resumed' : 'claimed'} ${name}.`,
      `Branch: factory/${name}`,
    ];
    if (runUrl) lines.push(`Run: ${runUrl}`);
    planned = planTransition(board, record, {
      to: 'in-progress',
      note: lines.join('\n'),
      fields: {
        [board.branchField]: `factory/${name}`,
        ...(runUrl ? { [board.runUrlField]: runUrl } : {}),
      },
      rev: testRevision,
    });
  }

  const claimedRecord = {
    ...planned.record,
    claims: [...planned.record.claims, {
      revision: claimedRevision,
      decision,
      at: new Date().toISOString(),
      ...(runUrl ? { runUrl } : {}),
    }],
  };
  const work = commitBoardWork(project, board, env, {
    kind: 'board-claim',
    change: name,
    operations: planned.operations,
    record: claimedRecord,
    events: [{
      type: 'board-claim',
      time: new Date().toISOString(),
      change: name,
      workItemId,
      revision: claimedRevision,
      decision,
    }],
  });
  return result(decision, reason, next, work.plan);
}

/**
 * HTML story description from the proposal's Why and What Changes sections
 * and the task checkboxes. Azure DevOps stores System.Description as HTML.
 */
export function renderStoryDescription(project, change) {
  const root = changeDir(project, change);
  const parts = [];
  const proposalFile = path.join(root, 'proposal.md');
  if (fs.existsSync(proposalFile)) {
    const sections = markdownSections(readText(proposalFile));
    for (const title of ['Why', 'What Changes']) {
      if (sections[title]) parts.push(`<h2>${escapeHtml(title)}</h2>`, markdownToHtml(sections[title]));
    }
  }
  const tasksFile = path.join(root, 'tasks.md');
  if (fs.existsSync(tasksFile)) {
    const tasks = [];
    for (const line of readText(tasksFile).split('\n')) {
      const match = line.match(/^- \[( |x|X)\]\s+(\S+)\s+(.*)$/);
      if (!match) continue;
      const mark = match[1] === ' ' ? '[ ]' : '[x]';
      const title = match[3].length > 240 ? `${match[3].slice(0, 237)}...` : match[3];
      tasks.push(`<li>${mark} ${escapeHtml(match[2])} ${inlineHtml(title)}</li>`);
    }
    if (tasks.length) parts.push('<h2>Tasks</h2>', `<ul>${tasks.join('')}</ul>`);
  }
  parts.push(`<p>OpenSpec change: <code>${escapeHtml(change)}</code>. Edit the OpenSpec change and run <code>idefactory board publish ${escapeHtml(change)}</code>. Edits made here are overwritten.</p>`);
  return parts.join('\n');
}

function markdownSections(text) {
  const sections = {};
  let current = null;
  for (const line of text.split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1];
      sections[current] = '';
      continue;
    }
    if (/^#\s/.test(line)) {
      current = null;
      continue;
    }
    if (current) sections[current] += `${line}\n`;
  }
  return sections;
}

function markdownToHtml(text) {
  const out = [];
  let list = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${inlineHtml(paragraph.join(' '))}</p>`);
    if (list.length) out.push(`<ul>${list.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</ul>`);
    paragraph = [];
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (paragraph.length) flush();
      list.push(bullet[1]);
      continue;
    }
    const heading = line.match(/^#{3,6}\s+(.*)$/);
    if (heading) {
      flush();
      out.push(`<h3>${inlineHtml(heading[1])}</h3>`);
      continue;
    }
    if (list.length) flush();
    paragraph.push(line);
  }
  flush();
  return out.join('\n');
}

function inlineHtml(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
