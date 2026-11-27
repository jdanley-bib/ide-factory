export const REQUIRED_BEHAVIORS = [
  'unattended-run-to-review-ready-pr',
  'recovered-transient-failure',
  'rejected-review-addressed-in-scope',
  'bounded-retry-and-loop-handling',
  'duplicate-claim-protection',
  'durable-decisions-across-handoffs',
  'clean-stop-for-unauthorized-effect',
];

export const OUTCOMES = ['passed', 'failed', 'not-run', 'not-available'];

const FIELDS = ['provider', 'transport', 'trigger', 'run', 'link', 'commit', 'pullRequest', 'time', 'producer', 'reviewer'];
const LOCAL_IDENTIFIER = /^(file:|fixture:|mock:|replay:|\/|\.{1,2}\/|~|[A-Za-z]:[\\/])/i;

/**
 * Parse the front matter of a cloud acceptance record: `key: value` lines, and
 * the `behaviors:` and `evidence:` blocks of indented `name: value` lines.
 */
export function parseAcceptanceRecord(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) throw new Error('a record starts with a --- front matter block');
  const record = { behaviors: {}, evidence: {} };
  let block = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const nested = /^\s+([\w-]+):\s*(.*)$/.exec(line);
    if (nested && block) {
      record[block][nested[1]] = nested[2].trim();
      continue;
    }
    const top = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!top) throw new Error(`unreadable front matter line: ${line}`);
    if (top[1] === 'behaviors' || top[1] === 'evidence') {
      block = top[1];
    } else {
      block = null;
      record[top[1]] = top[2].trim();
    }
  }
  return record;
}

/** Every problem with a record, each naming the field or behavior at fault. */
export function validateAcceptanceRecord(record) {
  const problems = [];
  for (const field of FIELDS) {
    if (!record[field]) problems.push(`field ${field} is missing`);
  }
  for (const behavior of REQUIRED_BEHAVIORS) {
    if (!Object.hasOwn(record.behaviors, behavior)) problems.push(`behavior ${behavior} is missing`);
  }
  for (const [behavior, outcome] of Object.entries(record.behaviors)) {
    if (!REQUIRED_BEHAVIORS.includes(behavior)) problems.push(`behavior ${behavior} is not a required behavior`);
    if (!OUTCOMES.includes(outcome)) problems.push(`behavior ${behavior} has unknown outcome ${outcome}`);
  }
  const outcomes = Object.values(record.behaviors);
  if (record.availability === 'not-available' && outcomes.some((outcome) => outcome !== 'not-available')) {
    problems.push('a provider with no supported transport has only not-available behaviors');
  }
  const passed = Object.entries(record.behaviors).filter(([, outcome]) => outcome === 'passed');
  if (passed.length > 0) {
    for (const field of FIELDS) {
      if (record[field] === 'not-run' || record[field] === 'not-available') {
        problems.push(`field ${field} must come from a real run when any behavior passed`);
      }
    }
  }
  for (const [behavior] of passed) {
    const evidence = record.evidence[behavior];
    if (!evidence) problems.push(`behavior ${behavior} passed without an identifier`);
    else if (LOCAL_IDENTIFIER.test(evidence)) problems.push(`behavior ${behavior} passed on a local fixture, path, or mock: ${evidence}`);
  }
  const placeholder = (value) => value === 'not-run' || value === 'not-available';
  if (record.reviewer && record.reviewer === record.producer && !placeholder(record.reviewer)) {
    problems.push('the reviewer is the producing agent identity');
  }
  return problems;
}

/** One state per record: records are never merged across providers. */
export function acceptanceState(record) {
  const outcomes = Object.values(record.behaviors);
  if (record.availability === 'not-available') return 'not-available';
  if (outcomes.includes('failed')) return 'failed';
  if (REQUIRED_BEHAVIORS.every((behavior) => record.behaviors[behavior] === 'passed')) return 'passed';
  if (outcomes.every((outcome) => outcome === 'not-run')) return 'not-run';
  return 'partial';
}
