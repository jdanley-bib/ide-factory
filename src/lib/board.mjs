import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runAzJson } from './azure-cli.mjs';
import { appendControlEvent } from './event-log.mjs';
import { hasActiveLockout } from './govern.mjs';
import { readBoardConfig } from './integration-config.mjs';
import { halted, readText, writeText } from './layout.mjs';
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
 * Create the story for a change once; later calls update its description.
 * @param {string} project
 * @param {string} change
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ record: object, created: boolean, updated: boolean }}
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
    const created = runAzJson(project, [
      'boards', 'work-item', 'create',
      '--org', board.organization,
      '--project', board.project,
      '--type', board.workItemType,
      '--title', name,
      '--description', description,
      '--fields', `System.Tags=${board.tag}`, `${board.changeField}=${name}`,
      '--output', 'json',
    ], env, env.IDEFACTORY_BOARD);
    const id = Number(created?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('az boards work-item create did not return an id');
    const record = {
      schemaVersion: 1,
      change: name,
      provider: board.provider,
      workItem: { id, url: workItemUrl(board, id) },
      state: 'new',
      descriptionDigest,
      comments: [],
      claims: [],
      linkedPullRequests: [],
    };
    writeBoardRecord(project, record);
    return { record, created: true, updated: false };
  }

  if (existing.descriptionDigest === descriptionDigest) {
    return { record: existing, created: false, updated: false };
  }
  updateWorkItem(project, board, existing.workItem.id, {
    description,
    fields: { [board.changeField]: name },
  }, env);
  const record = { ...existing, descriptionDigest };
  writeBoardRecord(project, record);
  return { record, created: false, updated: true };
}

/**
 * Post one comment per key.
 * @returns {{ record: object, posted: boolean }}
 */
export function commentBoard(project, change, { message, key } = {}, env = process.env) {
  const board = requireBoardConfig(project);
  const name = assertChangeName(change, 'Usage: idefactory board comment <change> --message "text" [--key key]');
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) throw new Error('Usage: idefactory board comment <change> --message "text" [--key key]');
  const record = requireRecord(project, name);
  const commentKey = typeof key === 'string' && key.trim() ? key.trim() : digest(text);
  if (record.comments.includes(commentKey)) return { record, posted: false };
  updateWorkItem(project, board, record.workItem.id, { discussion: text }, env);
  const next = { ...record, comments: [...record.comments, commentKey] };
  writeBoardRecord(project, next);
  return { record: next, posted: true };
}

/**
 * Move the story to one of the agent states. Never to ready, new, or done.
 * @returns {{ record: object }}
 */
export function transitionBoard(project, change, { to, note, fields } = {}, env = process.env) {
  const board = requireBoardConfig(project);
  const name = assertChangeName(change, 'Usage: idefactory board transition <change> --to <state>');
  const stateKey = AGENT_TRANSITIONS[to];
  if (!stateKey) {
    throw new Error(`board transition --to must be one of ${Object.keys(AGENT_TRANSITIONS).join(', ')}`);
  }
  const record = requireRecord(project, name);
  const discussion = typeof note === 'string' && note.trim() ? note.trim() : '';
  updateWorkItem(project, board, record.workItem.id, {
    state: board.states[stateKey],
    discussion,
    fields,
  }, env);
  const next = { ...record, state: to };
  writeBoardRecord(project, next);
  return { record: next };
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
 * @returns {{ record: object, posted: string[], state: string }}
 */
export function reportBoard(project, change, env = process.env) {
  const board = requireBoardConfig(project);
  const name = assertChangeName(change, 'Usage: idefactory board report <change>');
  let record = requireRecord(project, name);
  const posted = [];
  const items = listWorkItems(project, name)
    .filter((item) => item.status === 'done' && item.attemptId)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  for (const item of items) {
    const key = `task:${item.id}:${item.attemptId}`;
    if (record.comments.includes(key)) continue;
    const result = commentBoard(project, name, {
      message: `Factory task ${item.id} done. Attempt ${item.attemptId}.`,
      key,
    }, env);
    record = result.record;
    posted.push(item.id);
  }

  const mirror = mirroredState(project, name);
  if (mirror.to !== record.state) {
    record = transitionBoard(project, name, { to: mirror.to, note: mirror.reason }, env).record;
  }
  const prUrl = mirror.pullRequest?.pullRequest?.url;
  if (prUrl && !record.linkedPullRequests.includes(prUrl)) {
    runAzJson(project, [
      'boards', 'work-item', 'relation', 'add',
      '--id', String(record.workItem.id),
      '--relation-type', 'Hyperlink',
      '--target-url', prUrl,
      '--org', board.organization,
      '--output', 'json',
    ], env, env.IDEFACTORY_BOARD);
    record = { ...record, linkedPullRequests: [...record.linkedPullRequests, prUrl] };
    writeBoardRecord(project, record);
  }
  return { record, posted, state: record.state };
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
 * Decide whether a cloud run begins for a story a human moved to the ready state.
 * `not-ready` and `duplicate` write nothing.
 * @param {string} project
 * @param {string} change
 * @param {{ workItem: string|number, revision?: string|number, runUrl?: string }} options
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ decision: string, reason: string, change: string, workItemId: number, revision: number, next: string|null }}
 */
export function claimBoard(project, change, { workItem, revision, runUrl } = {}, env = process.env) {
  const usage = 'Usage: idefactory board claim <change> --work-item <id> [--revision N] [--run-url <url>] [--json]';
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

  const item = showWorkItem(project, board, workItemId, env);
  const fields = item?.fields || {};
  const named = String(fields[board.changeField] || '').trim();
  if (named !== name) {
    throw new Error(`work item ${workItemId} ${board.changeField} is "${named}", not ${name}`);
  }
  if (!storyTags(fields).includes(String(board.tag).toLowerCase())) {
    throw new Error(`work item ${workItemId} is missing the ${board.tag} tag`);
  }
  const claimedRevision = revision !== undefined && revision !== true && String(revision).trim() !== ''
    ? Number(revision)
    : Number(item?.rev);
  if (!Number.isInteger(claimedRevision) || claimedRevision <= 0) {
    throw new Error(`work item ${workItemId} has no usable revision`);
  }
  const result = (decision, reason, next = null) => ({
    decision,
    reason,
    change: name,
    workItemId,
    revision: claimedRevision,
    next,
  });

  if (fields['System.State'] !== board.states.ready) {
    return result('not-ready', `Work item state is "${fields['System.State'] || ''}", not "${board.states.ready}".`);
  }
  if (record?.claims.some((entry) => entry.revision === claimedRevision)) {
    return result('duplicate', `Revision ${claimedRevision} was already claimed.`);
  }

  if (!record) {
    record = {
      schemaVersion: 1,
      change: name,
      provider: board.provider,
      workItem: { id: workItemId, url: workItemUrl(board, workItemId) },
      state: 'new',
      descriptionDigest: null,
      comments: [],
      claims: [],
      linkedPullRequests: [],
    };
    writeBoardRecord(project, record);
  }

  const priorState = record.state;
  let outcome;
  if (halted(project)) {
    outcome = result('halted', 'HALT is present. A human must remove it with idefactory resume.');
    transitionBoard(project, name, {
      to: 'blocked',
      note: `Factory did not begin ${name}: HALT is present. A human must remove it with idefactory resume, then move this story to ${board.states.ready}.`,
    }, env);
  } else if (SKIP_STATES.has(priorState)) {
    outcome = result('skip', `The factory already recorded ${priorState} for this change.`);
    transitionBoard(project, name, {
      to: priorState,
      note: `Factory is already working on ${name} (${priorState}). This move to ${board.states.ready} was ignored. To resume after a stop, move the story to ${board.states.waiting} first.`,
    }, env);
  } else {
    const resume = RESUME_STATES.has(priorState);
    const next = `idefactory run --change ${name} --until human-gate${resume ? ' --new-run' : ''}`;
    outcome = result(resume ? 'resume' : 'start', resume
      ? `A human returned the story to ${board.states.ready} after ${priorState}.`
      : 'First claim for this change.', next);
    const lines = [
      `Factory ${resume ? 'resumed' : 'claimed'} ${name}.`,
      `Branch: factory/${name}`,
    ];
    if (runUrl) lines.push(`Run: ${runUrl}`);
    transitionBoard(project, name, {
      to: 'in-progress',
      note: lines.join('\n'),
      fields: {
        [board.branchField]: `factory/${name}`,
        ...(runUrl ? { [board.runUrlField]: runUrl } : {}),
      },
    }, env);
  }

  record = readBoardRecord(project, name);
  record.claims = [...record.claims, {
    revision: claimedRevision,
    decision: outcome.decision,
    at: new Date().toISOString(),
    ...(runUrl ? { runUrl } : {}),
  }];
  writeBoardRecord(project, record);
  appendControlEvent(project, {
    type: 'board-claim',
    time: new Date().toISOString(),
    change: name,
    workItemId,
    revision: claimedRevision,
    decision: outcome.decision,
  });
  return outcome;
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
