import { IDENTITY_FORMAT_TEXT } from './identity.mjs';
import { LOCKOUT_CREATE_ALIAS_USAGE, LOCKOUT_CREATE_USAGE, LOCKOUT_RESOLVE_USAGE } from './usage-lines.mjs';
import { ATTEMPT_STATES, SUPPLIED_EVIDENCE_TYPES, TRANSITIONS } from './attempt.mjs';

export const HELP_SCHEMA_VERSION = 1;

const WRITES = 'writes';
const READ_ONLY = 'read-only';

const PATH_FLAG = {
  name: 'path',
  value: '<dir>',
  required: false,
  description: 'Project directory. Defaults to the current directory.',
};
const JSON_FLAG = (description) => ({ name: 'json', value: null, required: false, description });
const PATH_ARG = (description) => ({ name: 'path', required: false, description });
const ATTEMPT_ARG = { name: 'attemptId', required: true, description: 'Attempt id printed by attempt start.' };
const CHANGE_ARG = { name: 'change', required: true, description: 'OpenSpec change name.' };
const KIND_FLAG = {
  name: 'kind',
  value: '<kind>',
  required: true,
  repeatable: true,
  description: 'Test kind to cover. Repeat the flag for more than one kind.',
};
const NOTE_FLAG = {
  name: 'note',
  value: '"text"',
  required: true,
  description: 'Reason recorded with the decision.',
};
const APPROVER_FLAG = {
  name: 'approver',
  value: '<id>',
  required: true,
  description: 'Id of the human who authorizes the exception. Must not be the implementer.',
};
const PRINCIPAL_FLAGS = [
  {
    name: 'principal-provider',
    value: '<id>',
    required: false,
    description: 'Principal verifier provider. Give it together with --principal-subject.',
  },
  {
    name: 'principal-subject',
    value: '<id>',
    required: false,
    description: 'Principal verifier subject. Give it together with --principal-provider.',
  },
];

function leaf(path, summary, usage, fields = {}) {
  return {
    path,
    summary,
    usage,
    effects: WRITES,
    arguments: [],
    flags: [],
    examples: [],
    ...fields,
  };
}

function group(path, summary, usage, fields = {}) {
  return leaf(path, summary, usage, { effects: null, ...fields });
}

export const COMMANDS = [
  leaf(['help'], 'Print help for the CLI or for one command.', 'idefactory help [command...] [--json]', {
    effects: READ_ONLY,
    arguments: [{
      name: 'command',
      required: false,
      description: 'Command words, such as "attempt transition". Omit to print the full usage list.',
    }],
    flags: [JSON_FLAG('Print structured help. With no command, list every command.')],
    examples: [
      'idefactory help',
      'idefactory help attempt transition',
      'idefactory help verify run --json',
      'idefactory verify run --help',
    ],
  }),
  leaf(
    ['init'],
    'Install .factory/ team state and the IDE adapters.',
    'idefactory init [path] [--force-roster] [--with-openspec] [--dry-run] [--json] [--replace <path>] [--force]',
    {
      arguments: [PATH_ARG('Project directory to install into. Defaults to the current directory.')],
      flags: [
        { name: 'force-roster', value: null, required: false, description: 'Rewrite the roster and role charters from the templates even when they exist.' },
        { name: 'with-openspec', value: null, required: false, description: 'Also set up OpenSpec in the project.' },
        { name: 'dry-run', value: null, required: false, description: 'Report what would change and write nothing.' },
        JSON_FLAG('Print the adapter sync report as JSON.'),
        { name: 'replace', value: '<path>', required: false, repeatable: true, description: 'Replace this generated file with the new rendering. The old file is saved under backups.' },
        { name: 'force', value: null, required: false, description: 'Replace every preserved generated file, with backups. Takes no value.' },
      ],
      examples: ['idefactory init', 'idefactory init --dry-run'],
    },
  ),
  leaf(
    ['upgrade'],
    'Refresh unmodified generated adapters, keep your edits, and report conflicts.',
    'idefactory upgrade [path] [--dry-run] [--json] [--replace <path>] [--force]',
    {
      arguments: [PATH_ARG('Project directory to upgrade. Defaults to the current directory.')],
      flags: [
        { name: 'dry-run', value: null, required: false, description: 'Report what would change and write nothing.' },
        JSON_FLAG('Print the adapter sync report as JSON.'),
        { name: 'replace', value: '<path>', required: false, repeatable: true, description: 'Replace this generated file with the new rendering. The old file is saved under backups.' },
        { name: 'force', value: null, required: false, description: 'Replace every preserved generated file, with backups. Takes no value.' },
      ],
      examples: ['idefactory upgrade --dry-run', 'idefactory upgrade --replace .cursor/skills/factory-build/SKILL.md'],
      notes: ['Exits 3 when a file is preserved or malformed.'],
    },
  ),
  group(
    ['adapters'],
    'Pin or unpin generated adapter files.',
    'idefactory adapters pin <path>... | unpin <path>... [--path dir]',
  ),
  leaf(
    ['adapters', 'pin'],
    'Keep a generated file as it is on every upgrade.',
    'idefactory adapters pin <path>... [--path dir]',
    {
      arguments: [{ name: 'path', required: true, repeatable: true, description: 'Generated file to pin, relative to the project.' }],
      flags: [PATH_FLAG],
      examples: ['idefactory adapters pin .cursor/rules/factory.mdc'],
    },
  ),
  leaf(
    ['adapters', 'unpin'],
    'Let upgrade refresh a pinned generated file again.',
    'idefactory adapters unpin <path>... [--path dir]',
    {
      arguments: [{ name: 'path', required: true, repeatable: true, description: 'Generated file to unpin, relative to the project.' }],
      flags: [PATH_FLAG],
      examples: ['idefactory adapters unpin .cursor/rules/factory.mdc'],
    },
  ),
  leaf(['doctor'], 'Fail if required team state or adapter files are missing.', 'idefactory doctor [path]', {
    effects: READ_ONLY,
    arguments: [PATH_ARG('Project directory. Defaults to the current directory.')],
    examples: ['idefactory doctor'],
  }),
  leaf(['status'], 'Show halt, the active change, the roster, and work queue counts.', 'idefactory status [--json] [path]', {
    effects: READ_ONLY,
    arguments: [PATH_ARG('Project directory. Defaults to the current directory.')],
    flags: [JSON_FLAG('Print the status document as JSON.')],
    examples: ['idefactory status', 'idefactory status --json'],
  }),
  group(['checks'], 'Inspect the registered checks.', 'idefactory checks preview [--path dir]'),
  leaf(['checks', 'preview'], 'Preview the checks the registry would run.', 'idefactory checks preview [--path dir]', {
    effects: READ_ONLY,
    flags: [PATH_FLAG],
    examples: ['idefactory checks preview'],
  }),
  leaf(
    ['sync-tasks'],
    'Create work items from the unchecked boxes of an OpenSpec change.',
    'idefactory sync-tasks <change> [--path dir]',
    {
      arguments: [CHANGE_ARG],
      flags: [PATH_FLAG],
      examples: ['idefactory sync-tasks add-auth'],
    },
  ),
  leaf(
    ['next'],
    'Print one role-scoped work packet. Does not launch a model.',
    'idefactory next [--change name] [--path dir]',
    {
      flags: [
        { name: 'change', value: '<name>', required: false, description: 'Limit the packet to this OpenSpec change.' },
        PATH_FLAG,
      ],
      examples: ['idefactory next --change add-auth'],
    },
  ),
  leaf(
    ['run'],
    'Resume the persisted run for a change and print the next request or stop reason.',
    'idefactory run --change <name> [--until human-gate] [--max-tasks N] [--max-agent-steps N] [--new-run] [--accept-baseline] [--path dir]',
    {
      flags: [
        { name: 'change', value: '<name>', required: true, description: 'OpenSpec change to run.' },
        { name: 'until', value: 'human-gate', required: false, description: 'Where to stop. Defaults to human-gate.' },
        { name: 'max-tasks', value: 'N', required: false, description: 'Stop after this many tasks.' },
        { name: 'max-agent-steps', value: 'N', required: false, description: 'Stop after this many agent steps.' },
        { name: 'new-run', value: null, required: false, description: 'Start a new run session after a sticky stop. Human only.' },
        { name: 'accept-baseline', value: null, required: false, description: 'Accept the current baseline for the run.' },
        PATH_FLAG,
      ],
      examples: ['idefactory run --change add-auth --until human-gate'],
      notes: ['Exit 2 means one IDE role should take the printed request. Exit 0 is a clean stop. Exit 1 is an error.'],
    },
  ),
  group(
    ['attempt'],
    'Start, transition, or show an execution attempt.',
    'idefactory attempt start|transition|show ...',
  ),
  leaf(
    ['attempt', 'start'],
    'Start an attempt for one work item.',
    'idefactory attempt start <change> <taskId> [--path dir]',
    {
      arguments: [
        CHANGE_ARG,
        { name: 'taskId', required: true, description: 'Work item task id.' },
      ],
      flags: [PATH_FLAG],
      examples: ['idefactory attempt start add-auth 1.1'],
    },
  ),
  leaf(
    ['attempt', 'transition'],
    'Move an attempt to the next state, with evidence.',
    'idefactory attempt transition <attemptId> <state> [--evidence json | --evidence-file path] [--path dir]',
    {
      arguments: [
        ATTEMPT_ARG,
        { name: 'state', required: true, description: 'Target state. See the lifecycle below.' },
      ],
      flags: [
        { name: 'evidence', value: '<json>', required: false, description: 'Inline JSON object of evidence. Windows PowerShell 5.1 can mangle quotes; prefer --evidence-file.' },
        { name: 'evidence-file', value: '<path>', required: false, description: 'Path to a file holding the JSON evidence object. Give only one of --evidence and --evidence-file.' },
        PATH_FLAG,
      ],
      examples: [
        'idefactory attempt transition <attemptId> implementing --evidence-file evidence.json',
        'idefactory attempt transition <attemptId> accepted --evidence "{\\"reviewerId\\":\\"reviewer-1\\"}"',
      ],
      notes: [
        'Check results (red, verification, security) cannot be supplied. Use idefactory verify run.',
        `Identities (implementerId, reviewerId, securityReviewerId): ${IDENTITY_FORMAT_TEXT}.`,
      ],
    },
  ),
  leaf(['attempt', 'show'], 'Print the stored attempt as JSON.', 'idefactory attempt show <attemptId> [--path dir]', {
    effects: READ_ONLY,
    arguments: [ATTEMPT_ARG],
    flags: [PATH_FLAG],
    examples: ['idefactory attempt show <attemptId>'],
  }),
  group(
    ['verify'],
    'Run a registered check, import signed check evidence, or report check states.',
    'idefactory verify run|import|status ...',
  ),
  leaf(
    ['verify', 'run'],
    'Run a registered check and store CLI evidence.',
    'idefactory verify run <attemptId> --check <kind> [--red]',
    {
      arguments: [ATTEMPT_ARG],
      flags: [
        { name: 'check', value: '<kind>', required: true, description: 'Registered check kind to run.' },
        { name: 'red', value: null, required: false, description: 'Record the run as the failing red for this kind.' },
        PATH_FLAG,
      ],
      examples: [
        'idefactory verify run <attemptId> --check test --red',
        'idefactory verify run <attemptId> --check test',
      ],
    },
  ),
  leaf(
    ['verify', 'import'],
    'Import signed check evidence from a file.',
    'idefactory verify import <attemptId> --file <path>',
    {
      arguments: [ATTEMPT_ARG],
      flags: [
        { name: 'file', value: '<path>', required: true, description: 'Evidence file to import.' },
        PATH_FLAG,
      ],
      examples: ['idefactory verify import <attemptId> --file evidence.json'],
    },
  ),
  leaf(
    ['verify', 'status'],
    'Report the state of each required check for an attempt. Read-only; exits zero even when a check is not valid.',
    'idefactory verify status <attemptId> [--json] [--path dir]',
    {
      effects: READ_ONLY,
      arguments: [ATTEMPT_ARG],
      flags: [JSON_FLAG('Print one JSON document with schemaVersion, allValid, and one entry per check.'), PATH_FLAG],
      examples: ['idefactory verify status <attemptId>', 'idefactory verify status <attemptId> --json'],
    },
  ),
  group(
    ['red'],
    'Record an audited red exception for a verification-only retry.',
    'idefactory red reuse|waive ...',
  ),
  leaf(
    ['red', 'reuse'],
    'Reuse a rejected attempt\'s red for a replacement attempt. Does not write a red.',
    'idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind>... --note "text" --approver <id> [--principal-provider <id> --principal-subject <id>] [--path dir]',
    {
      arguments: [{ name: 'targetAttemptId', required: true, description: 'Replacement attempt that receives the exception.' }],
      flags: [
        { name: 'from', value: '<sourceAttemptId>', required: true, description: 'Rejected attempt that holds the genuine red.' },
        KIND_FLAG,
        NOTE_FLAG,
        APPROVER_FLAG,
        ...PRINCIPAL_FLAGS,
        PATH_FLAG,
      ],
      examples: ['idefactory red reuse <target> --from <source> --kind test --note "same failing test" --approver human-1'],
    },
  ),
  leaf(
    ['red', 'waive'],
    'Record that no red exists for a kind. Does not write a red.',
    'idefactory red waive <targetAttemptId> --kind <kind>... --note "text" --approver <id> [--acknowledge-not-stuck] [--principal-provider <id> --principal-subject <id>] [--path dir]',
    {
      arguments: [{ name: 'targetAttemptId', required: true, description: 'Attempt that receives the waiver.' }],
      flags: [
        KIND_FLAG,
        NOTE_FLAG,
        APPROVER_FLAG,
        { name: 'acknowledge-not-stuck', value: null, required: false, description: 'Waive before the attempt has hit vacuous-red. Discouraged; use it only after the human acknowledges the warning.' },
        ...PRINCIPAL_FLAGS,
        PATH_FLAG,
      ],
      examples: ['idefactory red waive <target> --kind test --note "code already passes" --approver human-1'],
    },
  ),
  leaf(
    ['complete'],
    'Journal the finalization and mark an accepted attempt done.',
    'idefactory complete <change> <taskId> --attempt <id> [--path dir]',
    {
      arguments: [CHANGE_ARG, { name: 'taskId', required: true, description: 'Work item task id.' }],
      flags: [
        { name: 'attempt', value: '<id>', required: true, description: 'Accepted attempt to finalize.' },
        PATH_FLAG,
      ],
      examples: ['idefactory complete add-auth 1.1 --attempt <attemptId>'],
    },
  ),
  group(
    ['pr'],
    'Open a pull request, post a verdict comment, or capture review comments.',
    'idefactory pr open|comment|capture ...',
  ),
  leaf(['pr', 'open'], 'Open the pull request for a change.', 'idefactory pr open <change> [--path dir]', {
    arguments: [CHANGE_ARG],
    flags: [PATH_FLAG],
    examples: ['idefactory pr open add-auth'],
  }),
  leaf(['pr', 'comment'], 'Post the stored verdict for an attempt on its pull request.', 'idefactory pr comment <attemptId> [--path dir]', {
    arguments: [ATTEMPT_ARG],
    flags: [PATH_FLAG],
    examples: ['idefactory pr comment <attemptId>'],
  }),
  leaf(['pr', 'capture'], 'Capture review comments from the pull request for a change.', 'idefactory pr capture <change> [--path dir]', {
    arguments: [CHANGE_ARG],
    flags: [PATH_FLAG],
    examples: ['idefactory pr capture add-auth'],
  }),
  group(['ci'], 'Manage consumer CI.', 'idefactory ci scaffold [path] [--path dir]'),
  leaf(['ci', 'scaffold'], 'Write the consumer CI workflow.', 'idefactory ci scaffold [path] [--path dir]', {
    arguments: [PATH_ARG('Project directory. Defaults to the current directory.')],
    flags: [PATH_FLAG],
    examples: ['idefactory ci scaffold'],
  }),
  leaf(
    ['approve'],
    'Record a scoped human approval. Does not publish, deploy, or spend.',
    'idefactory approve <id> --note "text" --change <name> --task <id> --action <accept|complete> --approver <id> --principal-provider <id> --principal-subject <id> --expiry <iso> [--path dir]',
    {
      arguments: [{ name: 'id', required: true, description: 'Approval id.' }],
      flags: [
        NOTE_FLAG,
        { name: 'change', value: '<name>', required: true, description: 'OpenSpec change the approval covers.' },
        { name: 'task', value: '<id>', required: true, description: 'Task the approval covers.' },
        { name: 'action', value: '<accept|complete>', required: true, description: 'Action the approval allows.' },
        { name: 'approver', value: '<id>', required: true, description: 'Id of the approving human. Must not be the implementer.' },
        { name: 'principal-provider', value: '<id>', required: true, description: 'Principal verifier provider.' },
        { name: 'principal-subject', value: '<id>', required: true, description: 'Principal verifier subject.' },
        { name: 'expiry', value: '<iso>', required: true, description: 'Expiry time in ISO 8601. Must be within 24 hours.' },
        PATH_FLAG,
      ],
      examples: ['idefactory approve a1 --note "ship it" --change add-auth --task 1.1 --action accept --approver human-1 --principal-provider local --principal-subject human-1 --expiry 2030-01-01T00:00:00Z'],
    },
  ),
  leaf(['reject'], 'Record a human rejection.', 'idefactory reject <id> --note "text" [--path dir]', {
    arguments: [{ name: 'id', required: true, description: 'Id of the decision to reject.' }],
    flags: [NOTE_FLAG, PATH_FLAG],
    examples: ['idefactory reject a1 --note "not safe"'],
  }),
  group(['lockout'], 'Create or resolve a reviewer lockout.', 'idefactory lockout create|resolve ...'),
  leaf(
    ['lockout', 'create'],
    'Lock an implementer out of a reviewer after a failed review.',
    LOCKOUT_CREATE_USAGE,
    {
      aliasUsages: [LOCKOUT_CREATE_ALIAS_USAGE],
      flags: [
        { name: 'agent', value: '<id>', required: true, description: 'Implementer id that was locked out.' },
        { name: 'reviewer', value: '<id>', required: true, description: 'Reviewer id.' },
        { name: 'reason', value: '"text"', required: true, description: 'What failed.' },
        PATH_FLAG,
      ],
      examples: ['idefactory lockout create --agent engineer-1 --reviewer reviewer --reason "failed review twice"'],
      notes: [
        '"idefactory lockout --agent ..." with no subcommand also creates a lockout.',
        `Identities: ${IDENTITY_FORMAT_TEXT}. An id outside that format is accepted only if an attempt already records it exactly.`,
      ],
    },
  ),
  leaf(
    ['lockout', 'resolve'],
    'Resolve a lockout.',
    LOCKOUT_RESOLVE_USAGE,
    {
      arguments: [{ name: 'id', required: true, description: 'Lockout id.' }],
      flags: [
        { name: 'resolver', value: '<id>', required: true, description: 'Id of the human resolving it.' },
        { name: 'reason', value: '"text"', required: true, description: 'What changed.' },
        PATH_FLAG,
      ],
      examples: ['idefactory lockout resolve <id> --resolver human-1 --reason "fixed"'],
      notes: [`Identities: ${IDENTITY_FORMAT_TEXT}. The resolver must differ from the locked agent.`],
    },
  ),
  leaf(
    ['setup'],
    'Record the test command and the governance mode.',
    'idefactory setup [--detect] [--governance lightweight|strict] [--map <kind> --argv <part>...] [--no-test] [--verifier-argv <part>...] [--path dir]',
    {
      flags: [
        { name: 'detect', value: null, required: false, description: 'Report what setup would detect and write nothing.' },
        { name: 'governance', value: 'lightweight|strict', required: false, description: 'Governance mode to record.' },
        { name: 'map', value: '<kind>', required: false, repeatable: true, description: 'Check kind to register. Follow it with --argv parts.' },
        { name: 'argv', value: '<part>', required: false, repeatable: true, description: 'One argument of the command for the preceding --map. Repeat for each part.' },
        { name: 'no-test', value: null, required: false, description: 'Record that the project has no test command.' },
        { name: 'verifier-argv', value: '<part>', required: false, repeatable: true, description: 'One argument of the principal verifier command. Repeat for each part.' },
        PATH_FLAG,
      ],
      examples: ['idefactory setup --detect', 'idefactory setup --governance lightweight --map test --argv npm --argv test'],
      effectsDetail: 'read-only with --detect',
    },
  ),
  leaf(['halt'], 'Set the kill switch. Mutating factory commands refuse to run.', 'idefactory halt [path]', {
    arguments: [PATH_ARG('Project directory. Defaults to the current directory.')],
    examples: ['idefactory halt'],
  }),
  leaf(['resume'], 'Clear the kill switch.', 'idefactory resume [path]', {
    arguments: [PATH_ARG('Project directory. Defaults to the current directory.')],
    examples: ['idefactory resume'],
  }),
];

const GROUP_PATHS = new Set(
  COMMANDS.filter((entry) => COMMANDS.some(
    (other) => other.path.length > entry.path.length
      && entry.path.every((word, index) => other.path[index] === word),
  )).map((entry) => entry.path.join(' ')),
);

export const ATTEMPT_PRECONDITIONS = [
  {
    state: 'red-confirmed',
    text: 'Needs a stored failing red from "verify run --red". A red cannot be supplied in the transition payload.',
  },
  {
    state: 'verifying',
    text: 'Needs a recorded failing red for every required test kind, or a red exception. Lightweight tasks skip this.',
  },
  {
    state: 'awaiting-review',
    text: 'Needs passing check evidence for every required check. Security-sensitive work cannot go straight from verifying; it goes through security-checking, whose exit needs verdict ACCEPT and a securityReviewerId that differs from the implementer.',
  },
  {
    state: 'accepted',
    text: 'Needs a reviewerId (in evidence or already on the attempt) and a verdict of ACCEPT if a verdict is given.',
  },
  {
    state: 'rejected',
    text: 'From awaiting-review it needs a reviewerId. From security-checking it is only for security-stage work and needs verdict REJECT and a securityReviewerId that differs from the implementer.',
  },
];

export function pathKey(entry) {
  return entry.path.join(' ');
}

export function isGroup(entry) {
  return GROUP_PATHS.has(pathKey(entry));
}

export function findEntry(words) {
  const key = words.join(' ');
  return COMMANDS.find((entry) => pathKey(entry) === key) || null;
}

/**
 * Resolve leading words to the longest matching command path. Words after the
 * match are ignored; they are values such as an attempt id.
 * @param {string[]} words
 * @returns {{ entry: object|null, matched: string[], unknown: string }}
 */
export function resolveTopic(words) {
  let entry = null;
  let matched = [];
  for (let size = Math.min(words.length, 2); size >= 1; size -= 1) {
    const candidate = findEntry(words.slice(0, size));
    if (candidate) {
      entry = candidate;
      matched = words.slice(0, size);
      break;
    }
  }
  return { entry, matched, unknown: words[0] || '' };
}

export function subcommandsOf(entry) {
  return COMMANDS.filter((other) => other.path.length === entry.path.length + 1
    && entry.path.every((word, index) => other.path[index] === word));
}

export function effectsOf(entry) {
  if (entry.effects) return entry.effects;
  const kinds = new Set(subcommandsOf(entry).map(effectsOf));
  return kinds.size === 1 ? [...kinds][0] : 'varies';
}

export function effectsLine(entry) {
  if (entry.effectsDetail) return `${entry.effects === READ_ONLY ? 'read-only' : 'writes project state'}, ${entry.effectsDetail}`;
  return entry.effects === READ_ONLY ? 'read-only' : 'writes project state';
}

export function attemptLifecycle() {
  const guarded = new Set(ATTEMPT_PRECONDITIONS.map((item) => item.state));
  return {
    states: [...ATTEMPT_STATES],
    transitions: ATTEMPT_STATES.map((state) => ({ from: state, to: [...(TRANSITIONS[state] || [])] })),
    evidence: Object.entries(SUPPLIED_EVIDENCE_TYPES).map(([key, type]) => ({ key, type })),
    preconditions: ATTEMPT_PRECONDITIONS
      .filter((item) => guarded.has(item.state))
      .map((item) => ({ state: item.state, text: item.text })),
  };
}

function hasLifecycle(entry) {
  return pathKey(entry) === 'attempt transition';
}

function describeFlag(flag) {
  const name = flag.value ? `--${flag.name} ${flag.value}` : `--${flag.name}`;
  const tags = [flag.required ? 'required' : 'optional'];
  if (flag.repeatable) tags.push('repeatable');
  return { label: name, text: `(${tags.join(', ')}) ${flag.description}` };
}

function table(rows) {
  const width = Math.max(...rows.map((row) => row.label.length));
  return rows.map((row) => `  ${row.label.padEnd(width)}  ${row.text}`);
}

export function renderText(entry) {
  const lines = [`idefactory ${pathKey(entry)} - ${entry.summary}`, '', 'Usage:', `  ${entry.usage}`];
  for (const alias of entry.aliasUsages || []) lines.push(`  ${alias}`);
  if (isGroup(entry)) {
    lines.push('', 'Subcommands:');
    lines.push(...table(subcommandsOf(entry).map((sub) => ({
      label: sub.path[sub.path.length - 1],
      text: sub.summary,
    }))));
    lines.push('', `Run "idefactory help ${pathKey(entry)} <subcommand>" for details.`);
    return `${lines.join('\n')}\n`;
  }
  lines.push('', `Effects: ${effectsLine(entry)}`);
  if (entry.arguments.length) {
    lines.push('', 'Arguments:');
    lines.push(...table(entry.arguments.map((arg) => ({
      label: arg.repeatable ? `<${arg.name}>...` : `<${arg.name}>`,
      text: `(${arg.required ? 'required' : 'optional'}) ${arg.description}`,
    }))));
  }
  if (entry.flags.length) {
    lines.push('', 'Flags:');
    lines.push(...table(entry.flags.map(describeFlag)));
  }
  if (entry.notes?.length) {
    lines.push('', 'Notes:');
    for (const note of entry.notes) lines.push(`  ${note}`);
  }
  if (entry.examples.length) {
    lines.push('', 'Examples:');
    for (const example of entry.examples) lines.push(`  ${example}`);
  }
  if (hasLifecycle(entry)) lines.push('', ...lifecycleText());
  return `${lines.join('\n')}\n`;
}

function lifecycleText() {
  const lifecycle = attemptLifecycle();
  const lines = ['Attempt lifecycle:', '', 'States and allowed transitions:'];
  const width = Math.max(...lifecycle.transitions.map((item) => item.from.length));
  for (const item of lifecycle.transitions) {
    lines.push(`  ${item.from.padEnd(width)}  ->  ${item.to.length ? item.to.join(', ') : '(final)'}`);
  }
  lines.push('', 'Evidence keys (JSON object passed to --evidence or --evidence-file):');
  const keyWidth = Math.max(...lifecycle.evidence.map((item) => item.key.length));
  for (const item of lifecycle.evidence) lines.push(`  ${item.key.padEnd(keyWidth)}  ${item.type}`);
  lines.push('', 'Entering a state:');
  for (const item of lifecycle.preconditions) lines.push(`  ${item.state}: ${item.text}`);
  return lines;
}

function jsonFlag(flag) {
  return {
    name: flag.name,
    value: flag.value || null,
    required: Boolean(flag.required),
    repeatable: Boolean(flag.repeatable),
    description: flag.description,
  };
}

export function renderJson(entry) {
  const doc = {
    schemaVersion: HELP_SCHEMA_VERSION,
    command: pathKey(entry),
    summary: entry.summary,
    usage: entry.usage,
    effects: effectsOf(entry),
    arguments: entry.arguments.map((arg) => ({
      name: arg.name,
      required: Boolean(arg.required),
      repeatable: Boolean(arg.repeatable),
      description: arg.description,
    })),
    flags: entry.flags.map(jsonFlag),
    examples: [...entry.examples],
  };
  if (entry.aliasUsages?.length) doc.aliasUsages = [...entry.aliasUsages];
  if (entry.notes?.length) doc.notes = [...entry.notes];
  if (isGroup(entry)) {
    doc.subcommands = subcommandsOf(entry).map((sub) => ({
      command: pathKey(sub),
      summary: sub.summary,
      usage: sub.usage,
    }));
  }
  if (hasLifecycle(entry)) doc.lifecycle = attemptLifecycle();
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function renderCommandList() {
  return `${JSON.stringify({
    schemaVersion: HELP_SCHEMA_VERSION,
    commands: COMMANDS.map((entry) => ({
      command: pathKey(entry),
      summary: entry.summary,
      usage: entry.usage,
    })),
  }, null, 2)}\n`;
}

export function unknownTopicMessage(words) {
  const { entry, matched } = resolveTopic(words);
  if (entry && isGroup(entry)) {
    const names = subcommandsOf(entry).map((sub) => sub.path[sub.path.length - 1]);
    return `Unknown help topic: ${words.slice(0, matched.length + 1).join(' ')}\n`
      + `Subcommands of ${pathKey(entry)}: ${names.join(', ')}`;
  }
  const names = COMMANDS.filter((item) => item.path.length === 1).map((item) => item.path[0]);
  return `Unknown help topic: ${words[0]}\nCommands: ${names.join(', ')}`;
}

/**
 * Collect help topic words from argv: skip flags, the value of --path, and
 * the "help" command word when present.
 * @param {string[]} argv
 */
export function topicWords(argv) {
  const words = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') break;
    if (token === '--path') {
      i += 1;
      continue;
    }
    if (token.startsWith('-')) continue;
    words.push(token);
  }
  return words;
}

/**
 * Answer a help request.
 * @param {string[]} argv
 * @param {{ explicitHelp: boolean, globalText: string }} options
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function answerHelp(argv, { explicitHelp, globalText }) {
  const json = argv.slice(0, argv.indexOf('--') === -1 ? argv.length : argv.indexOf('--')).includes('--json');
  let words = topicWords(argv);
  if (words[0] === 'help') words = words.slice(1);
  if (words.length === 0) {
    return { code: 0, stdout: json ? renderCommandList() : globalText, stderr: '' };
  }
  const { entry, matched } = resolveTopic(words);
  if (!entry) {
    if (explicitHelp) return { code: 1, stdout: '', stderr: `${unknownTopicMessage(words)}\n` };
    return { code: 0, stdout: globalText, stderr: '' };
  }
  if (explicitHelp && isGroup(entry) && words.length > matched.length) {
    return { code: 1, stdout: '', stderr: `${unknownTopicMessage(words)}\n` };
  }
  return { code: 0, stdout: json ? renderJson(entry) : renderText(entry), stderr: '' };
}
