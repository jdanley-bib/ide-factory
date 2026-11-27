import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BlockedError } from './blocked-error.mjs';
import { appendControlEvent } from './event-log.mjs';
import { readText, writeText } from './layout.mjs';
import {
  CAUSES,
  DECISIONS,
  OUTCOMES,
  READBACKS,
  appendProgress,
  decisionProblem,
  latestOutcome,
  maxOperationAttempts,
  readProgress,
  archiveProgress,
  retryCount,
  unresolvedOperations,
} from './mcp-progress.mjs';

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

/**
 * Facts the plan builder attaches to each operation. `repeat` is `check-first`
 * when repeating the operation could duplicate its effect. `verify` is the read
 * that shows whether the effect landed. Updates set fields to the values in the
 * plan, so repeating one cannot change the outcome.
 */
const OPERATION_FACTS = {
  'wit_work_item_write:create': {
    repeat: 'check-first',
    verify: { tool: 'search_workitem', purpose: 'find a work item tagged factory with this change name' },
  },
  'wit_work_item_write:update': { repeat: 'safe', verify: null },
  'wit_work_item_comment_write:add': {
    repeat: 'check-first',
    verify: { tool: 'wit_work_item', action: 'get', purpose: 'list the work item comments and look for this comment' },
  },
  'wit_work_item_link_write:link': {
    repeat: 'check-first',
    verify: { tool: 'wit_work_item', action: 'get', purpose: 'list the work item relations and look for this URL' },
  },
  'repo_pull_request_write:create': {
    repeat: 'check-first',
    verify: { tool: 'repo_pull_request', action: 'list', purpose: 'find an active pull request from the factory branch' },
  },
  'repo_pull_request_write:update': { repeat: 'safe', verify: null },
  'repo_pull_request_thread_write:create': {
    repeat: 'check-first',
    verify: { tool: 'repo_pull_request_thread', action: 'list', purpose: 'find a thread with this content' },
  },
};

/**
 * Repeat and read-back facts for an operation. A stored plan written before the
 * facts existed is check-first with no read-back, so a retry is refused.
 */
export function factsOf(operation) {
  return {
    repeat: operation.repeat ?? 'check-first',
    verify: operation.verify ?? null,
  };
}

function withFacts(operation) {
  const facts = OPERATION_FACTS[`${operation.tool}:${operation.arguments.action}`];
  return { ...operation, ...structuredClone(facts) };
}

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
  const plan = { schemaVersion: 1, kind, change, operations: operations.map(withFacts), effects };
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
  const unresolved = unresolvedOperations(readProgress(project, id));
  if (unresolved.length) {
    const list = unresolved.map((row) => `operation ${row.operation} (${row.outcome})`).join(', ');
    throw new Error(`Plan ${id} has an unresolved ${list}. Record a decision with idefactory mcp record, or escalate. Nothing was recorded.`);
  }
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
  archiveProgress(project, id);
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

/**
 * Record the agent's judgment about one operation: a failure and what it decided,
 * or an outcome that resolves an earlier failure. Refused combinations write nothing.
 * @param {string} project
 * @param {string} id
 * @param {{ operation: string|number, outcome: string, cause?: string, decision: string, readback?: string, note?: string }} input
 */
export function recordOperation(project, id, input) {
  const plan = readPlan(project, id);
  const number = Number(input.operation);
  if (!Number.isInteger(number) || number < 1 || number > plan.operations.length) {
    throw new Error(`--operation must be between 1 and ${plan.operations.length} for ${id}`);
  }
  const check = (name, value, allowed, required) => {
    if (value === undefined) {
      if (required) throw new Error(`--${name} is required (${allowed.join('|')})`);
      return;
    }
    if (!allowed.includes(value)) throw new Error(`--${name} must be one of ${allowed.join('|')}, not ${value}`);
  };
  check('outcome', input.outcome, OUTCOMES, true);
  check('decision', input.decision, DECISIONS, true);
  check('cause', input.cause, CAUSES, false);
  check('readback', input.readback, READBACKS, false);

  const records = readProgress(project, id);
  const operation = plan.operations[number - 1];
  const problem = decisionProblem({
    operation: number,
    fact: factsOf(operation),
    outcome: input.outcome,
    cause: input.cause,
    decision: input.decision,
    readback: input.readback,
  }, records, maxOperationAttempts(project));
  if (problem) {
    if (problem.code) {
      throw new BlockedError(problem.message, problem.code, { change: plan.change, planId: id, operation: number });
    }
    throw new Error(problem.message);
  }

  const time = new Date().toISOString();
  const record = {
    operation: number,
    outcome: input.outcome,
    ...(input.cause ? { cause: input.cause } : {}),
    decision: input.decision,
    ...(input.readback ? { readback: input.readback } : {}),
    ...(input.note ? { note: input.note } : {}),
    time,
  };
  appendProgress(project, id, record);
  const event = {
    type: 'mcp-decision',
    time,
    change: plan.change,
    planId: id,
    kind: plan.kind,
    operation: number,
    outcome: input.outcome,
    ...(input.cause ? { cause: input.cause } : {}),
    decision: input.decision,
    ...(input.readback ? { readback: input.readback } : {}),
  };
  appendControlEvent(project, event);
  if (input.decision === 'escalate') {
    appendControlEvent(project, stopEvent(plan, id, time, 'operation-escalated', 'only-after-change'));
  } else if (input.decision === 'abandon' && input.cause !== 'conflict') {
    appendControlEvent(project, stopEvent(plan, id, time, 'operation-abandoned', 'never'));
  }
  return { record, plan, retries: retryCount([...records, record], number) };
}

function stopEvent(plan, id, time, invariant, retry) {
  return {
    type: 'blocked.recorded',
    time,
    change: plan.change,
    planId: id,
    invariant,
    actor: 'human',
    retry,
    agentActionable: false,
  };
}

/**
 * Pending plans with each operation's latest recorded outcome and retry count.
 * Operations with no record are left out.
 */
export function pendingPlans(project) {
  return listPlans(project).map((summary) => {
    const records = readProgress(project, summary.id);
    const operations = [...new Set(records.map((record) => record.operation))].sort((a, b) => a - b);
    return {
      ...summary,
      progress: operations.map((operation) => ({
        operation,
        outcome: latestOutcome(records, operation),
        retries: retryCount(records, operation),
      })),
    };
  });
}

/** Human-readable plan for text output. */
export function formatPlan(plan) {
  const lines = [`Plan ${plan.id} (${plan.kind}, ${plan.change})`];
  plan.operations.forEach((operation, index) => {
    const facts = factsOf(operation);
    lines.push(`${index + 1}. ${operation.tool}`);
    lines.push(JSON.stringify(operation.arguments));
    const read = facts.verify
      ? `read-back ${facts.verify.tool}${facts.verify.action ? ` ${facts.verify.action}` : ''} (${facts.verify.purpose})`
      : 'no read-back';
    lines.push(`   repeat: ${facts.repeat}; ${read}`);
  });
  lines.push(`After every operation succeeds, run: idefactory mcp ack ${plan.id}${(plan.effects.bind || []).length ? ` --result '{"${plan.effects.bind[0].result}": <id>}'` : ''}`);
  lines.push(`If an operation fails, decide and record it first: idefactory mcp record ${plan.id} --operation <n> --outcome failed --cause <code> --decision <code>`);
  return lines.join('\n');
}
