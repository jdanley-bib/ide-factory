import fs from 'node:fs';
import path from 'node:path';

let pendingEventWarning = null;

export function eventLogPath(project) {
  return path.join(project, '.factory', 'observability', 'events.jsonl');
}

export function consumeEventWarning() {
  const warning = pendingEventWarning;
  pendingEventWarning = null;
  return warning;
}

/**
 * Append one allowlisted event. Failures are remembered for the CLI warning
 * and do not undo the action that already succeeded.
 * @param {string} project
 * @param {object} event
 */
export function appendControlEvent(project, event) {
  try {
    const file = eventLogPath(project);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const line = `${JSON.stringify(sanitizeEvent(event))}\n`;
    fs.appendFileSync(file, line);
  } catch (error) {
    pendingEventWarning = `event-log warning: ${error.message}`;
  }
}

function sanitizeEvent(event) {
  const allowed = [
    'type',
    'time',
    'id',
    'change',
    'task',
    'attemptId',
    'runId',
    'commandDigest',
    'exitCode',
    'stopReason',
    'agent',
    'resolver',
  ];
  const clean = {};
  for (const key of allowed) {
    if (event[key] !== undefined) clean[key] = event[key];
  }
  return clean;
}
