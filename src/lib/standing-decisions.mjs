import fs from 'node:fs';
import path from 'node:path';
import { actionRow } from './approval-actions.mjs';
import { listAttemptExceptions } from './red-exceptions.mjs';
import { describeAttemptMethod } from './red-method.mjs';
import { attemptsForItem } from './reconcile-diff.mjs';
import { readText } from './layout.mjs';
import { authorizes } from './risk-gates.mjs';

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}

function approvalDecisions(project, item, implementerId) {
  const dir = path.join(project, '.factory', 'approvals');
  if (!fs.existsSync(dir)) return [];
  const rows = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json') || name.endsWith('.revoked.json')) continue;
    const id = name.slice(0, -'.json'.length);
    const record = readJson(path.join(dir, name));
    if (!record || record.change !== item.change || !actionRow(record.action)) continue;
    const standing = record.schemaVersion === 3;
    if (!standing && record.task !== item.id) continue;
    const verdict = authorizes(project, {
      action: record.action,
      change: record.change,
      task: standing ? undefined : record.task,
      target: record.target,
      implementerId,
    });
    if (verdict.approvalId !== id) continue;
    rows.push({
      kind: standing ? 'standing-authorization' : 'approval',
      id,
      summary: `${record.action}${record.target ? ` at ${record.target}` : ''}${standing ? ' (standing)' : ''}`,
      approver: record.approver,
      expiry: record.expiry,
    });
  }
  return rows;
}

function reconciliationDecision(project, item) {
  const dir = path.join(project, '.factory', 'work', 'reconciliations');
  if (!fs.existsSync(dir)) return [];
  let best = null;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    const record = readJson(path.join(dir, name));
    if (!record || record.status !== 'applied' || record.change !== item.change) continue;
    if (!Object.keys(record.before || {}).includes(item.id)) continue;
    if (!best || String(record.time) >= String(best.time)) best = record;
  }
  if (!best) return [];
  return [{
    kind: 'reconciliation',
    id: best.id,
    summary: `task list reconciliation applied for this item`,
    approver: best.decidedBy,
  }];
}

/**
 * Decisions already made that still hold for this item. Computed from existing records through
 * their own validators; it grants nothing and is never read by a gate.
 */
export function standingDecisions(project, item) {
  if (!item) return [];
  const attempts = attemptsForItem(project, item);
  const latest = attempts[attempts.length - 1];
  const rows = [...approvalDecisions(project, item, latest?.implementerId)];
  for (const attempt of attempts) {
    for (const exception of listAttemptExceptions(project, attempt)) {
      rows.push({
        kind: 'red-exception',
        id: exception.id,
        summary: `${exception.type} for ${exception.kind}: ${exception.reason}`,
        approver: exception.approver,
      });
    }
    const method = describeAttemptMethod(project, attempt);
    if (method?.review?.verdict === 'ACCEPT') {
      rows.push({
        kind: 'red-method',
        id: method.id,
        summary: `no-red for ${method.kinds.join(', ')} (${method.reason}), review ACCEPT by ${method.review.reviewer}`,
        approver: method.review.reviewer,
      });
    }
  }
  rows.push(...reconciliationDecision(project, item));
  return rows;
}

export function standingDecisionsText(project, item) {
  const rows = standingDecisions(project, item);
  if (rows.length === 0) return '';
  const lines = rows.map((row) => `- ${row.kind} ${row.id}: ${row.summary}${row.approver ? `, by ${row.approver}` : ''}${row.expiry ? `, expires ${row.expiry}` : ''}`);
  return `Standing decisions (already made for this item; do not ask for any of them again; listing one grants no authority):\n${lines.join('\n')}\n`;
}
