import fs from 'node:fs';
import path from 'node:path';

/**
 * Decisions the agent records about failed plan operations. Each record is one
 * line in `.factory/mcp/<planId>.progress.jsonl`. The record never changes the
 * plan. The factory checks only the combinations that could duplicate an
 * external effect or exceed the retry cap; the agent chooses the rest.
 */

export const OUTCOMES = ['applied', 'failed', 'unknown'];
export const CAUSES = ['transient', 'conflict', 'permission', 'invalid-request', 'not-found', 'unknown'];
export const DECISIONS = ['retry', 'retry-after-readback', 'skip-applied', 'replan', 'abandon', 'escalate'];
export const READBACKS = ['present', 'absent', 'unavailable'];
export const DEFAULT_MAX_OPERATION_ATTEMPTS = 3;

const RETRY_DECISIONS = new Set(['retry', 'retry-after-readback', 'replan']);
const APPLIED_DECISIONS = new Set(['retry', 'skip-applied']);

export function progressPath(project, planId) {
  return path.join(project, '.factory', 'mcp', `${planId}.progress.jsonl`);
}

export function readProgress(project, planId) {
  const file = progressPath(project, planId);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export function appendProgress(project, planId, record) {
  const file = progressPath(project, planId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
}

export function archiveProgress(project, planId) {
  const file = progressPath(project, planId);
  if (!fs.existsSync(file)) return;
  const archive = path.join(project, '.factory', 'mcp', 'archive');
  fs.mkdirSync(archive, { recursive: true });
  fs.renameSync(file, path.join(archive, path.basename(file)));
}

export function maxOperationAttempts(project) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(path.join(project, '.factory', 'config.json'), 'utf8')).mcp?.maxOperationAttempts;
  } catch {
    value = undefined;
  }
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : DEFAULT_MAX_OPERATION_ATTEMPTS;
}

export function latestOutcome(records, operation) {
  const mine = records.filter((record) => record.operation === operation);
  return mine.length ? mine.at(-1).outcome : null;
}

/** Retry decisions recorded for an operation after a failure. Applied records do not count. */
export function retryCount(records, operation) {
  return records.filter((record) => record.operation === operation
    && record.outcome !== 'applied'
    && RETRY_DECISIONS.has(record.decision)).length;
}

/** Operations whose latest recorded outcome is failed or unknown. */
export function unresolvedOperations(records) {
  const operations = [...new Set(records.map((record) => record.operation))].sort((a, b) => a - b);
  return operations
    .map((operation) => ({ operation, outcome: latestOutcome(records, operation) }))
    .filter((row) => row.outcome === 'failed' || row.outcome === 'unknown');
}

export function isRetryDecision(decision) {
  return RETRY_DECISIONS.has(decision);
}

/**
 * The first rule a proposed record breaks, or null when the record may be stored.
 * `fact` is the operation's `repeat` and `verify` facts.
 * @returns {null | { message: string, code?: string }}
 */
export function decisionProblem({ operation, fact, outcome, cause, decision, readback }, records, cap) {
  const refuse = (message, code) => ({ message, ...(code ? { code } : {}) });
  if (outcome === 'applied' && cause) return refuse('An applied outcome takes no --cause.');
  if (outcome !== 'applied' && !cause) return refuse(`A ${outcome} outcome needs --cause <${CAUSES.join('|')}>.`);
  if (outcome === 'applied' && !APPLIED_DECISIONS.has(decision)) {
    return refuse('An applied outcome takes decision retry (the retry succeeded) or skip-applied (the read-back showed it landed).');
  }
  if (decision === 'skip-applied' && readback !== 'present') {
    return refuse('skip-applied needs --readback present: the read-back must show the effect landed.');
  }
  if (readback === 'present' && decision !== 'skip-applied') {
    return refuse('The read-back shows the effect already landed. Only skip-applied is accepted.');
  }
  if (readback === 'unavailable' && decision !== 'escalate') {
    return refuse('The read-back is unavailable. Only escalate is accepted; a retry could duplicate the effect.');
  }
  if (decision === 'retry-after-readback' && readback !== 'absent') {
    return refuse('retry-after-readback needs --readback absent.');
  }
  if (outcome !== 'applied' && isRetryDecision(decision) && fact.repeat === 'check-first') {
    if (!fact.verify) {
      return refuse(`Operation ${operation} has no read-back defined, so a retry could duplicate its effect. Escalate instead.`);
    }
    if (readback !== 'absent') {
      const read = fact.verify.action ? `${fact.verify.tool} ${fact.verify.action}` : fact.verify.tool;
      return refuse(`Operation ${operation} is check-first. Run its read-back (${read}: ${fact.verify.purpose}) and record --readback absent before a retry.`);
    }
  }
  if (outcome !== 'applied' && isRetryDecision(decision) && retryCount(records, operation) >= cap) {
    return refuse(`Operation ${operation} has used its ${cap} recorded retries. The cap is reached.`, 'operation-retry-cap');
  }
  return null;
}
