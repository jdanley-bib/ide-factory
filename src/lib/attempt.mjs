import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ledger, writeText } from './layout.mjs';
import { getWorkItem, updateWorkItem } from './work.mjs';

export const ATTEMPT_STATES = [
  'planned',
  'assigned',
  'implementing',
  'red-confirmed',
  'verifying',
  'security-checking',
  'awaiting-review',
  'accepted',
  'rejected',
  'finalized',
  'finalize-failed',
];

const TRANSITIONS = {
  planned: ['assigned'],
  assigned: ['implementing'],
  implementing: ['red-confirmed'],
  'red-confirmed': ['verifying'],
  verifying: ['security-checking', 'awaiting-review'],
  'security-checking': ['awaiting-review'],
  'awaiting-review': ['accepted', 'rejected'],
  accepted: ['finalized', 'finalize-failed'],
  rejected: [],
  finalized: [],
  'finalize-failed': ['finalized'],
};

export function attemptsRoot(project) {
  return path.join(project, '.factory', 'attempts');
}

export function attemptPath(project, attemptId) {
  return path.join(attemptsRoot(project), `${attemptId}.json`);
}

export function getAttempt(project, attemptId) {
  const file = attemptPath(project, attemptId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function startAttempt(project, change, taskId, { role = 'engineer', modelProfile = 'coding-standard' } = {}) {
  const item = getWorkItem(project, change, taskId);
  if (!item) throw new Error(`Work item not found: ${change}/${taskId}`);
  if (item.status === 'done') throw new Error(`Work item already done: ${change}/${taskId}`);

  const attemptId = randomUUID();
  const attempt = {
    id: attemptId,
    change,
    taskId,
    state: 'planned',
    implementerRole: role,
    implementerId: null,
    reviewerId: null,
    modelProfile,
    evidence: {
      red: null,
      verification: [],
      security: [],
      review: null,
      changedFiles: [],
      baseRev: null,
    },
    history: [{ at: new Date().toISOString(), state: 'planned' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(attemptsRoot(project), { recursive: true });
  writeText(attemptPath(project, attemptId), JSON.stringify(attempt, null, 2));
  updateWorkItem(project, change, taskId, { status: 'in_progress', attemptId });
  ledger(project, 'attempt-start', { attemptId, change, taskId });
  return transitionAttempt(project, attemptId, 'assigned', {
    evidence: { assignedRole: role },
  });
}

export function transitionAttempt(project, attemptId, nextState, { evidence = {}, actorId = null } = {}) {
  const attempt = getAttempt(project, attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);
  const allowed = TRANSITIONS[attempt.state] || [];
  if (!allowed.includes(nextState)) {
    throw new Error(`Illegal transition ${attempt.state} → ${nextState}`);
  }
  validateEvidence(attempt, nextState, evidence);

  if (nextState === 'implementing' && actorId) attempt.implementerId = actorId;
  if (nextState === 'accepted' || nextState === 'rejected') {
    attempt.reviewerId = evidence.reviewerId || actorId || attempt.reviewerId;
    attempt.evidence.review = {
      verdict: nextState === 'accepted' ? 'ACCEPT' : 'REJECT',
      reviewerId: attempt.reviewerId,
      notes: evidence.notes || '',
      at: new Date().toISOString(),
    };
  }
  mergeEvidence(attempt, nextState, evidence);
  attempt.state = nextState;
  attempt.updatedAt = new Date().toISOString();
  attempt.history.push({ at: attempt.updatedAt, state: nextState });
  writeText(attemptPath(project, attemptId), JSON.stringify(attempt, null, 2));
  ledger(project, 'attempt-transition', { attemptId, state: nextState });
  return attempt;
}

function validateEvidence(attempt, nextState, evidence) {
  if (nextState === 'red-confirmed') {
    if (!evidence?.red?.command || evidence.red.passed !== false) {
      throw new Error('red-confirmed requires evidence.red with command and passed:false');
    }
  }
  if (nextState === 'awaiting-review' && attempt.state === 'verifying') {
    // security-checking may be skipped when no security checks required
  }
  if (nextState === 'accepted') {
    if (!evidence.reviewerId && !attempt.reviewerId) {
      throw new Error('accepted requires evidence.reviewerId');
    }
    if (evidence.verdict && String(evidence.verdict).toUpperCase() !== 'ACCEPT') {
      throw new Error('accepted requires verdict ACCEPT');
    }
  }
  if (nextState === 'rejected' && !evidence.reviewerId && !attempt.reviewerId) {
    throw new Error('rejected requires evidence.reviewerId');
  }
}

function mergeEvidence(attempt, nextState, evidence) {
  if (evidence.red) attempt.evidence.red = evidence.red;
  if (Array.isArray(evidence.verification)) {
    attempt.evidence.verification = evidence.verification;
  } else if (evidence.verification) {
    attempt.evidence.verification = [...(attempt.evidence.verification || []), evidence.verification];
  }
  if (Array.isArray(evidence.security)) {
    attempt.evidence.security = evidence.security;
  } else if (evidence.security) {
    attempt.evidence.security = [...(attempt.evidence.security || []), evidence.security];
  }
  if (evidence.changedFiles) attempt.evidence.changedFiles = evidence.changedFiles;
  if (evidence.baseRev) attempt.evidence.baseRev = evidence.baseRev;
  if (evidence.implementerId) attempt.implementerId = evidence.implementerId;
}
