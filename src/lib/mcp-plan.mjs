import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { appendControlEvent } from './event-log.mjs';
import { readText, writeText } from './layout.mjs';

/**
 * Plans for writes the agent applies through Cursor's Azure DevOps MCP
 * connection. The CLI never contacts Azure DevOps for these. It saves what it
 * wants done and what it will record, prints it, and records the result when
 * the agent acknowledges the plan.
 */

export const ALLOWED_OPERATIONS = {
  wit_work_item_write: ['create', 'update'],
  wit_work_item_comment_write: ['add'],
  wit_work_item_link_write: ['link'],
  repo_pull_request_write: ['create', 'update'],
  repo_pull_request_thread_write: ['create'],
};

const FORBIDDEN_PULL_REQUEST_ARGUMENTS = [
  'autoComplete',
  'mergeStrategy',
  'mergeCommitMessage',
  'bypassReason',
  'deleteSourceBranch',
  'transitionWorkItems',
  'vote',
  'status',
  'reviewerIds',
  'reviewerAction',
  'isDraft',
];

const PLAN_ID = /^plan-[0-9a-f]{12}$/;

export function planDir(project) {
  return path.join(project, '.factory', 'mcp');
}

function planFile(project, id) {
  return path.join(planDir(project), `${id}.json`);
}

export function assertPlanOperation(operation) {
  const tool = operation?.tool;
  const action = operation?.arguments?.action;
  const actions = ALLOWED_OPERATIONS[tool];
  if (!actions) throw new Error(`MCP plan may not call ${tool}`);
  if (!actions.includes(action)) throw new Error(`MCP plan may not call ${tool} with action ${action}`);
  if (tool === 'repo_pull_request_write') {
    for (const name of FORBIDDEN_PULL_REQUEST_ARGUMENTS) {
      if (Object.prototype.hasOwnProperty.call(operation.arguments, name)) {
        throw new Error(`MCP pull request plan may not set ${name}`);
      }
    }
    if (action === 'update') {
      const extra = Object.keys(operation.arguments).filter((name) => ![
        'action', 'orgName', 'project', 'repositoryId', 'pullRequestId', 'description',
      ].includes(name));
      if (extra.length) throw new Error(`MCP pull request update may only change the description, not ${extra.join(', ')}`);
    }
  }
}

function contentOf(plan) {
  return { kind: plan.kind, change: plan.change, operations: plan.operations, effects: plan.effects };
}

function planDigest(plan) {
  return createHash('sha256').update(JSON.stringify(contentOf(plan))).digest('hex').slice(0, 12);
}

/**
 * @typedef {object} PlanEffects
 * @property {{ path: string, json: object }[]} writes Records to store at ack, paths relative to the project.
 * @property {object[]} [events] Control events to append at ack.
 * @property {{ result: string, write: number, pointer: string[], urlPointer?: string[], urlTemplate?: string }[]} [bind]
 *   Integers the agent returns at ack, written into a record. `{id}` in `urlTemplate` becomes the integer.
 */

/**
 * Save a plan. The id is a digest of the content, so planning twice is idempotent.
 * @param {string} project
 * @param {{ kind: string, change: string, operations: object[], effects: PlanEffects }} input
 */
export function createPlan(project, { kind, change, operations, effects }) {
  for (const operation of operations) assertPlanOperation(operation);
  const plan = { schemaVersion: 1, kind, change, operations, effects };
  plan.id = `plan-${planDigest(plan)}`;
  const { id, ...rest } = plan;
  writeText(planFile(project, id), `${JSON.stringify({ id, ...rest }, null, 2)}\n`);
  return { id, ...rest };
}

export function readPlan(project, id) {
  if (!PLAN_ID.test(String(id || ''))) throw new Error('Usage: idefactory mcp ack <planId> [--result <json> | --result-file <path>]');
  const file = planFile(project, id);
  if (!fs.existsSync(file)) throw new Error(`No pending plan ${id}`);
  const plan = JSON.parse(readText(file));
  if (plan.id !== id || `plan-${planDigest(plan)}` !== id) {
    throw new Error(`Plan ${id} was modified after it was created`);
  }
  for (const operation of plan.operations) assertPlanOperation(operation);
  return plan;
}

/** @returns {{ id: string, kind: string, change: string, operations: number }[]} */
export function listPlans(project) {
  const dir = planDir(project);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json') && PLAN_ID.test(name.slice(0, -5)))
    .sort()
    .flatMap((name) => {
      try {
        const plan = readPlan(project, name.slice(0, -5));
        return [{ id: plan.id, kind: plan.kind, change: plan.change, operations: plan.operations.length }];
      } catch {
        return [];
      }
    });
}

function positiveInteger(value) {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isInteger(number) && number > 0 ? number : null;
}

function setPointer(root, pointer, value) {
  let node = root;
  for (const key of pointer.slice(0, -1)) {
    if (!node[key] || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  node[pointer.at(-1)] = value;
}

/**
 * Record an acknowledged plan, then delete it.
 * @param {string} project
 * @param {string} id
 * @param {object} [result] ids returned by create operations
 */
export function ackPlan(project, id, result = {}) {
  const plan = readPlan(project, id);
  const writes = plan.effects.writes.map((entry) => ({ path: entry.path, json: structuredClone(entry.json) }));
  for (const bind of plan.effects.bind || []) {
    const value = positiveInteger(result?.[bind.result]);
    if (value === null) {
      throw new Error(`Plan ${id} needs result.${bind.result} (a positive integer from the create operation). Nothing was recorded.`);
    }
    setPointer(writes[bind.write].json, bind.pointer, value);
    if (bind.urlPointer && bind.urlTemplate) {
      setPointer(writes[bind.write].json, bind.urlPointer, bind.urlTemplate.replace('{id}', String(value)));
    }
  }
  for (const entry of writes) {
    const target = path.resolve(project, entry.path);
    if (!target.startsWith(path.resolve(project, '.factory') + path.sep)) {
      throw new Error(`Plan ${id} writes outside .factory/`);
    }
    writeText(target, `${JSON.stringify(entry.json, null, 2)}\n`);
  }
  for (const event of plan.effects.events || []) appendControlEvent(project, event);
  appendControlEvent(project, {
    type: 'mcp-ack',
    time: new Date().toISOString(),
    change: plan.change,
    planId: id,
    kind: plan.kind,
  });
  fs.rmSync(planFile(project, id), { force: true });
  return { plan, written: writes.map((entry) => entry.path) };
}

/**
 * Organization name the MCP tools take, from an organization URL.
 * @param {string} organization
 */
export function mcpOrgName(organization) {
  const url = new URL(organization);
  if (url.hostname.endsWith('.visualstudio.com')) return url.hostname.split('.')[0];
  return url.pathname.split('/').filter(Boolean)[0] || url.hostname;
}

/** Human-readable plan for text output. */
export function formatPlan(plan) {
  const lines = [`Plan ${plan.id} (${plan.kind}, ${plan.change})`];
  plan.operations.forEach((operation, index) => {
    lines.push(`${index + 1}. ${operation.tool}`);
    lines.push(JSON.stringify(operation.arguments));
  });
  lines.push(`After every operation succeeds, run: idefactory mcp ack ${plan.id}${(plan.effects.bind || []).length ? ` --result '{"${plan.effects.bind[0].result}": <id>}'` : ''}`);
  return lines.join('\n');
}
