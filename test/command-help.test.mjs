import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  ATTEMPT_STATES,
  SUPPLIED_EVIDENCE_TYPES,
  TRANSITIONS,
  attemptPath,
  getAttempt,
} from '../src/lib/attempt.mjs';
import {
  ATTEMPT_PRECONDITIONS,
  COMMANDS,
  attemptLifecycle,
  findEntry,
  isGroup,
  pathKey,
  resolveTopic,
} from '../src/lib/command-help.mjs';
import { parseArgs, run } from '../src/lib/run.mjs';
import { cliCommandKey, isMutatingCommand } from '../src/lib/writer-lease.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

const GLOBAL_HELP_DIGEST = 'c31d77f91c84e7cfe683e0ec67c23ba01e54be8e7eb07228cbf6729ff36dcf32';

async function cli(args, cwd = os.tmpdir()) {
  let out = '';
  let err = '';
  const code = await run(args, {
    cwd,
    env: { ...process.env },
    isTTY: false,
    stdout: { write(chunk) { out += chunk; return true; } },
    stderr: { write(chunk) { err += chunk; return true; } },
  });
  return { code, out, err };
}

function emptyDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'idefactory-help-'));
}

function digestOf(text) {
  return createHash('sha256').update(text).digest('hex');
}

function treeSnapshot(root) {
  const entries = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        entries.push(`${path.relative(root, full)}/`);
        walk(full);
      } else {
        entries.push(`${path.relative(root, full)} ${stat.size} ${stat.mtimeMs} ${digestOf(fs.readFileSync(full))}`);
      }
    }
  };
  walk(root);
  return entries;
}

test('TRANSITIONS only names known attempt states', () => {
  for (const [from, targets] of Object.entries(TRANSITIONS)) {
    assert.ok(ATTEMPT_STATES.includes(from), from);
    for (const to of targets) assert.ok(ATTEMPT_STATES.includes(to), `${from} -> ${to}`);
  }
  for (const state of ATTEMPT_STATES) assert.ok(state in TRANSITIONS, `${state} has a transitions entry`);
});

test('every command entry has a summary, a usage line, and an example', () => {
  for (const entry of COMMANDS) {
    assert.ok(entry.summary.length > 0, pathKey(entry));
    assert.match(entry.usage, /^idefactory /, pathKey(entry));
    if (!isGroup(entry)) assert.ok(entry.examples.length > 0, `${pathKey(entry)} has an example`);
  }
});

test('command groups resolve as groups and list their subcommands', () => {
  for (const name of ['attempt', 'verify', 'red', 'pr', 'adapters', 'ci', 'lockout']) {
    const entry = findEntry([name]);
    assert.ok(entry, name);
    assert.ok(isGroup(entry), `${name} is a group`);
  }
  assert.equal(isGroup(findEntry(['attempt', 'transition'])), false);
  assert.equal(isGroup(findEntry(['init'])), false);
});

test('topic resolution takes the longest matching path and ignores trailing values', () => {
  assert.equal(pathKey(resolveTopic(['attempt', 'transition']).entry), 'attempt transition');
  assert.equal(pathKey(resolveTopic(['attempt', 'transition', 'abc-123']).entry), 'attempt transition');
  assert.equal(pathKey(resolveTopic(['attempt']).entry), 'attempt');
  assert.equal(pathKey(resolveTopic(['attempt', 'transitoin']).entry), 'attempt');
  assert.equal(resolveTopic(['frobnicate']).entry, null);
  assert.equal(resolveTopic([]).entry, null);
});

test('--help and -h set the help flag and consume no value', () => {
  const long = parseArgs(['--help', 'attempt', 'transition']);
  assert.equal(long.cmd, 'attempt');
  assert.deepEqual(long.rest, ['transition']);
  assert.equal(long.flags.help, true);

  const short = parseArgs(['verify', 'run', '-h']);
  assert.equal(short.cmd, 'verify');
  assert.equal(short.flags.help, true);
  assert.deepEqual(short.rest, ['run']);
});

test('a value flag still takes -h as its value', () => {
  const parsed = parseArgs(['reject', 'a1', '--note', '-h']);
  assert.equal(parsed.flags.note, '-h');
  assert.equal(parsed.flags.help, undefined);
});

test('help by topic, by --help, by -h, and with --help first match', async () => {
  const topic = await cli(['help', 'attempt', 'transition']);
  assert.equal(topic.code, 0);
  assert.equal(topic.err, '');
  assert.match(topic.out, /^idefactory attempt transition - /);
  assert.match(topic.out, /idefactory attempt transition <attemptId> <state> \[--evidence json \| --evidence-file path\]/);
  assert.doesNotMatch(topic.out, /idefactory init /);
  for (const args of [
    ['attempt', 'transition', '--help'],
    ['attempt', 'transition', '-h'],
    ['--help', 'attempt', 'transition'],
  ]) {
    const result = await cli(args);
    assert.equal(result.code, 0, args.join(' '));
    assert.equal(result.out, topic.out, args.join(' '));
  }
  const verify = await cli(['help', 'verify', 'run']);
  assert.equal((await cli(['verify', 'run', '-h'])).out, verify.out);
});

test('transition help names both evidence flags and says to give only one', async () => {
  const { out } = await cli(['help', 'attempt', 'transition']);
  assert.match(out, /--evidence <json>/);
  assert.match(out, /--evidence-file <path>/);
  assert.match(out, /Give only one of --evidence and --evidence-file/);
});

test('help states whether a command writes', async () => {
  assert.match((await cli(['help', 'verify', 'run'])).out, /Effects: writes project state/);
  assert.match((await cli(['help', 'attempt', 'show'])).out, /Effects: read-only/);
  assert.match((await cli(['help', 'setup'])).out, /Effects: writes project state, read-only with --detect/);
});

test('group help lists the subcommands', async () => {
  const { out, code } = await cli(['help', 'attempt']);
  assert.equal(code, 0);
  assert.match(out, /^\s+start\s+/m);
  assert.match(out, /^\s+transition\s+/m);
  assert.match(out, /^\s+show\s+/m);
  const lockout = (await cli(['help', 'lockout'])).out;
  assert.match(lockout, /^\s+create\s+/m);
  assert.match(lockout, /^\s+resolve\s+/m);
});

test('global help keeps its exact text for help, --help, and no command', async () => {
  for (const args of [[], ['help'], ['--help']]) {
    const result = await cli(args);
    assert.equal(result.code, 0);
    assert.equal(digestOf(result.out), GLOBAL_HELP_DIGEST, args.join(' ') || '(none)');
  }
});

test('an unknown command with --help prints the global text and exits zero', async () => {
  const result = await cli(['frobnicate', '--help']);
  assert.equal(result.code, 0);
  assert.equal(digestOf(result.out), GLOBAL_HELP_DIGEST);
});

test('an unknown help topic exits non-zero and lists what is known', async () => {
  const misspelled = await cli(['help', 'attempt', 'transitoin']);
  assert.equal(misspelled.code, 1);
  assert.equal(misspelled.out, '');
  assert.match(misspelled.err, /Unknown help topic: attempt transitoin/);
  assert.match(misspelled.err, /Subcommands of attempt: start, transition, reopen, show/);

  const unknown = await cli(['help', 'frobnicate']);
  assert.equal(unknown.code, 1);
  assert.equal(unknown.out, '');
  assert.match(unknown.err, /Unknown help topic: frobnicate/);
  assert.match(unknown.err, /Commands: .*attempt.*verify/);
});

test('transition help lists the lifecycle from the enforcing definitions', async () => {
  const { out } = await cli(['help', 'attempt', 'transition']);
  const lifecycle = attemptLifecycle();
  assert.deepEqual(lifecycle.states, ATTEMPT_STATES);
  assert.deepEqual(lifecycle.evidence.map((item) => item.key), Object.keys(SUPPLIED_EVIDENCE_TYPES));
  for (const item of lifecycle.evidence) {
    assert.equal(item.type, SUPPLIED_EVIDENCE_TYPES[item.key]);
    assert.match(out, new RegExp(`^\\s+${item.key}\\s+${item.type.replace('[]', '\\[\\]')}$`, 'm'));
  }
  for (const [from, targets] of Object.entries(TRANSITIONS)) {
    const expected = targets.length ? targets.join(', ') : '\\(final\\)';
    assert.match(out, new RegExp(`^\\s+${from}\\s+->\\s+${expected}$`, 'm'));
  }
  const plannedLine = out.split('\n').find((line) => /^\s+planned\s+->/.test(line));
  assert.doesNotMatch(plannedLine, /verifying|accepted/);
  for (const key of ['red', 'verification', 'security', 'review']) {
    assert.doesNotMatch(out, new RegExp(`^\\s+${key}\\s+(string|string\\[\\])$`, 'm'));
  }
});

test('transition help states the entry preconditions', async () => {
  const { out } = await cli(['help', 'attempt', 'transition']);
  assert.match(out, /awaiting-review: Needs passing check evidence for every required check/);
  assert.match(out, /accepted: Needs a reviewerId/);
});

test('JSON help for a command has the documented shape', async () => {
  const result = await cli(['help', 'verify', 'run', '--json']);
  assert.equal(result.code, 0);
  const doc = JSON.parse(result.out);
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.command, 'verify run');
  assert.equal(doc.effects, 'writes');
  assert.equal(doc.usage, 'idefactory verify run <attemptId> --check <kind> [--red]');
  assert.ok(doc.examples.length > 0);
  const check = doc.flags.find((flag) => flag.name === 'check');
  const red = doc.flags.find((flag) => flag.name === 'red');
  assert.equal(check.required, true);
  assert.equal(red.required, false);
  assert.equal(doc.lifecycle, undefined);
  assert.deepEqual((await cli(['verify', 'run', '--help', '--json'])).out, result.out);
});

test('JSON help for a group lists subcommands, and the command list names every command', async () => {
  const group = JSON.parse((await cli(['help', 'attempt', '--json'])).out);
  assert.deepEqual(group.subcommands.map((sub) => sub.command), ['attempt start', 'attempt transition', 'attempt reopen', 'attempt show']);
  assert.equal(group.effects, 'varies');

  const list = JSON.parse((await cli(['help', '--json'])).out);
  assert.equal(list.schemaVersion, 1);
  assert.deepEqual(list.commands.map((item) => item.command), COMMANDS.map(pathKey));
  for (const item of list.commands) {
    assert.ok(item.summary && item.usage, item.command);
  }
});

test('JSON help for attempt transition carries the lifecycle', async () => {
  const doc = JSON.parse((await cli(['help', 'attempt', 'transition', '--json'])).out);
  assert.deepEqual(doc.lifecycle.states, ATTEMPT_STATES);
  assert.deepEqual(
    doc.lifecycle.transitions,
    ATTEMPT_STATES.map((from) => ({ from, to: TRANSITIONS[from] })),
  );
  assert.deepEqual(
    doc.lifecycle.evidence,
    Object.entries(SUPPLIED_EVIDENCE_TYPES).map(([key, type]) => ({ key, type })),
  );
  assert.deepEqual(
    doc.lifecycle.preconditions.map((item) => item.state),
    ATTEMPT_PRECONDITIONS.map((item) => item.state),
  );
});

test('help works outside a project and creates nothing', async () => {
  const dir = emptyDir();
  try {
    for (const args of [['help', 'attempt', 'transition'], ['verify', 'run', '--help'], ['help', '--json']]) {
      const result = await cli(args, dir);
      assert.equal(result.code, 0, args.join(' '));
    }
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    cleanup(dir);
  }
});

test('help works while HALT exists', async () => {
  const dir = tempProject();
  try {
    fs.writeFileSync(path.join(dir, 'HALT'), 'stop\n');
    const result = await idefactory(dir, ['help', 'verify', 'run']);
    assert.equal(result.code, 0);
    assert.match(result.out, /^idefactory verify run - /);
    const flagged = await idefactory(dir, ['attempt', 'transition', '--help']);
    assert.equal(flagged.code, 0);
  } finally {
    cleanup(dir);
  }
});

test('help for every command leaves an initialized project untouched and takes no lease', async () => {
  const dir = tempProject();
  try {
    assert.equal((await idefactory(dir, ['init'])).code, 0);
    const before = treeSnapshot(dir);
    for (const entry of COMMANDS) {
      for (const style of ['topic', 'flag', 'json']) {
        const args = style === 'topic'
          ? ['help', ...entry.path]
          : style === 'flag'
            ? [...entry.path, '--help']
            : ['help', ...entry.path, '--json'];
        const result = await idefactory(dir, args);
        assert.equal(result.code, 0, `${args.join(' ')}: ${result.err}`);
      }
    }
    assert.deepEqual(treeSnapshot(dir), before);
    assert.equal(fs.existsSync(path.join(dir, '.factory', 'orchestration', 'writer.lease')), false);
  } finally {
    cleanup(dir);
  }
});

function dispatchedCommands() {
  const source = fs.readFileSync(path.join(repoRoot, 'src/lib/run.mjs'), 'utf8');
  const start = source.indexOf('async function dispatchCommand');
  const end = source.indexOf('function handleAttempt');
  return [...source.slice(start, end).matchAll(/^ {4}case '([a-z-]+)':/gm)].map((match) => match[1]);
}

test('every dispatched command has help', () => {
  const dispatched = dispatchedCommands();
  assert.ok(dispatched.length >= 20, 'found the dispatch cases');
  for (const name of dispatched) {
    assert.ok(findEntry([name]), `${name} has help`);
  }
});

test('every usage line in the global help matches a command entry', async () => {
  const { out } = await cli(['help']);
  const lines = out.split('\n').filter((line) => line.startsWith('  idefactory '));
  assert.ok(lines.length > 20);
  const known = new Set(COMMANDS.flatMap((entry) => [entry.usage, ...(entry.aliasUsages || [])]).map((usage) => `  ${usage}`));
  for (const line of lines) assert.ok(known.has(line), `no entry for: ${line.trim()}`);
});

test('every flag named in help is read by the CLI source', () => {
  const sources = [
    ...fs.readdirSync(path.join(repoRoot, 'src/lib')).map((name) => path.join(repoRoot, 'src/lib', name)),
    path.join(repoRoot, 'src/cli.mjs'),
  ].filter((file) => file.endsWith('.mjs') && !file.endsWith('command-help.mjs')).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  for (const entry of COMMANDS) {
    for (const flag of entry.flags) {
      const quoted = new RegExp(`['"]${flag.name}['"]`);
      const dotted = new RegExp(`flags\\.${flag.name.replace(/-/g, '')}\\b`);
      assert.ok(
        quoted.test(sources) || dotted.test(sources) || (!flag.name.includes('-') && new RegExp(`flags\\.${flag.name}\\b`).test(sources)),
        `--${flag.name} on ${pathKey(entry)} is not read by the CLI`,
      );
    }
  }
});

test('every flag named in a usage line is documented as a flag', () => {
  for (const entry of COMMANDS) {
    if (isGroup(entry)) continue;
    const documented = new Set(entry.flags.map((flag) => flag.name));
    for (const match of entry.usage.matchAll(/--([a-z][a-z-]*)/g)) {
      assert.ok(documented.has(match[1]), `${pathKey(entry)} usage names --${match[1]} without documenting it`);
    }
  }
});

test('documented effects agree with the writer-lease classification', () => {
  for (const entry of COMMANDS) {
    if (isGroup(entry) || entry.path[0] === 'help') continue;
    const key = cliCommandKey(entry.path[0], entry.path.slice(1), {});
    const mutating = isMutatingCommand(key) || entry.path[0] === 'halt';
    assert.equal(entry.effects === 'writes', mutating, `${pathKey(entry)} (lease key "${key}")`);
  }
  assert.equal(findEntry(['help']).effects, 'read-only');
});

function guardedStatesInValidateEvidence() {
  const source = fs.readFileSync(path.join(repoRoot, 'src/lib/attempt.mjs'), 'utf8');
  const start = source.indexOf('function validateEvidence');
  const end = source.indexOf('function assertSecurityReviewerVerdict');
  return new Set([...source.slice(start, end).matchAll(/nextState === '([a-z-]+)'/g)].map((match) => match[1]));
}

test('every state validateEvidence guards has a precondition sentence', () => {
  assert.deepEqual(
    new Set(ATTEMPT_PRECONDITIONS.map((item) => item.state)),
    guardedStatesInValidateEvidence(),
  );
  for (const item of ATTEMPT_PRECONDITIONS) assert.ok(ATTEMPT_STATES.includes(item.state), item.state);
});

async function seedAttemptAt(dir, state) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  const configPath = path.join(dir, '.factory/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.governance.policyVersion = 1;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  fs.writeFileSync(
    path.join(dir, '.factory/checks.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      checks: {
        unit: {
          argv: [process.execPath, '-e', 'process.exit(0)'],
          cwdPolicy: 'project',
          timeoutMs: 30_000,
          artifacts: [],
        },
      },
    }, null, 2)}\n`,
  );
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'openspec/changes/demo/tasks.md'),
    [
      '- [ ] 1.1 Add parser',
      '  factory:',
      '    kind: general',
      '    checks: [unit]',
      '    verificationProfile: cli',
      '    roles: [engineer, reviewer, scribe]',
      '',
    ].join('\n'),
  );
  assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
  const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
  assert.equal(started.code, 0, started.err);
  const attempt = JSON.parse(started.out);
  const stored = getAttempt(dir, attempt.id);
  stored.state = state;
  fs.writeFileSync(attemptPath(dir, attempt.id), JSON.stringify(stored, null, 2));
  return attempt.id;
}

const PRECONDITION_DRIVERS = [
  { target: 'red-confirmed', from: 'implementing', phrase: /red-confirmed requires stored evidence\.red/ },
  { target: 'verifying', from: 'implementing', phrase: /verifying requires a recorded failing CLI red for/ },
  { target: 'awaiting-review', from: 'verifying', phrase: /awaiting-review requires passing check evidence for/ },
  { target: 'accepted', from: 'awaiting-review', phrase: /accepted requires evidence\.reviewerId/ },
  { target: 'rejected', from: 'awaiting-review', phrase: /rejected requires evidence\.reviewerId/ },
];

test('each documented precondition is enforced by the command', async () => {
  assert.deepEqual(
    PRECONDITION_DRIVERS.map((item) => item.target).sort(),
    ATTEMPT_PRECONDITIONS.map((item) => item.state).sort(),
  );
  for (const driver of PRECONDITION_DRIVERS) {
    const dir = tempProject();
    try {
      const id = await seedAttemptAt(dir, driver.from);
      assert.ok(TRANSITIONS[driver.from].includes(driver.target), `${driver.from} -> ${driver.target} is allowed`);
      const refused = await idefactory(dir, ['attempt', 'transition', id, driver.target]);
      assert.notEqual(refused.code, 0, driver.target);
      assert.match(refused.err, driver.phrase, driver.target);
      assert.equal(getAttempt(dir, id).state, driver.from);
    } finally {
      cleanup(dir);
    }
  }
});
