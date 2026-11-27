import { actionHelpLines, actionIds, AUTHORIZATION_REASONS } from './approval-actions.mjs';
import { ACTORS, RETRY_CLASSES } from './blocked-error.mjs';
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
  group(['autonomy'], 'Report how often and why a human was needed.', 'idefactory autonomy report [--change <name>] [--since <iso>] [--json] [--path dir]'),
  leaf(
    ['autonomy', 'report'],
    'Report human interventions, stops handled without a human, and autonomous recoveries from the control event log. Read-only.',
    'idefactory autonomy report [--change <name>] [--since <iso>] [--json] [--path dir]',
    {
      effects: READ_ONLY,
      flags: [
        { name: 'change', value: '<name>', required: false, description: 'Limit the report to one OpenSpec change.' },
        { name: 'since', value: '<iso>', required: false, description: 'Count only events at or after this ISO 8601 time.' },
        JSON_FLAG('Print one JSON document with schemaVersion 1: interventions, counts, autonomousRecoveries, unclassifiedEvents, routineClean, and scope.'),
        PATH_FLAG,
      ],
      examples: ['idefactory autonomy report', 'idefactory autonomy report --change add-auth --json'],
      notes: [
        'It reads .factory/observability/events.jsonl and nothing else. It writes no file and appends no event.',
        'Each stop that needs a human is one intervention in one category. policy-decision: an intentional human decision (approval-missing, halted, reviewer-lockout, budget-exhausted, reconciliation-required). failure: no supported recovery, or unclassified. redundant: a supported option that resolves the stop and that an agent may run existed. A stop whose actor is not human is counted as handled.',
        'The order is: not human is handled; then an agent-actionable option is redundant; then the policy set is a policy-decision; everything else is a failure.',
        'An autonomous recovery is a stop with no human actor that a later event resolved with no human decision between them.',
        'routineClean is true when the range holds no failure and no redundant intervention.',
        'The report carries codes, ids, and times only. It covers interventions the factory recorded, not prompts typed into an IDE chat.',
      ],
    },
  ),
  group(['checks'], 'Inspect the registered checks.', 'idefactory checks preview [--path dir]'),
  leaf(['checks', 'preview'], 'Preview the checks the registry would run.', 'idefactory checks preview [--path dir]', {
    effects: READ_ONLY,
    flags: [PATH_FLAG],
    examples: ['idefactory checks preview'],
  }),
  leaf(
    ['requirements'],
    'Print the resolved requirement set for one work item. Read-only; exits zero even when problems exist.',
    'idefactory requirements <change> <task> [--json] [--path dir]',
    {
      effects: READ_ONLY,
      arguments: [CHANGE_ARG, { name: 'task', required: true, description: 'Work item id, such as 1.1.' }],
      flags: [
        JSON_FLAG('Print one JSON document with schemaVersion 1: checks, redKinds, humanDecisions, dependencies, and problems.'),
        PATH_FLAG,
      ],
      examples: ['idefactory requirements my-change 1.1', 'idefactory requirements my-change 1.1 --json'],
      notes: [
        'checks lists every required check with its sources: profile, item, or both.',
        'redKinds lists the test kinds that need a failing red, or a red exception, before verifying.',
        'humanDecisions lists the accept and complete gates and whether the policy can satisfy them.',
        'problems lists what would stop an attempt from starting: an undefined profile, an unmapped check kind, an unsatisfiable gate, or a missing dependency. Each names the file that fixes it.',
        'Nothing is written.',
      ],
    },
  ),
  leaf(
    ['sync-tasks'],
    'Create work items from the unchecked boxes of an OpenSpec change, and reconcile a changed task list.',
    'idefactory sync-tasks <change> [--path dir]',
    {
      arguments: [CHANGE_ARG],
      flags: [
        { name: 'plan', value: null, required: false, description: 'Print what sync would do, every item that needs a decision, in-flight work, drift, dependents, overlapping changes, and a plan digest. Read-only.' },
        JSON_FLAG('With --plan, print one JSON document with schemaVersion 1. Otherwise print {ok, ...}; a failure prints {ok: false, message, blocked} and keeps its exit code.'),
        { name: 'apply', value: null, required: false, description: 'Apply explicit decisions from --decisions-file to the queue. Needs --plan-digest and --decided-by.' },
        { name: 'decisions-file', value: '<path>', required: false, description: 'JSON object keyed by stored item id; each value is a decision name or an object such as {"decision":"drop","dependents":"release"}.' },
        { name: 'plan-digest', value: '<digest>', required: false, description: 'The digest printed by --plan. Apply refuses when the queue or tasks.md changed since.' },
        { name: 'decided-by', value: '<id>', required: false, description: 'Deciding identity. For adopt-classification, drop, split, merge, and move on an item with an attempt past planned it must differ from the attempt implementer, and under policy version 2 it must be a verified principal.' },
        { name: 'principal-provider', value: '<id>', required: false, description: 'Under policy version 2, the verified principal provider.' },
        { name: 'principal-subject', value: '<id>', required: false, description: 'Under policy version 2, the verified principal subject; must equal --decided-by.' },
        PATH_FLAG,
      ],
      examples: [
        'idefactory sync-tasks add-auth',
        'idefactory sync-tasks add-auth --plan',
        'idefactory sync-tasks add-auth --apply --decisions-file decisions.json --plan-digest sha256:... --decided-by lead-1',
      ],
      notes: [
        'Appended tasks and checked tasks without items are handled automatically. A wording change on an item that has an attempt updates its title and keeps the earlier text in titleHistory; its classification is never rewritten and a difference is reported as drift.',
        'When sync reports a reconciliation error, run sync-tasks --plan. Do not create a separate change as a workaround.',
        'Decisions: keep, renumber ({"to":"1.4"}), defer, resume, drop ({"supersededBy":["1.5"],"dependents":"block|release"}), split ({"into":["1.4","1.5"]}), merge ({"into":"1.3"}), move ({"to":{"change":"other","id":"2.1"}}), adopt-classification, keep-classification.',
        'defer and drop keep the item, its attempts, and its evidence. A held item is never selected by next or run and cannot be completed. resume returns it to its previous status.',
        'Each apply writes a record under .factory/work/reconciliations/ and appends a tasks.reconciled event. Applying the same plan digest and decisions again changes nothing. Nothing infers a mapping from text similarity.',
      ],
    },
  ),
  leaf(
    ['next'],
    'Print one role-scoped work packet. Does not launch a model.',
    'idefactory next [--change name] [--path dir]',
    {
      flags: [
        { name: 'change', value: '<name>', required: false, description: 'Limit the packet to this OpenSpec change.' },
        JSON_FLAG('Print {ok, empty, text, blocked}. blocked is a blocked-state report when no work item is ready. The exit code does not change.'),
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
        { name: 'new-run', value: null, required: false, description: 'Open a new run session after a budget stop or retry-cap, up to run.maxNewRuns session files per change (default 3). Spend ceilings are never reset by it. Condition stops such as vacuous-red clear on their own once resolved, without this flag.' },
        { name: 'accept-baseline', value: null, required: false, description: 'Accept the current baseline for the run.' },
        JSON_FLAG('Print one JSON object {stopReason, exitCode, request, blocked, text} instead of the text. Exit codes do not change.'),
        PATH_FLAG,
      ],
      examples: ['idefactory run --change add-auth --until human-gate', 'idefactory run --change add-auth --json'],
      notes: [
        'Exit 2 means one IDE role should take the printed request. Exit 0 is a clean stop. Exit 1 is an error.',
        'With --json, blocked is null for a clean finish and otherwise a blocked-state report: invariant {code, message}, actor, recovery {supported, options[]}, and retry.',
        `Actors: ${ACTORS.join(', ')}. human means the next step needs authority only a human holds. independent-agent means it needs an identity other than the implementer's.`,
        'Each recovery option has id, supported, command (when supported), actor, requires, and resolves. supported means the command exists and its precondition holds now, not that it will succeed. When no option that resolves the stop is supported, recovery.supported is false, the message says so, and the actor is human.',
        `Retry classes: ${RETRY_CLASSES.join(', ')}. safe means the condition can clear without a change. only-after-change means the same stop repeats unless something recorded changes. never means a repeat is known to be refused.`,
        'A stop on a work item is also recorded in .factory/blocked/<change>--<task>.json and marked resolved by a later run that finds the condition gone. The record never decides whether work may proceed. The same report is available from next, complete, attempt transition, and sync-tasks with --json.',
        'A packet or request lists Standing decisions: approvals, standing authorizations, red exceptions, methods, and reconciliation decisions still valid for the item. Do not ask for them again. Listing one grants no authority.',
      ],
    },
  ),
  group(
    ['attempt'],
    'Start, transition, reopen, repoint, or show an execution attempt.',
    'idefactory attempt start|transition|reopen|repoint|show ...',
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
      notes: [
        'A live attempt with recorded evidence blocks a second start with invariant attempt-active. Continue that attempt instead.',
        'An empty live attempt is returned unchanged with reused: true.',
      ],
    },
  ),
  leaf(
    ['attempt', 'repoint'],
    'Point a work item at a different attempt, after previewing the repair.',
    'idefactory attempt repoint <change> <taskId> --attempt <id> [--apply --plan-digest <digest> --decided-by <id> --reason "<text>"] [--path dir]',
    {
      arguments: [
        CHANGE_ARG,
        { name: 'taskId', required: true, description: 'Work item task id.' },
      ],
      flags: [
        { name: 'attempt', value: '<id>', required: true, description: 'Attempt to make current.' },
        { name: 'apply', value: null, required: false, description: 'Write the repair. Without it the command only previews.' },
        { name: 'plan-digest', value: '<digest>', required: false, description: 'Digest printed by the preview. Required with --apply.' },
        { name: 'decided-by', value: '<id>', required: false, description: 'Identity recording the repair. Required with --apply.' },
        { name: 'reason', value: '<text>', required: false, description: 'Why the pointer is wrong. Required with --apply; stored in the repair record, not in events.' },
        PATH_FLAG,
      ],
      notes: [
        'Only the work item pointer and its history change. No attempt file, and no evidence on any attempt, is edited.',
        'When the attempt being displaced has evidence, --decided-by must differ from its implementer. Under policy version 2 it must also be the verified principal.',
        'The target must belong to the same change and task, must not be the current attempt, and must not be rejected.',
      ],
      examples: ['idefactory attempt repoint add-auth 1.1 --attempt 3f2c'],
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
        JSON_FLAG('A failure prints {ok: false, message, blocked} with a blocked-state report and exits non-zero as before. Success prints the attempt as usual.'),
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
  leaf(
    ['attempt', 'reopen'],
    'Move an accepted attempt back to awaiting-review so a missing red can be covered by a method or an exception.',
    'idefactory attempt reopen <attemptId> --kind <kind>... --for method|exception --by <id> --reason "text" [--principal-provider <id> --principal-subject <id>] [--path dir]',
    {
      arguments: [ATTEMPT_ARG],
      flags: [
        { name: 'kind', value: '<kind>', required: true, description: 'A required test kind with no red, method, or exception. Repeatable.' },
        { name: 'for', value: 'method|exception', required: true, description: 'What the amendment will be: a red method (method propose) or a red exception (red reuse or red waive).' },
        { name: 'by', value: '<id>', required: true, description: `Reopening identity; must differ from the implementer. Same format as attempt identities.` },
        { name: 'reason', value: '<text>', required: true, description: 'Why the attempt is reopened.' },
        { name: 'principal-provider', value: '<id>', required: false, description: 'Under governance policy version 2, the verified principal provider.' },
        { name: 'principal-subject', value: '<id>', required: false, description: 'Under governance policy version 2, the verified principal subject; must equal --by.' },
        PATH_FLAG,
      ],
      examples: [
        'idefactory attempt reopen <attemptId> --kind contract --for exception --by human-1 --reason "profile added contract after acceptance"',
      ],
      notes: [
        'Only an accepted attempt can be reopened, at most twice, never after finalization starts. Stored reds, verification, and exceptions are unchanged.',
        'The earlier review moves to the review history and does not count. A reviewer must accept the amended attempt again.',
        'While reopened, red reuse, red waive, and method propose accept only the named kinds.',
        'attempt transition still refuses accepted to awaiting-review.',
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
      notes: [
        'Reds are append-only: a second --red for a kind is kept next to the first, and the later one is the current red.',
        'A kind with a reuse exception or an ordinary waiver refuses --red. After an invalid-red waiver, one later red is allowed and satisfies red when it starts after the waiver.',
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
    'idefactory red reuse|waive|list ...',
  ),
  leaf(
    ['red', 'list'],
    'List every recorded red for an attempt with its digest, the exception that references it, and what satisfies red.',
    'idefactory red list <attemptId> [--json] [--path dir]',
    {
      effects: READ_ONLY,
      arguments: [ATTEMPT_ARG],
      flags: [JSON_FLAG('Print one JSON document with schemaVersion 1 and one entry per kind.'), PATH_FLAG],
      examples: ['idefactory red list <attemptId>', 'idefactory red list <attemptId> --json'],
    },
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
    ['red', 'invalidate'],
    'Withdraw a stored failing CLI red as not genuine. Grants nothing: the kind still needs a reviewed method, an exception, or a later failing red. Does not edit the red.',
    'idefactory red invalidate <attemptId> --kind <kind> --class <post-implementation|wrong-failure> --note "text" --by <identity> [--path dir]',
    {
      arguments: [{ name: 'attemptId', required: true, description: 'Attempt whose failing red is withdrawn.' }],
      flags: [
        { name: 'kind', value: '<kind>', required: true, description: 'Test kind whose current failing red is withdrawn.' },
        { name: 'class', value: 'post-implementation|wrong-failure', required: true, description: 'post-implementation: the red was recorded after implementation began. wrong-failure: the test failed on a fixture or unrelated fault, not the behavior under test.' },
        { name: 'note', value: '"text"', required: true, description: 'Why the red is not genuine. Kept in the record, never in the event log.' },
        { name: 'by', value: '<identity>', required: true, description: 'Identity recorded with the withdrawal. It need not differ from the implementer.' },
        PATH_FLAG,
      ],
      examples: [
        'idefactory red invalidate <attemptId> --kind unit --class post-implementation --note "recorded after the implementation was written" --by engineer-1',
      ],
      notes: [
        'At most two invalidations per kind on an attempt. After that, a human waiver with --invalid-red is the exit.',
        'An invalidated red does not satisfy red and does not block a method proposal. A failing CLI red recorded after the invalidation does satisfy red.',
        'The command is refused while HALT is present and requires the writer lease.',
      ],
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
        { name: 'acknowledge-not-stuck', value: null, required: false, description: 'Waive before the attempt has hit vacuous-red. Discouraged; use it only after the human acknowledges the warning. Required with --invalid-red.' },
        { name: 'invalid-red', value: '"text"', required: false, description: 'Invalidate the failing red already stored for each kind as recorded after implementation. The reason is kept with the waiver; the red does not satisfy red.' },
        ...PRINCIPAL_FLAGS,
        PATH_FLAG,
      ],
      examples: [
        'idefactory red waive <target> --kind test --note "code already passes" --approver human-1',
        'idefactory red waive <target> --kind unit --invalid-red "recorded after implementing" --note "post-hoc red" --approver human-1 --acknowledge-not-stuck',
      ],
      notes: [
        'A waiver is refused while a failing CLI red is stored for the kind. To withdraw a red that is not genuine, use red invalidate first; --invalid-red is the human acceptance of such a red.',
        'A kind can be invalidated once. After that, verify run --red may append one later red, which does not prove the test came first.',
        'A waiver does not replace passing verification, distinct review, or lockouts.',
      ],
    },
  ),
  group(
    ['method'],
    'Choose and review whether an attempt is test-first. The default is red-first.',
    'idefactory method propose|review|show ...',
  ),
  leaf(
    ['method', 'propose'],
    'Record a no-red method for a code attempt, with a reason class and rationale. No human approval is needed; a different role must review it.',
    'idefactory method propose <attemptId> --choice no-red --reason <class> --rationale "text" --implementer <id> --kind <kind>... [--test-path <path>...] [--path dir]',
    {
      arguments: [{ name: 'attemptId', required: true, description: 'Attempt that has not yet entered red-confirmed or verifying.' }],
      flags: [
        { name: 'choice', value: 'no-red', required: true, description: 'The method to record. red-first is the default and needs no record.' },
        { name: 'reason', value: '<class>', required: true, description: 'One of docs-or-text, configuration, behavior-preserving, mechanical, exploratory.' },
        { name: 'rationale', value: '"text"', required: true, description: 'Why a failing test cannot specify this change.' },
        { name: 'implementer', value: '<id>', required: true, description: 'Id of the implementer making the proposal.' },
        { ...KIND_FLAG, description: 'Required test kind the method covers. Repeat the flag for more than one kind.' },
        { name: 'test-path', value: '<path>', required: false, repeatable: true, description: 'Existing git-tracked test file that exercises the changed behavior. Required for behavior-preserving.' },
        PATH_FLAG,
      ],
      examples: [
        'idefactory method propose <attempt> --choice no-red --reason configuration --rationale "only edits a config value" --implementer engineer-1 --kind unit',
        'idefactory method propose <attempt> --choice no-red --reason behavior-preserving --rationale "pure rename" --implementer engineer-1 --kind unit --test-path test/parser.test.mjs',
      ],
      notes: [
        'Refused when the work item has an explicit factory.taskType, when a covered kind already has a failing red or an exception, when a kind is not required, or when a reviewer already rejected a no-red method for the item.',
        'The record keeps the source revision and the number of changed files so the reviewer can judge. It never counts as a red that ran and is not a red exception.',
        'It does not waive passing verification, distinct review, lockouts, or human gates.',
      ],
    },
  ),
  leaf(
    ['method', 'review'],
    'Record the reviewer\'s ACCEPT or REJECT of an attempt\'s no-red method. The reviewer must differ from the implementer.',
    'idefactory method review <attemptId> --verdict ACCEPT|REJECT --reviewer <id> --note "text" [--principal-provider <id> --principal-subject <id>] [--path dir]',
    {
      arguments: [{ name: 'attemptId', required: true, description: 'Attempt with a recorded no-red method.' }],
      flags: [
        { name: 'verdict', value: 'ACCEPT|REJECT', required: true, description: 'The reviewer\'s decision on the method.' },
        { name: 'reviewer', value: '<id>', required: true, description: 'Id of the reviewing role. Must not be the implementer.' },
        { name: 'note', value: '"text"', required: true, description: 'Why the method fits or does not fit the diff.' },
        ...PRINCIPAL_FLAGS,
        PATH_FLAG,
      ],
      examples: ['idefactory method review <attempt> --verdict ACCEPT --reviewer reviewer-1 --note "config-only diff"'],
      notes: [
        'An attempt with a no-red method cannot be accepted without an ACCEPT review.',
        'After a REJECT, later attempts for the item use red-first and a new proposal is refused.',
      ],
    },
  ),
  leaf(
    ['method', 'show'],
    'Show the method recorded for an attempt. Read-only.',
    'idefactory method show <attemptId> [--path dir]',
    {
      effects: READ_ONLY,
      arguments: [ATTEMPT_ARG],
      flags: [PATH_FLAG],
      examples: ['idefactory method show <attempt>'],
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
        JSON_FLAG('Print {ok, ...}. A failure prints {ok: false, message, blocked} with a blocked-state report and exits non-zero as before.'),
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
  leaf(['pr', 'capture'], 'Capture review comments from the pull request for a change.', 'idefactory pr capture <change> [--threads-file <path>] [--path dir]', {
    arguments: [CHANGE_ARG],
    flags: [
      { name: 'threads-file', value: '<path>', required: false, description: 'Azure DevOps thread JSON the agent read through the MCP. Only for the mcp transport.' },
      PATH_FLAG,
    ],
    examples: ['idefactory pr capture add-auth'],
  }),
  group(['ci'], 'Manage consumer CI.', 'idefactory ci scaffold [path] [--path dir]'),
  leaf(['ci', 'scaffold'], 'Write the consumer CI workflow.', 'idefactory ci scaffold [path] [--path dir]', {
    arguments: [PATH_ARG('Project directory. Defaults to the current directory.')],
    flags: [PATH_FLAG],
    examples: ['idefactory ci scaffold'],
  }),
  group(['board'], 'Mirror a change to an Azure DevOps board. Optional and off until configured.', 'idefactory board configure|publish|claim|report|comment|transition ...'),
  leaf(
    ['board', 'configure'],
    'Write the board settings to .factory/config.json.',
    'idefactory board configure --organization <url> --project <name> [--transport mcp|az] [--work-item-type <type>] [--tag <tag>] [--change-field <ref>] [--state-ready <name>] [six other state flags] [--path dir]',
    {
      flags: [
        { name: 'organization', value: '<url>', required: true, description: 'Azure DevOps organization URL.' },
        { name: 'project', value: '<name>', required: true, description: 'Azure DevOps project.' },
        { name: 'transport', value: 'mcp|az', required: false, description: 'How plans reach Azure DevOps. Defaults to mcp.' },
        { name: 'work-item-type', value: '<type>', required: false, description: 'Work item type for a change. Defaults to User Story.' },
        { name: 'tag', value: '<tag>', required: false, description: 'Tag on the work item. Defaults to factory.' },
        { name: 'change-field', value: '<ref>', required: false, description: 'Field holding the change name.' },
        { name: 'state-new', value: '<name>', required: false, description: 'Board state name for new work.' },
        { name: 'state-ready', value: '<name>', required: false, description: 'Board state name that requests a run.' },
        { name: 'state-in-progress', value: '<name>', required: false, description: 'Board state name while the factory works.' },
        { name: 'state-waiting', value: '<name>', required: false, description: 'Board state name while a human gate waits.' },
        { name: 'state-blocked', value: '<name>', required: false, description: 'Board state name when the run is blocked.' },
        { name: 'state-in-review', value: '<name>', required: false, description: 'Board state name while review is open.' },
        { name: 'state-ready-for-human-review', value: '<name>', required: false, description: 'Board state name when the pull request is ready for a human.' },
        PATH_FLAG,
      ],
      effects: WRITES,
      examples: ['idefactory board configure --organization https://dev.azure.com/acme --project Factory'],
    },
  ),
  leaf(['board', 'publish'], 'Create or update the work item for a change. With the mcp transport it prints a plan.', 'idefactory board publish <change> [--path dir]', {
    arguments: [CHANGE_ARG],
    flags: [PATH_FLAG],
    examples: ['idefactory board publish add-auth'],
  }),
  leaf(
    ['board', 'claim'],
    'Decide whether an automation start should start, resume, or skip a change.',
    'idefactory board claim <change> --work-item <id> [--snapshot <file>] [--revision N] [--run-url <url>] [--json] [--path dir]',
    {
      arguments: [CHANGE_ARG],
      flags: [
        { name: 'work-item', value: '<id>', required: true, description: 'Board work item id.' },
        { name: 'snapshot', value: '<file>', required: false, description: 'JSON snapshot of the work item the agent read.' },
        { name: 'revision', value: 'N', required: false, description: 'Work item revision the agent read.' },
        { name: 'run-url', value: '<url>', required: false, description: 'Link to this automation run.' },
        JSON_FLAG('Print the decision as JSON.'),
        PATH_FLAG,
      ],
      examples: ['idefactory board claim add-auth --work-item 1234 --json'],
    },
  ),
  leaf(['board', 'report'], 'Mirror completed tasks and state to the work item.', 'idefactory board report <change> [--path dir]', {
    arguments: [CHANGE_ARG],
    flags: [PATH_FLAG],
    examples: ['idefactory board report add-auth'],
  }),
  leaf(['board', 'comment'], 'Post one comment on the work item, once per key.', 'idefactory board comment <change> --message "text" [--key key] [--path dir]', {
    arguments: [CHANGE_ARG],
    flags: [
      { name: 'message', value: '"text"', required: true, description: 'Comment text.' },
      { name: 'key', value: 'key', required: false, description: 'Idempotency key. The same key posts once.' },
      PATH_FLAG,
    ],
    examples: ['idefactory board comment add-auth --message "Waiting on approval" --key gate-1'],
  }),
  leaf(
    ['board', 'transition'],
    'Move the work item to a state.',
    'idefactory board transition <change> --to in-progress|waiting|blocked|in-review|ready-for-human-review [--note "text"] [--path dir]',
    {
      arguments: [CHANGE_ARG],
      flags: [
        { name: 'to', value: 'in-progress|waiting|blocked|in-review|ready-for-human-review', required: true, description: 'Target state. The factory never moves a story to ready or done.' },
        { name: 'note', value: '"text"', required: false, description: 'Note recorded with the move.' },
        PATH_FLAG,
      ],
      examples: ['idefactory board transition add-auth --to waiting --note "human gate"'],
    },
  ),
  group(['forge'], 'Choose the forge behind idefactory pr.', 'idefactory forge configure --provider github|azure-devops ...'),
  leaf(
    ['forge', 'configure'],
    'Choose github (default) or azure-devops for pull requests.',
    'idefactory forge configure --provider github|azure-devops [--organization <url> --project <name> --repository <name> --transport mcp|az --target-branch <name>] [--path dir]',
    {
      flags: [
        { name: 'provider', value: 'github|azure-devops', required: true, description: 'Forge provider.' },
        { name: 'organization', value: '<url>', required: false, description: 'Azure DevOps organization URL.' },
        { name: 'project', value: '<name>', required: false, description: 'Azure DevOps project.' },
        { name: 'repository', value: '<name>', required: false, description: 'Azure Repos repository.' },
        { name: 'transport', value: 'mcp|az', required: false, description: 'How plans reach Azure DevOps. Defaults to mcp.' },
        { name: 'target-branch', value: '<name>', required: false, description: 'Branch a pull request targets.' },
        PATH_FLAG,
      ],
      effects: WRITES,
      examples: ['idefactory forge configure --provider azure-devops --organization https://dev.azure.com/acme --project Factory --repository app'],
    },
  ),
  group(['mcp'], 'Record or list plans applied through the Azure DevOps MCP.', 'idefactory mcp ack|record|pending ...'),
  leaf(
    ['mcp', 'ack'],
    'Record that the agent applied a plan through the MCP, with the result.',
    'idefactory mcp ack <planId> [--result <json> | --result-file <path>] [--path dir]',
    {
      arguments: [{ name: 'planId', required: true, description: 'Plan id printed with the plan.' }],
      flags: [
        { name: 'result', value: '<json>', required: false, description: 'Result of the MCP call as JSON. Not with --result-file.' },
        { name: 'result-file', value: '<path>', required: false, description: 'File holding the result JSON. Not with --result.' },
        PATH_FLAG,
      ],
      effects: WRITES,
      notes: [
        'Ack refuses when the latest record of any operation is failed or unknown. It then changes nothing and the plan stays pending.',
        'Without any records for a plan, ack behaves as it did before records existed.',
      ],
      examples: ['idefactory mcp ack <planId> --result-file result.json'],
    },
  ),
  leaf(['mcp', 'record'], 'Record your judgment about one failed plan operation: what happened, the cause, and the decision.', 'idefactory mcp record <planId> --operation <n> --outcome <applied|failed|unknown> [--cause <code>] --decision <code> [--readback <present|absent|unavailable>] [--note "text"] [--path dir]', {
    arguments: [{ name: 'planId', required: true, description: 'Plan id printed with the plan.' }],
    flags: [
      { name: 'operation', value: '<n>', required: true, description: 'Operation number in the plan, starting at 1.' },
      { name: 'outcome', value: 'applied|failed|unknown', required: true, description: 'What the operation did as far as you can tell. applied means it succeeded, including a retry that succeeded.' },
      { name: 'cause', value: 'transient|conflict|permission|invalid-request|not-found|unknown', required: false, description: 'Why it failed. Required for failed and unknown. Not given with applied.' },
      { name: 'decision', value: 'retry|retry-after-readback|skip-applied|replan|abandon|escalate', required: true, description: 'What you do next. retry, retry-after-readback, and replan repeat the operation. skip-applied records that the effect already landed.' },
      { name: 'readback', value: 'present|absent|unavailable', required: false, description: 'Result of the operation read-back. Required for skip-applied (present) and retry-after-readback (absent).' },
      { name: 'note', value: '"text"', required: false, description: 'Your reasoning. Kept only in the progress file, never in events.' },
      PATH_FLAG,
    ],
    effects: WRITES,
    notes: [
      'Each record appends one line to .factory/mcp/<planId>.progress.jsonl. The plan file is not changed.',
      'check-first operations (creates, comments, links, and thread creates) are retried only after a read-back of absent. A read-back of present allows only skip-applied. A read-back of unavailable allows only escalate. A check-first operation with no read-back defined cannot be retried.',
      'Retries per operation are capped by mcp.maxOperationAttempts in .factory/config.json (default 3, range 1 to 10). Past the cap a retry is refused and the output is a blocked report with operation-retry-cap.',
      'escalate, and abandon with a cause other than conflict, record a stop that needs a human. abandon with cause conflict means another run owns the story and is handled without a human.',
    ],
    examples: [
      'idefactory mcp record plan-0123456789ab --operation 2 --outcome failed --cause transient --decision retry --readback absent',
      'idefactory mcp record plan-0123456789ab --operation 1 --outcome failed --cause conflict --decision abandon',
    ],
  }),
  leaf(['mcp', 'pending'], 'List plans that were printed and not acknowledged, with each operation\'s latest outcome and retry count.', 'idefactory mcp pending [--json] [--path dir]', {
    flags: [JSON_FLAG('Print the plans as JSON.'), PATH_FLAG],
    effects: READ_ONLY,
    examples: ['idefactory mcp pending --json'],
  }),
  leaf(
    ['approve'],
    'Record a scoped human approval or a bounded standing authorization. Does not publish, deploy, or spend.',
    `idefactory approve <id> --note "text" --change <name> --task <id> --action <${actionIds().join('|')}> --approver <id> --principal-provider <id> --principal-subject <id> --expiry <iso> [--target <name>] [--standing] [--path dir]`,
    {
      aliasUsages: ['idefactory approve <id> --note "text" --change <name> --task <id> --action <accept|complete> --approver <id> --principal-provider <id> --principal-subject <id> --expiry <iso> [--path dir]'],
      arguments: [{ name: 'id', required: true, description: 'Approval id.' }],
      flags: [
        NOTE_FLAG,
        { name: 'change', value: '<name>', required: true, description: 'OpenSpec change the approval covers.' },
        { name: 'task', value: '<id>', required: true, description: 'Task the approval covers. Omit with --standing.' },
        { name: 'action', value: `<${actionIds().join('|')}>`, required: true, description: 'Action the approval allows.' },
        { name: 'target', value: '<name>', required: false, description: 'What the effect applies to, such as an environment or registry. Required for publish, deploy, spend, and account. Matched exactly.' },
        { name: 'standing', value: null, required: false, description: 'Issue a standing authorization for an external-effect action: bound to the change and target, not to a task or revision. Needs governance policy version 2 and a verified principal. Lifetime is capped by governance.standingMaxHours (default 168).' },
        { name: 'approver', value: '<id>', required: true, description: 'Id of the approving human. Must not be the implementer.' },
        { name: 'principal-provider', value: '<id>', required: true, description: 'Principal verifier provider.' },
        { name: 'principal-subject', value: '<id>', required: true, description: 'Principal verifier subject.' },
        { name: 'expiry', value: '<iso>', required: true, description: 'Expiry time in ISO 8601. Within 24 hours, or within the standing maximum for --standing.' },
        PATH_FLAG,
      ],
      examples: [
        'idefactory approve a1 --note "ship it" --change add-auth --task 1.1 --action accept --approver human-1 --principal-provider local --principal-subject human-1 --expiry 2030-01-01T00:00:00Z',
        'idefactory approve d1 --note "staging deploys" --change add-auth --action deploy --target staging --standing --approver human-1 --principal-provider local --principal-subject human-1 --expiry 2030-01-01T00:00:00Z',
      ],
      notes: [
        'Actions and what they bind to:',
        ...actionHelpLines(),
      ],
    },
  ),
  leaf(
    ['authorize'],
    'Ask whether an action is authorized now. Read-only: never writes and never performs the action.',
    'idefactory authorize --change <name> [--task <id>] --action <action> [--target <name>] [--json] [--path dir]',
    {
      effects: READ_ONLY,
      flags: [
        { name: 'change', value: '<name>', required: true, description: 'OpenSpec change.' },
        { name: 'task', value: '<id>', required: false, description: 'Task. Required for accept and complete.' },
        { name: 'action', value: `<${actionIds().join('|')}>`, required: true, description: 'Action to check.' },
        { name: 'target', value: '<name>', required: false, description: 'Target. Required for publish, deploy, spend, and account.' },
        JSON_FLAG('Print one JSON document with authorized, the request, and the approval id or the reason and approve command.'),
        PATH_FLAG,
      ],
      examples: ['idefactory authorize --change add-auth --action deploy --target staging --json'],
      notes: [
        'Exits zero whether or not the action is authorized. A malformed request exits non-zero.',
        'Output has authorized, and the approval id when allowed. When not allowed it has a reason and the approve command a human would run.',
        `Reasons: ${AUTHORIZATION_REASONS.join(', ')}.`,
        'Run it before an external-effect step. Continue when authorized is true. Stop and report the reason when it is false.',
      ],
    },
  ),
  leaf(
    ['revoke'],
    'Revoke an approval or standing authorization. The original record is left unchanged.',
    'idefactory revoke <id> --note "text" [--revoker <id> --principal-provider <id> --principal-subject <id>] [--path dir]',
    {
      arguments: [{ name: 'id', required: true, description: 'Id of the approval to revoke.' }],
      flags: [
        NOTE_FLAG,
        { name: 'revoker', value: '<id>', required: false, description: 'Id of the revoking human. Required with governance policy version 2.' },
        { name: 'principal-provider', value: '<id>', required: false, description: 'Principal verifier provider.' },
        { name: 'principal-subject', value: '<id>', required: false, description: 'Principal verifier subject.' },
        PATH_FLAG,
      ],
      examples: ['idefactory revoke d1 --note "deploy window closed"'],
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
        { name: 'argv', value: '<part>', required: false, repeatable: true, description: 'One argument of the command for the preceding --map. Repeat for each part. To pass a part that begins with "--", use the equals form: --argv=--filter.' },
        { name: 'argv-json', value: '<json-array>', required: false, description: 'The whole command for the preceding --map as one JSON array of strings, stored exactly as given. Use it for parts with spaces, pipes, quotes, or a leading "--".' },
        { name: 'no-test', value: null, required: false, description: 'Record that the project has no test command.' },
        { name: 'verifier-argv', value: '<part>', required: false, repeatable: true, description: 'One argument of the principal verifier command. Repeat for each part.' },
        PATH_FLAG,
      ],
      examples: [
        'idefactory setup --detect',
        'idefactory setup --governance lightweight --map test --argv npm --argv test',
        `idefactory setup --governance lightweight --map unit --argv-json '["dotnet","test","--filter","Category=Unit | Category=Integration"]'`,
        'idefactory setup --governance lightweight --map unit --argv dotnet --argv test --argv=--filter --argv "Category=Unit"',
      ],
      notes: [
        'Setup stores each argv exactly as given and runs it without a shell. A flag that needs a value fails instead of storing a placeholder.',
        'An argv of one element that contains whitespace is refused as a shell string. Later elements may contain whitespace, pipes, and quotes.',
      ],
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
    text: 'Needs a recorded failing red for every test kind in the resolved requirement set (item and profile checks together; see "requirements"), or a red exception, or a no-red method that covers the kind (see "method propose"). Lightweight tasks skip this.',
  },
  {
    state: 'awaiting-review',
    text: 'Needs passing check evidence for every required check. Security-sensitive work cannot go straight from verifying; it goes through security-checking, whose exit needs verdict ACCEPT and a securityReviewerId that differs from the implementer.',
  },
  {
    state: 'accepted',
    text: 'Needs a reviewerId (in evidence or already on the attempt) and a verdict of ACCEPT if a verdict is given. An attempt with a no-red method also needs an ACCEPT "method review" from a reviewer other than the implementer.',
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
