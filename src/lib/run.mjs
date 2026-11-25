import fs from 'node:fs';
import path from 'node:path';
import { getAttempt, startAttempt, transitionAttempt } from './attempt.mjs';
import { completeWorkItem } from './complete.mjs';
import { approve, createLockout, doctor, reject, resolveLockout, status } from './govern.mjs';
import { buildStatusDocument } from './read-model.mjs';
import { previewChecks } from './checks-preview.mjs';
import { formatReport } from './adapter-sync.mjs';
import { setPins } from './adapters.mjs';
import { initProject, upgradeProject } from './install.mjs';
import { halted, projectDir } from './layout.mjs';
import { EXIT_NEEDS_AGENT, runFactory } from './orchestrate.mjs';
import { buildPacket, syncTasks } from './queue.mjs';
import { scaffoldConsumerCi } from './ci-scaffold.mjs';
import { capturePullRequestComments, commentOnPullRequest, openPullRequest } from './pull-request.mjs';
import { mapsFromSequence, setupProject, setupReadinessErrors } from './setup.mjs';
import { LOCKOUT_CREATE_USAGE, LOCKOUT_RESOLVE_USAGE } from './usage-lines.mjs';
import { TRANSITION_USAGE, readTransitionEvidence } from './evidence-input.mjs';
import { reuseRed, waiveRed } from './red-exceptions.mjs';
import { verifyImport, verifyRun } from './verification-evidence.mjs';
import { renderVerifyStatusText, verifyStatus } from './verification-status.mjs';
import { answerHelp } from './command-help.mjs';
import { cliCommandKey, isMutatingCommand, withWriterLease } from './writer-lease.mjs';
import { consumeEventWarning } from './event-log.mjs';
import { closeLatestRunSession } from './run-session.mjs';

const HELP = `idefactory — IDE-native software factory

The IDE session model does the work. This CLI installs shared state, manages
the work queue and attempts, and prints orchestration requests. It does not
launch a model, and it does not invent products.

Usage:
  idefactory init [path] [--force-roster] [--with-openspec] [--dry-run] [--json] [--replace <path>] [--force]
  idefactory upgrade [path] [--dry-run] [--json] [--replace <path>] [--force]
  idefactory adapters pin <path>... | unpin <path>... [--path dir]
  idefactory doctor [path]
  idefactory status [--json] [path]
  idefactory checks preview [--path dir]
  idefactory sync-tasks <change> [--path dir]
  idefactory next [--change name] [--path dir]
  idefactory run --change <name> [--until human-gate] [--max-tasks N] [--max-agent-steps N] [--new-run] [--accept-baseline] [--path dir]
  idefactory attempt start <change> <taskId> [--path dir]
  idefactory attempt transition <attemptId> <state> [--evidence json | --evidence-file path] [--path dir]
  idefactory attempt show <attemptId> [--path dir]
  idefactory verify run <attemptId> --check <kind> [--red]
  idefactory verify import <attemptId> --file <path>
  idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind>... --note "text" --approver <id> [--principal-provider <id> --principal-subject <id>] [--path dir]
  idefactory red waive <targetAttemptId> --kind <kind>... --note "text" --approver <id> [--acknowledge-not-stuck] [--principal-provider <id> --principal-subject <id>] [--path dir]
  idefactory complete <change> <taskId> --attempt <id> [--path dir]
  idefactory pr open <change> [--path dir]
  idefactory pr comment <attemptId> [--path dir]
  idefactory pr capture <change> [--path dir]
  idefactory ci scaffold [path] [--path dir]
  idefactory approve <id> --note "text" --change <name> --task <id> --action <accept|complete> --approver <id> --principal-provider <id> --principal-subject <id> --expiry <iso> [--path dir]
  idefactory reject <id> --note "text" [--path dir]
  idefactory lockout create --agent <id> --reviewer <id> --reason "text" [--path dir]
  idefactory lockout --agent <id> --reviewer <id> --reason "text" [--path dir]
  idefactory lockout resolve <id> --resolver <id> --reason "text" [--path dir]
  idefactory setup [--detect] [--governance lightweight|strict] [--map <kind> --argv <part>...] [--no-test] [--verifier-argv <part>...] [--path dir]
  idefactory halt [path]
  idefactory resume [path]

Team memory is .factory/. Work queue is .factory/work/.
The human authors OpenSpec changes.
`;

export async function run(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const cwd = io.cwd || process.cwd();
  const env = io.env || process.env;
  const out = (line) => stdout.write(line.endsWith('\n') ? line : `${line}\n`);
  const err = (line) => stderr.write(line.endsWith('\n') ? line : `${line}\n`);
  const parsed = parseArgs(argv);
  const cmd = parsed.cmd;
  if (!cmd || cmd === 'help' || parsed.flags.help) {
    const answer = answerHelp(argv, { explicitHelp: cmd === 'help', globalText: HELP });
    if (answer.stdout) out(answer.stdout);
    if (answer.stderr) err(answer.stderr);
    return answer.code;
  }
  const project = projectDir(parsed.flags, parsed.rest, cwd, cmd);
  const commandKey = cliCommandKey(cmd, parsed.rest, parsed.flags);
  const isTTY = io.isTTY !== undefined ? Boolean(io.isTTY) : Boolean(process.stdin.isTTY);
  const execute = () => dispatchCommand(cmd, {
    project,
    parsed,
    env,
    out,
    err,
    isTTY,
    cwd,
  });
  try {
    // HALT bypasses the writer lease so emergency stop cannot be blocked.
    if (cmd === 'halt') return await execute();
    if (isMutatingCommand(commandKey)) {
      const code = await withWriterLease(project, commandKey, execute);
      const warning = consumeEventWarning();
      if (warning) err(warning);
      return code;
    }
    const code = await execute();
    const warning = consumeEventWarning();
    if (warning) err(warning);
    return code;
  } catch (error) {
    err(error.message || String(error));
    return 1;
  }
}

async function dispatchCommand(cmd, ctx) {
  const { project, parsed, env, out, err, isTTY, cwd } = ctx;
  switch (cmd) {
    case 'init': {
      const dryRun = Boolean(parsed.flags['dry-run']);
      const { created, sync } = initProject(project, {
        forceRoster: Boolean(parsed.flags['force-roster']),
        withOpenspec: Boolean(parsed.flags['with-openspec']),
        withBacklog: Boolean(parsed.flags['with-backlog']),
        dryRun,
        ...adapterOptions(parsed),
        env,
      });
      if (parsed.flags.json) {
        out(JSON.stringify(sync.report, null, 2));
        return sync.report.exitCode;
      }
      if (dryRun) {
        out('Dry run: nothing was written.');
        if (created.length) out(`Would create: ${created.join(', ')}`);
      } else {
        out(`Initialized ${project}`);
        if (created.length) out(`Created: ${created.join(', ')}`);
        else out('Team state already present. Adapters refreshed.');
      }
      for (const line of formatReport(sync.report)) out(line);
      if (!dryRun) reportSetupGaps(project, out);
      return sync.report.exitCode;
    }
    case 'upgrade': {
      const dryRun = Boolean(parsed.flags['dry-run']);
      const { sync } = upgradeProject(project, { dryRun, ...adapterOptions(parsed) });
      if (parsed.flags.json) {
        out(JSON.stringify(sync.report, null, 2));
        return sync.report.exitCode;
      }
      if (dryRun) out('Dry run: nothing was written.');
      else out(`Upgraded adapters in ${project}`);
      for (const line of formatReport(sync.report)) out(line);
      if (!dryRun) reportSetupGaps(project, out);
      return sync.report.exitCode;
    }
    case 'adapters': {
      const mode = parsed.rest[0];
      const paths = parsed.rest.slice(1);
      if ((mode !== 'pin' && mode !== 'unpin') || paths.length === 0) {
        throw new Error(
          'Usage: idefactory adapters pin <path>... | idefactory adapters unpin <path>... [--path dir]',
        );
      }
      const { done, notes } = setPins(project, paths, mode);
      for (const rel of done) out(`${mode === 'pin' ? 'Pinned' : 'Unpinned'} ${rel}`);
      for (const note of notes) out(`note: ${note}`);
      return 0;
    }
    case 'setup':
      return handleSetup(project, parsed, out, isTTY);
    case 'doctor':
      return reportDoctor(project, out, err);
    case 'status':
      if (parsed.flags.json) {
        out(JSON.stringify(buildStatusDocument(project)));
        return 0;
      }
      out(status(project, env));
      return 0;
    case 'checks':
      if (parsed.rest[0] !== 'preview') {
        throw new Error('Usage: idefactory checks preview');
      }
      out(previewChecks(project));
      return 0;
    case 'sync-tasks': {
      const change = parsed.rest[0];
      const result = syncTasks(project, change, env);
      out(`Synced ${result.change}: created ${result.created}, skipped ${result.skipped}.`);
      for (const line of result.suggestions || []) out(line);
      return 0;
    }
    case 'next': {
      const packet = buildPacket(project, env, parsed.flags.change || '');
      out(packet.text);
      return 0;
    }
    case 'run': {
      const result = runFactory(project, env, {
        change: parsed.flags.change || parsed.rest[0],
        until: parsed.flags.until || 'human-gate',
        maxTasks: parsed.flags['max-tasks'],
        maxAgentSteps: parsed.flags['max-agent-steps'],
        maxTokens: parsed.flags['max-tokens'],
        maxCost: parsed.flags['max-cost'],
        hostTokens: parsed.flags['host-tokens'],
        hostCost: parsed.flags['host-cost'],
        newRun: Boolean(parsed.flags['new-run']),
        acceptBaseline: Boolean(parsed.flags['accept-baseline']),
      });
      out(result.text);
      return result.code === EXIT_NEEDS_AGENT ? EXIT_NEEDS_AGENT : result.code;
    }
    case 'attempt':
      return handleAttempt(project, parsed, env, out, cwd);
    case 'verify':
      return await handleVerify(project, parsed, out);
    case 'red':
      return handleRed(project, parsed, out);
    case 'complete': {
      const [change, taskId] = parsed.rest;
      const attemptId = parsed.flags.attempt;
      if (!change || !taskId || !attemptId) {
        throw new Error('Usage: idefactory complete <change> <taskId> --attempt <id>');
      }
      const result = completeWorkItem(project, change, taskId, attemptId, env);
      out(`Completed ${change}/${taskId} attempt ${result.attempt.id}`);
      return 0;
    }
    case 'pr':
      return handlePr(project, parsed, env, out);
    case 'ci':
      return handleCi(project, parsed, out);
    case 'approve': {
      const file = approve(project, parsed.rest[0], parsed.flags.note || '', {
        change: parsed.flags.change,
        task: parsed.flags.task,
        action: parsed.flags.action,
        approver: parsed.flags.approver,
        expiry: parsed.flags.expiry,
        principalProvider: parsed.flags['principal-provider'],
        principalSubject: parsed.flags['principal-subject'],
      });
      out(`Recorded approval ${file}`);
      return 0;
    }
    case 'reject': {
      const file = reject(project, parsed.rest[0], parsed.flags.note || '');
      out(`Recorded rejection ${file}`);
      return 0;
    }
    case 'lockout': {
      const sub = parsed.rest[0];
      if (sub === 'resolve') {
        const id = parsed.rest[1];
        if (!id) {
          throw new Error(`Usage: ${LOCKOUT_RESOLVE_USAGE}`);
        }
        const result = resolveLockout(project, id, {
          resolver: parsed.flags.resolver,
          reason: parsed.flags.reason,
        });
        out(`Resolved lockout ${result.id}`);
        return 0;
      }
      if (sub && sub !== 'create') {
        throw new Error(
          `Usage: ${LOCKOUT_CREATE_USAGE}\n`
          + `       ${LOCKOUT_RESOLVE_USAGE}`,
        );
      }
      const result = createLockout(project, {
        agent: parsed.flags.agent,
        reviewer: parsed.flags.reviewer,
        reason: parsed.flags.reason,
      });
      out(`Created lockout ${result.id}`);
      return 0;
    }
    case 'halt':
      fs.writeFileSync(path.join(project, 'HALT'), 'stop\n');
      out('HALT is set. Factory mutating commands will refuse to run.');
      return 0;
    case 'resume': {
      const haltFile = path.join(project, 'HALT');
      if (fs.existsSync(haltFile)) fs.unlinkSync(haltFile);
      out('HALT removed.');
      return 0;
    }
    default:
      err(`Unknown command: ${cmd}`);
      err(HELP);
      return 1;
  }
}

function handleAttempt(project, parsed, env, out, cwd) {
  if (halted(project) && parsed.rest[0] !== 'show') {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const sub = parsed.rest[0];
  if (sub === 'start') {
    const change = parsed.rest[1];
    const taskId = parsed.rest[2];
    if (!change || !taskId) throw new Error('Usage: idefactory attempt start <change> <taskId>');
    const attempt = startAttempt(project, change, taskId);
    out(JSON.stringify(attempt, null, 2));
    return 0;
  }
  if (sub === 'transition') {
    const attemptId = parsed.rest[1];
    const state = parsed.rest[2];
    if (!attemptId || !state) {
      throw new Error(TRANSITION_USAGE);
    }
    const evidence = readTransitionEvidence(parsed.flags, { cwd });
    let attempt;
    try {
      attempt = transitionAttempt(project, attemptId, state, {
        evidence,
        actorId: evidence.implementerId || evidence.reviewerId || null,
        env,
        supplied: true,
      });
    } catch (error) {
      if (String(error?.message || '').startsWith('retry-cap')) {
        const current = getAttempt(project, attemptId);
        if (current?.change) closeLatestRunSession(project, current.change, 'retry-cap');
      }
      throw error;
    }
    out(JSON.stringify(attempt, null, 2));
    return 0;
  }
  if (sub === 'show') {
    const attemptId = parsed.rest[1];
    if (!attemptId) throw new Error('Usage: idefactory attempt show <attemptId>');
    const attempt = getAttempt(project, attemptId);
    if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);
    out(JSON.stringify(attempt, null, 2));
    return 0;
  }
  throw new Error('Usage: idefactory attempt start|transition|show ...');
}

function handleCi(project, parsed, out) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const sub = parsed.rest[0];
  if (sub === 'scaffold') {
    const file = scaffoldConsumerCi(project);
    out(`Wrote ${file}`);
    return 0;
  }
  throw new Error('Usage: idefactory ci scaffold');
}

function handlePr(project, parsed, env, out) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const sub = parsed.rest[0];
  if (sub === 'open') {
    const change = parsed.rest[1];
    if (!change) throw new Error('Usage: idefactory pr open <change>');
    const result = openPullRequest(project, change, env);
    out(JSON.stringify(result.record, null, 2));
    return 0;
  }
  if (sub === 'comment') {
    const attemptId = parsed.rest[1];
    if (!attemptId) throw new Error('Usage: idefactory pr comment <attemptId>');
    const result = commentOnPullRequest(project, attemptId, env);
    out(JSON.stringify(result.record, null, 2));
    return 0;
  }
  if (sub === 'capture') {
    const change = parsed.rest[1];
    if (!change) throw new Error('Usage: idefactory pr capture <change>');
    const result = capturePullRequestComments(project, change, env);
    out(JSON.stringify(result.record, null, 2));
    return 0;
  }
  throw new Error(
    'Usage: idefactory pr open <change>\n'
    + '       idefactory pr comment <attemptId>\n'
    + '       idefactory pr capture <change>',
  );
}

async function handleVerify(project, parsed, out) {
  const sub = parsed.rest[0];
  if (sub === 'status') {
    const attemptId = parsed.rest[1] || (typeof parsed.flags.json === 'string' ? parsed.flags.json : '');
    if (!attemptId) throw new Error('Usage: idefactory verify status <attemptId> [--json]');
    const status = verifyStatus(project, attemptId);
    out(parsed.flags.json ? `${JSON.stringify(status, null, 2)}\n` : renderVerifyStatusText(status));
    return 0;
  }
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  if (sub === 'run') {
    const attemptId = parsed.rest[1];
    const check = parsed.flags.check;
    if (!attemptId || !check || check === true) {
      throw new Error('Usage: idefactory verify run <attemptId> --check <kind> [--red]');
    }
    const { attempt, record } = await verifyRun(project, attemptId, {
      check,
      asRed: Boolean(parsed.flags.red),
    });
    out(JSON.stringify({ attemptId: attempt.id, record }, null, 2));
    return 0;
  }
  if (sub === 'import') {
    const attemptId = parsed.rest[1];
    const file = parsed.flags.file;
    if (!attemptId || !file || file === true) {
      throw new Error('Usage: idefactory verify import <attemptId> --file <path>');
    }
    const { attempt, record } = await verifyImport(project, attemptId, { file });
    out(JSON.stringify({ attemptId: attempt.id, record }, null, 2));
    return 0;
  }
  throw new Error(
    'Usage: idefactory verify run <attemptId> --check <kind> [--red]\n'
    + '       idefactory verify import <attemptId> --file <path>\n'
    + '       idefactory verify status <attemptId> [--json]',
  );
}

const REUSE_USAGE = 'Usage: idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind>... --note "text" --approver <id>';
const WAIVE_USAGE = 'Usage: idefactory red waive <targetAttemptId> --kind <kind>... --note "text" --approver <id> [--acknowledge-not-stuck]';
const EXCEPTION_NEW_RUN_NOTE = 'A closed vacuous-red or retry-cap run session stays closed until the human passes --new-run.';

function stringFlag(flags, key) {
  return typeof flags[key] === 'string' && flags[key].length > 0 ? flags[key] : '';
}

function handleRed(project, parsed, out) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const sub = parsed.rest[0];
  if (sub !== 'reuse' && sub !== 'waive') {
    throw new Error(`${REUSE_USAGE}\n       ${WAIVE_USAGE}`);
  }
  const usage = sub === 'reuse' ? REUSE_USAGE : WAIVE_USAGE;
  const targetAttemptId = parsed.rest[1];
  const kinds = (parsed.sequence || [])
    .filter((entry) => entry.key === 'kind' && typeof entry.value === 'string')
    .map((entry) => entry.value);
  const reason = stringFlag(parsed.flags, 'note');
  const approver = stringFlag(parsed.flags, 'approver');
  const sourceAttemptId = stringFlag(parsed.flags, 'from');
  if (!targetAttemptId || kinds.length === 0 || !reason || !approver
    || (sub === 'reuse' && !sourceAttemptId)) {
    throw new Error(usage);
  }
  const common = {
    targetAttemptId,
    kinds,
    approver,
    reason,
    principalProvider: stringFlag(parsed.flags, 'principal-provider') || undefined,
    principalSubject: stringFlag(parsed.flags, 'principal-subject') || undefined,
  };
  const result = sub === 'reuse'
    ? reuseRed(project, { ...common, sourceAttemptId })
    : waiveRed(project, {
      ...common,
      acknowledgeNotStuck: Boolean(parsed.flags['acknowledge-not-stuck']),
    });
  out(JSON.stringify({
    attemptId: targetAttemptId,
    exceptions: result.records.map((record, index) => ({
      id: record.id,
      type: record.type,
      kind: record.kind,
      file: path.relative(project, result.files[index]),
      ...(record.type === 'waiver' ? { acknowledgedNotStuck: record.acknowledgedNotStuck } : {}),
    })),
    note: EXCEPTION_NEW_RUN_NOTE,
  }, null, 2));
  return 0;
}

function reportDoctor(project, out, err) {
  const report = doctor(project);
  if (report.errors.length) {
    out('doctor: fail');
    for (const item of report.errors) out(`- ${item}`);
  } else {
    out('doctor: ok');
  }
  out(`policy version: ${report.policyVersion}`);
  for (const item of report.warnings) err(`warning: ${item}`);
  if (halted(project) && !report.warnings.some((item) => item.includes('HALT'))) {
    err('warning: HALT file is present');
  }
  return report.errors.length ? 1 : 0;
}

export function parseArgs(argv) {
  const rest = [];
  const flags = {};
  const sequence = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (token === '--help' || token === '-h') {
      flags.help = true;
      sequence.push({ key: 'help', value: true });
      continue;
    }
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
        sequence.push({ key, value: true });
      } else {
        flags[key] = next;
        sequence.push({ key, value: next });
        i += 1;
      }
    } else rest.push(token);
  }
  return { cmd: rest[0], rest: rest.slice(1), flags, sequence };
}

function adapterOptions(parsed) {
  if (typeof parsed.flags.force === 'string') {
    throw new Error(
      '--force takes no value. To replace one file use --replace <path>; to name the project use --path <dir>.',
    );
  }
  const replace = parsed.sequence.filter((entry) => entry.key === 'replace').map((entry) => entry.value);
  if (replace.some((value) => value === true)) {
    throw new Error('--replace needs a path: --replace <path>.');
  }
  return { force: Boolean(parsed.flags.force), replace };
}

function reportSetupGaps(project, out) {
  const gaps = setupReadinessErrors(project);
  for (const gap of gaps) out(gap);
  if (gaps.length) out('Run idefactory setup to record the missing answer.');
}

async function handleSetup(project, parsed, out, isTTY) {
  if (parsed.flags.detect) {
    const result = await setupProject(project, { detectOnly: true });
    out(result.text);
    return 0;
  }
  const { maps, verifierArgv } = mapsFromSequence(parsed.sequence || []);
  const governance = typeof parsed.flags.governance === 'string' ? parsed.flags.governance : '';
  const result = await setupProject(project, {
    governance,
    maps,
    noTest: Boolean(parsed.flags['no-test']),
    verifierArgv,
    isTTY: Boolean(isTTY),
  });
  out(result.text);
  return 0;
}
