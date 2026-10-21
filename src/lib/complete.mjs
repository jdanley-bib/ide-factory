import fs from 'node:fs';
import path from 'node:path';
import { getAttempt, transitionAttempt } from './attempt.mjs';
import { halted, ledger, readText, writeText } from './layout.mjs';
import { getWorkItem, updateWorkItem } from './work.mjs';

export function completeWorkItem(project, change, taskId, attemptId, env = {}) {
  if (halted(project)) {
    const error = new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
    error.code = 'HALT';
    throw error;
  }
  if (hasActiveLockout(project)) {
    throw new Error('Active lockout present under .factory/orchestration/. Resolve before complete.');
  }

  const item = getWorkItem(project, change, taskId);
  if (!item) throw new Error(`Work item not found: ${change}/${taskId}`);
  const attempt = getAttempt(project, attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);
  if (attempt.change !== change || attempt.taskId !== taskId) {
    throw new Error('Attempt does not match work item');
  }
  if (attempt.state !== 'accepted' && attempt.state !== 'finalize-failed') {
    throw new Error(`Attempt must be accepted before complete (state=${attempt.state})`);
  }

  const config = readConfig(project);
  if (config.governance?.reviewerMustDiffer !== false) {
    if (!attempt.implementerId || !attempt.reviewerId) {
      throw new Error('complete requires implementerId and reviewerId on the attempt');
    }
    if (attempt.implementerId === attempt.reviewerId) {
      throw new Error('reviewer must differ from implementer');
    }
  }

  const requiredChecks = requiredChecksFor(project, item);
  assertChecksPassed(attempt, requiredChecks);

  try {
    updateWorkItem(project, change, taskId, { status: 'done' });
    checkOpenSpecCheckbox(project, change, taskId);
    appendScribeNote(project, change, taskId, attemptId);
    const finalized = transitionAttempt(project, attemptId, 'finalized', {
      evidence: { completed: true },
    });
    ledger(project, 'complete', { change, taskId, attemptId });
    return { item: getWorkItem(project, change, taskId), attempt: finalized };
  } catch (error) {
    try {
      const current = getAttempt(project, attemptId);
      if (current && current.state === 'accepted') {
        transitionAttempt(project, attemptId, 'finalize-failed', {
          evidence: { error: error.message },
        });
      }
    } catch {
      // keep original error
    }
    throw error;
  }
}

function requiredChecksFor(project, item) {
  const profileName = item.factory?.verificationProfile || 'frontend-low';
  const profilesPath = path.join(project, '.factory', 'profiles.json');
  let profiles = {};
  if (fs.existsSync(profilesPath)) {
    try {
      profiles = JSON.parse(readText(profilesPath));
    } catch {
      profiles = {};
    }
  }
  if (Array.isArray(item.factory?.checks) && item.factory.checks.length) return item.factory.checks;
  const fromProfile = profiles[profileName]?.checks;
  if (Array.isArray(fromProfile) && fromProfile.length) return fromProfile;
  return ['unit'];
}

function assertChecksPassed(attempt, required) {
  const results = [
    ...(attempt.evidence?.verification || []),
    ...(attempt.evidence?.security || []),
  ];
  for (const kind of required) {
    const match = results.find((entry) => entry.kind === kind || entry.check === kind);
    if (!match || match.passed !== true) {
      throw new Error(`Missing passing check evidence for: ${kind}`);
    }
  }
  const needsRed = required.some((kind) => ['unit', 'integration', 'playwright', 'contract'].includes(kind));
  if (needsRed && attempt.evidence?.red?.passed !== false) {
    throw new Error('complete requires a recorded failing red test (passed:false)');
  }
}

function checkOpenSpecCheckbox(project, change, taskId) {
  const file = path.join(project, 'openspec', 'changes', change, 'tasks.md');
  if (!fs.existsSync(file)) {
    throw new Error(`OpenSpec tasks.md not found for ${change}`);
  }
  const original = readText(file);
  const pattern = new RegExp(`^(- \\[)[^\\]]*(\\]\\s+${escapeRegExp(taskId)}\\s+)`, 'm');
  if (!pattern.test(original)) {
    throw new Error(`Checkbox ${taskId} not found in openspec/changes/${change}/tasks.md`);
  }
  const updated = original.replace(pattern, '$1x$2');
  writeText(file, updated);
}

function appendScribeNote(project, change, taskId, attemptId) {
  const history = path.join(project, '.factory', 'agents', 'scribe', 'history.md');
  if (!fs.existsSync(history)) return;
  const stamp = new Date().toISOString().slice(0, 10);
  fs.appendFileSync(
    history,
    `\n## ${stamp} finalized ${change}/${taskId}\n\nAttempt: ${attemptId}\n`,
  );
  const now = path.join(project, '.factory', 'identity', 'now.md');
  if (fs.existsSync(now)) {
    writeText(now, `# Now\n\nLast finalized: ${change}/${taskId} (${stamp})\n`);
  }
}

function hasActiveLockout(project) {
  const dir = path.join(project, '.factory', 'orchestration');
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((name) => name.includes('lockout') && name.endsWith('.md'));
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
