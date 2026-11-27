import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { attemptPath, attemptsRoot, getAttempt } from './attempt.mjs';
import { appendControlEvent } from './event-log.mjs';
import { assertIdentity } from './identity.mjs';
import { ledger, writeText } from './layout.mjs';
import { confirmPrincipal, readPolicyVersion } from './principal.mjs';
import { finalizationJournalPath } from './finalization-recovery.mjs';
import { redSatisfaction } from './red-exceptions.mjs';
import { redKindsFor } from './required-checks.mjs';
import { canonicalJson } from './verification-evidence.mjs';
import { getWorkItem } from './work.mjs';

export const MAX_REOPENS = 2;
export const REOPEN_PURPOSES = ['method', 'exception'];

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} is required`);
  return value.trim();
}

function digestOf(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

/** The reopen whose amendment window is open, or null. The window ends when the attempt is accepted again. */
export function openReopen(attempt) {
  if (attempt?.state !== 'awaiting-review') return null;
  const reopens = Array.isArray(attempt.evidence?.reopens) ? attempt.evidence.reopens : [];
  return reopens.length > 0 ? reopens[reopens.length - 1] : null;
}

/** True when an open reopen names this kind. */
export function isReopenedKind(attempt, kind) {
  return Boolean(openReopen(attempt)?.kinds?.includes(kind));
}

/**
 * Move an accepted attempt back to awaiting-review for named kinds, in one attempt-file write.
 * The earlier review stays readable in evidence.reviewHistory; every other record is untouched.
 *
 * @param {string} project
 * @param {{
 *   attemptId: string,
 *   kinds: string[],
 *   purpose: string,
 *   by: string,
 *   reason: string,
 *   principalProvider?: string,
 *   principalSubject?: string,
 * }} options
 */
export function reopenAttempt(project, options) {
  const purpose = options.purpose;
  if (!REOPEN_PURPOSES.includes(purpose)) {
    throw new Error(`--for must be one of: ${REOPEN_PURPOSES.join(', ')}`);
  }
  const reason = requireText(options.reason, '--reason');
  const by = assertIdentity(options.by, '--by');
  const kinds = [...new Set(options.kinds || [])];
  if (kinds.length === 0) throw new Error('attempt reopen requires at least one --kind');

  const attempt = getAttempt(project, options.attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${options.attemptId}`);
  if (attempt.state === 'finalized' || attempt.state === 'finalize-failed') {
    throw new Error(`an attempt in ${attempt.state} cannot be reopened; finalization recovery owns that path`);
  }
  if (fs.existsSync(finalizationJournalPath(project, attempt.id))) {
    throw new Error('a finalization journal exists for this attempt, so it cannot be reopened');
  }
  if (attempt.state !== 'accepted') {
    throw new Error(`only an accepted attempt can be reopened (attempt state=${attempt.state})`);
  }
  const reopens = Array.isArray(attempt.evidence?.reopens) ? attempt.evidence.reopens : [];
  if (reopens.length >= MAX_REOPENS) {
    throw new Error(`reopen limit reached: an attempt can be reopened at most ${MAX_REOPENS} times`);
  }
  if (typeof attempt.implementerId === 'string' && attempt.implementerId === by) {
    throw new Error('the reopening identity must differ from the implementer');
  }

  const item = getWorkItem(project, attempt.change, attempt.taskId);
  if (!item) throw new Error(`Work item not found: ${attempt.change}/${attempt.taskId}`);
  const required = redKindsFor(project, item);
  for (const kind of kinds) {
    if (!required.includes(kind)) {
      throw new Error(`${kind} is not a required test kind of ${attempt.change}/${attempt.taskId}`);
    }
    const satisfied = redSatisfaction(project, attempt, kind);
    if (satisfied !== 'missing') {
      throw new Error(`${kind} is already satisfied on this attempt (${satisfied}); nothing to reopen`);
    }
  }

  if (readPolicyVersion(project) >= 2) {
    const principal = confirmPrincipal(project, {
      provider: options.principalProvider,
      subject: options.principalSubject,
    });
    if (by !== principal.subject) {
      throw new Error('the reopening identity must equal the verified principal subject');
    }
  }

  const at = new Date().toISOString();
  const prior = attempt.evidence?.review || null;
  const priorReviewDigest = prior ? digestOf(prior) : null;
  attempt.evidence = attempt.evidence || {};
  attempt.evidence.reviewHistory = [
    ...(Array.isArray(attempt.evidence.reviewHistory) ? attempt.evidence.reviewHistory : []),
    {
      verdict: prior?.verdict ?? null,
      role: prior?.role ?? 'reviewer',
      reviewerId: prior?.reviewerId ?? attempt.reviewerId ?? null,
      notes: prior?.notes ?? '',
      at: prior?.at ?? null,
      digest: priorReviewDigest,
      supersededAt: at,
    },
  ];
  attempt.evidence.reopens = [...reopens, { at, by, purpose, kinds, reason, priorReviewDigest }];
  attempt.evidence.review = null;
  attempt.reviewerId = null;
  attempt.state = 'awaiting-review';
  attempt.updatedAt = at;
  attempt.history.push({ at, state: 'awaiting-review', reopened: true });
  writeText(attemptPath(project, attempt.id), JSON.stringify(attempt, null, 2));
  ledger(project, 'attempt-reopen', { attemptId: attempt.id, purpose, kinds });
  appendControlEvent(project, {
    type: 'attempt.reopened',
    time: at,
    id: attempt.id,
    attemptId: attempt.id,
    change: attempt.change,
    task: attempt.taskId,
  });
  return attempt;
}

/** One line per reopen with the review it superseded. Shared by status, packets, requests, and the verdict comment. */
export function describeReopens(attempt, { withReason = true } = {}) {
  const reopens = Array.isArray(attempt?.evidence?.reopens) ? attempt.evidence.reopens : [];
  const history = Array.isArray(attempt?.evidence?.reviewHistory) ? attempt.evidence.reviewHistory : [];
  return reopens.map((entry, index) => {
    const earlier = history.find((row) => row.digest === entry.priorReviewDigest) || history[index];
    const prior = earlier
      ? `earlier verdict ${earlier.verdict ?? 'none'} by ${earlier.reviewerId ?? 'unknown'}`
      : 'no earlier verdict';
    return `Attempt ${attempt.id} reopened at ${entry.at} by ${entry.by} for ${entry.purpose} (${entry.kinds.join(', ')})${withReason ? `: ${entry.reason}` : ''}; ${prior}`;
  });
}

/** Every reopen line across all stored attempts, for status. */
export function listReopenLines(project) {
  const root = attemptsRoot(project);
  if (!fs.existsSync(root)) return [];
  const lines = [];
  for (const name of fs.readdirSync(root).sort()) {
    if (!name.endsWith('.json')) continue;
    try {
      lines.push(...describeReopens(JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8'))));
    } catch {
      // ignore unreadable attempt files
    }
  }
  return lines;
}
