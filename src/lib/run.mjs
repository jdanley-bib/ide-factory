import fs from 'node:fs';
import path from 'node:path';
import { getAttempt, startAttempt, transitionAttempt } from './attempt.mjs';
import { REPOINT_USAGE, applyRepoint, repointPreview } from './attempt-repoint.mjs';
import { completeWorkItem } from './complete.mjs';
import { approve, createLockout, doctor, orphanAttemptLines, reject, resolveLockout, revokeApproval, status } from './govern.mjs';
import { blockedReportForError, buildBlockedReport, recordStop } from './blocked-states.mjs';
import { buildAutonomyReport, renderAutonomyText } from './autonomy.mjs';
import { authorizeRequest, renderAuthorizeText } from './authorize.mjs';
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
import { reopenAttempt } from './attempt-reopen.mjs';
import { applyReconciliation, buildReconciliationPlan, renderPlanText } from './reconcile.mjs';
import { describeDrift } from './reconcile-diff.mjs';
import { listReds, renderRedList } from './red-list.mjs';
import { reuseRed, waiveRed } from './red-exceptions.mjs';
import { recordRedInvalidation } from './red-invalidation.mjs';
import { describeAttemptMethod, describeCoverage, describeMethod, proposeMethod, reviewMethod } from './red-method.mjs';
import { verifyImport, verifyRun } from './verification-evidence.mjs';
import { renderVerifyStatusText, verifyStatus } from './verification-status.mjs';
import { answerHelp } from './command-help.mjs';
import { resolveRequirements } from './required-checks.mjs';
import { listWorkItems } from './work.mjs';
import { renderRequirementsText, requirementsDocument } from './requirements-command.mjs';
import { cliCommandKey, isMutatingCommand, withWriterLease } from './writer-lease.mjs';
import { appendControlEvent, consumeEventWarning } from './event-log.mjs';
import { closeLatestRunSession } from './run-session.mjs';
import { configureBoard, configureForge } from './integration-config.mjs';
import { claimBoard, commentBoard, publishBoard, reportBoard, transitionBoard } from './board.mjs';
import { ackPlan, formatPlan, pendingPlans, recordOperation } from './mcp-plan.mjs';
import { BlockedError } from './blocked-error.mjs';

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
  idefactory pr capture <change> [--threads-file <path>] [--path dir]
  idefactory board configure --organization <url> --project <name> [--transport mcp|az] [--work-item-type <type>] [--tag <tag>] [--change-field <ref>] [--state-ready <name>] [six other state flags] [--path dir]
  idefactory board publish <change> [--path dir]
  idefactory board claim <change> --work-item <id> [--snapshot <file>] [--revision N] [--run-url <url>] [--json] [--path dir]
  idefactory board report <change> [--path dir]
  idefactory board comment <change> --message "text" [--key key] [--path dir]
  idefactory board transition <change> --to in-progress|waiting|blocked|in-review|ready-for-human-review [--note "text"] [--path dir]
  idefactory forge configure --provider github|azure-devops [--organization <url> --project <name> --repository <name> --transport mcp|az --target-branch <name>] [--path dir]
  idefactory mcp ack <planId> [--result <json> | --result-file <path>] [--path dir]
  idefactory mcp pending [--json] [--path dir]
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
    const blocked = recordFailure(project, commandKey, parsed, error);
    if (blocked && parsed.flags.json) {
      out(JSON.stringify({ ok: false, message: error.message || String(error), blocked }, null, 2));
      return 1;
    }
    err(error.message || String(error));
    return 1;
  }
}

const BLOCKED_COMMANDS = new Set(['run', 'next', 'complete', 'attempt transition', 'sync-tasks']);

function blockedScope(commandKey, parsed) {
  const scope = {};
  if (commandKey === 'complete') {
    scope.change = parsed.rest[0];
    scope.task = parsed.rest[1];
    scope.attemptId = typeof parsed.flags.attempt === 'string' ? parsed.flags.attempt : undefined;
  } else if (commandKey === 'attempt transition') {
    scope.attemptId = parsed.rest[1];
  } else if (commandKey === 'sync-tasks') {
    scope.change = parsed.rest[0];
  } else {
    scope.change = (typeof parsed.flags.change === 'string' && parsed.flags.change) || parsed.rest[0];
  }
  return scope;
}

/**
 * Record a failed command in the control log. A stop with a known invariant is recorded as a
 * blocked stop; any other failure of a mutating command is recorded as command.error without
 * its text. The blocked report is returned only for commands that print one.
 */
function recordFailure(project, commandKey, parsed, error) {
  const scope = BLOCKED_COMMANDS.has(commandKey) ? blockedScope(commandKey, parsed) : {};
  let report = null;
  try {
    report = blockedReportForError(project, error, scope);
  } catch {
    report = null;
  }
  if (report && report.invariant.code !== 'unclassified') {
    recordStop(project, report);
  } else if (isMutatingCommand(commandKey)) {
    appendControlEvent(project, { type: 'command.error', time: new Date().toISOString(), command: commandKey, code: 'unclassified' });
  }
  return BLOCKED_COMMANDS.has(commandKey) ? report : null;
}

function requirementWarnings(project, change) {
  const byMessage = new Map();
  for (const item of listWorkItems(project, change)) {
    if (item.status !== 'todo') continue;
    for (const problem of resolveRequirements(project, item).problems) {
      if (!byMessage.has(problem.message)) byMessage.set(problem.message, []);
      byMessage.get(problem.message).push(item.id);
    }
  }
  return [...byMessage].map(([message, ids]) => `warning: requirement problem for ${ids.join(', ')}: ${message}`);
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
    case 'autonomy': {
      if (parsed.rest[0] !== 'report') throw new Error('Usage: idefactory autonomy report [--change <name>] [--since <iso>] [--json]');
      const report = buildAutonomyReport(project, {
        change: typeof parsed.flags.change === 'string' ? parsed.flags.change : undefined,
        since: typeof parsed.flags.since === 'string' ? parsed.flags.since : (parsed.flags.since === true ? '' : undefined),
      });
      out(parsed.flags.json ? JSON.stringify(report, null, 2) : renderAutonomyText(report));
      return 0;
    }
    case 'requirements': {
      const [change, taskId] = parsed.rest;
      if (!change || !taskId) throw new Error('Usage: idefactory requirements <change> <task> [--json]');
      const doc = requirementsDocument(project, change, taskId);
      out(parsed.flags.json ? JSON.stringify(doc) : renderRequirementsText(doc));
      return 0;
    }
    case 'sync-tasks': {
      const change = parsed.rest[0]
        || (typeof parsed.flags.plan === 'string' ? parsed.flags.plan : '')
        || (typeof parsed.flags.apply === 'string' ? parsed.flags.apply : '');
      if (parsed.flags.plan && parsed.flags.apply) throw new Error('Give only one of --plan and --apply');
      if (parsed.flags.plan) {
        const plan = buildReconciliationPlan(project, change);
        out(parsed.flags.json ? JSON.stringify(plan, null, 2) : renderPlanText(plan));
        return 0;
      }
      if (parsed.flags.apply) {
        const result = applyReconciliation(project, change, {
          decisionsFile: stringFlag(parsed.flags, 'decisions-file') ? path.resolve(cwd, stringFlag(parsed.flags, 'decisions-file')) : '',
          planDigest: stringFlag(parsed.flags, 'plan-digest'),
          decidedBy: stringFlag(parsed.flags, 'decided-by'),
          principalProvider: stringFlag(parsed.flags, 'principal-provider') || undefined,
          principalSubject: stringFlag(parsed.flags, 'principal-subject') || undefined,
        });
        if (parsed.flags.json) {
          out(JSON.stringify({ ok: true, change: result.record.change, reconciliation: result.record.id, unchanged: Boolean(result.unchanged) }, null, 2));
          return 0;
        }
        out(result.unchanged
          ? `Reconciliation ${result.record.id} was already applied; nothing changed.`
          : `Applied reconciliation ${result.record.id} for ${result.record.change}.`);
        return 0;
      }
      const result = syncTasks(project, change, env);
      if (parsed.flags.json) {
        out(JSON.stringify({
          ok: true,
          change: result.change,
          created: result.created,
          skipped: result.skipped,
          suggestions: result.suggestions || [],
          drift: result.drift || [],
        }, null, 2));
        return 0;
      }
      out(`Synced ${result.change}: created ${result.created}, skipped ${result.skipped}.`);
      for (const line of result.suggestions || []) out(line);
      for (const row of result.drift || []) out(describeDrift(row));
      for (const line of requirementWarnings(project, result.change)) err(line);
      return 0;
    }
    case 'next': {
      const packet = buildPacket(project, env, parsed.flags.change || '');
      if (parsed.flags.json) {
        const blocked = packet.empty
          ? buildBlockedReport(project, { code: 'no-ready-work', change: parsed.flags.change || undefined })
          : null;
        out(JSON.stringify({
          ok: !packet.empty,
          empty: Boolean(packet.empty),
          text: packet.text,
          ...(packet.item ? { change: packet.item.change, task: packet.item.id } : {}),
          blocked,
        }, null, 2));
        return 0;
      }
      out(packet.text);
      return 0;
    }
    case 'run': {
      if (parsed.flags['accept-baseline'] && !stringFlag(parsed.flags, 'reason')) {
        throw new Error('run --accept-baseline needs --reason "<text>" to record why the baseline is accepted');
      }
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
        acceptReason: stringFlag(parsed.flags, 'reason') || undefined,
      });
      if (parsed.flags.json) {
        out(JSON.stringify({
          stopReason: result.stopReason,
          exitCode: result.code,
          request: result.request ?? null,
          blocked: result.blocked ?? null,
          text: result.text,
        }, null, 2));
        return result.code;
      }
      const orphans = orphanAttemptLines(project, parsed.flags.change || parsed.rest[0] || undefined);
      if (orphans.length) out(['Orphan attempts:', ...orphans].join('\n'));
      out(result.text);
      return result.code === EXIT_NEEDS_AGENT ? EXIT_NEEDS_AGENT : result.code;
    }
    case 'attempt':
      return handleAttempt(project, parsed, env, out, cwd);
    case 'verify':
      return await handleVerify(project, parsed, out);
    case 'red':
      return handleRed(project, parsed, out);
    case 'method':
      return handleMethod(project, parsed, out);
    case 'complete': {
      const [change, taskId] = parsed.rest;
      const attemptId = parsed.flags.attempt;
      if (!change || !taskId || !attemptId) {
        throw new Error('Usage: idefactory complete <change> <taskId> --attempt <id>');
      }
      const result = completeWorkItem(project, change, taskId, attemptId, env);
      if (parsed.flags.json) {
        out(JSON.stringify({ ok: true, change, task: taskId, attemptId: result.attempt.id, blocked: null }, null, 2));
        return 0;
      }
      out(`Completed ${change}/${taskId} attempt ${result.attempt.id}`);
      return 0;
    }
    case 'pr':
      return handlePr(project, parsed, env, out);
    case 'ci':
      return handleCi(project, parsed, out);
    case 'board':
      return handleBoard(project, parsed, env, out);
    case 'mcp':
      return handleMcp(project, parsed, out);
    case 'forge': {
      if (parsed.rest[0] !== 'configure') {
        throw new Error('Usage: idefactory forge configure --provider github|azure-devops [--organization <url> --project <name> --repository <name> --transport mcp|az --target-branch <name>]');
      }
      const forge = configureForge(project, parsed.flags);
      out(JSON.stringify(forge, null, 2));
      return 0;
    }
    case 'approve': {
      const file = approve(project, parsed.rest[0], parsed.flags.note || '', {
        change: parsed.flags.change,
        task: parsed.flags.task,
        action: parsed.flags.action,
        approver: parsed.flags.approver,
        expiry: parsed.flags.expiry,
        target: parsed.flags.target,
        standing: parsed.flags.standing === true,
        principalProvider: parsed.flags['principal-provider'],
        principalSubject: parsed.flags['principal-subject'],
      });
      out(`Recorded approval ${file}`);
      return 0;
    }
    case 'revoke': {
      const file = revokeApproval(project, parsed.rest[0], parsed.flags.note || '', {
        revoker: parsed.flags.revoker,
        principalProvider: parsed.flags['principal-provider'],
        principalSubject: parsed.flags['principal-subject'],
      });
      out(`Recorded revocation ${file}`);
      return 0;
    }
    case 'authorize': {
      const doc = authorizeRequest(project, parsed.flags);
      out(parsed.flags.json ? JSON.stringify(doc, null, 2) : renderAuthorizeText(doc));
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
      if (fs.existsSync(haltFile)) {
        fs.unlinkSync(haltFile);
        appendControlEvent(project, { type: 'halt.resumed', time: new Date().toISOString() });
      }
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
  if (sub === 'repoint') {
    const change = parsed.rest[1];
    const taskId = parsed.rest[2];
    const targetId = stringFlag(parsed.flags, 'attempt');
    if (!change || !taskId || !targetId) throw new Error(REPOINT_USAGE);
    const principalFlags = {
      principalProvider: stringFlag(parsed.flags, 'principal-provider') || undefined,
      principalSubject: stringFlag(parsed.flags, 'principal-subject') || undefined,
    };
    if (!parsed.flags.apply) {
      const plan = repointPreview(project, change, taskId, targetId);
      const shown = {
        change: plan.change,
        task: plan.task,
        currentAttemptId: plan.currentAttemptId,
        targetAttemptId: plan.targetAttemptId,
        current: plan.current,
        target: plan.target,
        planDigest: plan.planDigest,
        applyWith: `idefactory attempt repoint ${change} ${taskId} --attempt ${targetId} --apply --plan-digest ${plan.planDigest} --decided-by <id> --reason "<text>"`,
      };
      out(JSON.stringify(shown, null, 2));
      return 0;
    }
    const result = applyRepoint(project, {
      change,
      task: taskId,
      attemptId: targetId,
      planDigest: stringFlag(parsed.flags, 'plan-digest'),
      decidedBy: stringFlag(parsed.flags, 'decided-by'),
      reason: stringFlag(parsed.flags, 'reason'),
      ...principalFlags,
    });
    out(JSON.stringify(result, null, 2));
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
  if (sub === 'reopen') {
    const attemptId = parsed.rest[1];
    const kinds = (parsed.sequence || [])
      .filter((entry) => entry.key === 'kind' && typeof entry.value === 'string')
      .map((entry) => entry.value);
    const purpose = stringFlag(parsed.flags, 'for');
    const by = stringFlag(parsed.flags, 'by');
    const reason = stringFlag(parsed.flags, 'reason');
    if (!attemptId || kinds.length === 0 || !purpose || !by || !reason) throw new Error(REOPEN_USAGE);
    const attempt = reopenAttempt(project, {
      attemptId,
      kinds,
      purpose,
      by,
      reason,
      principalProvider: stringFlag(parsed.flags, 'principal-provider') || undefined,
      principalSubject: stringFlag(parsed.flags, 'principal-subject') || undefined,
    });
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
  throw new Error('Usage: idefactory attempt start|transition|reopen|repoint|show ...');
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
    out(result.plan ? formatPlan(result.plan) : JSON.stringify(result.record, null, 2));
    return 0;
  }
  if (sub === 'comment') {
    const attemptId = parsed.rest[1];
    if (!attemptId) throw new Error('Usage: idefactory pr comment <attemptId>');
    const result = commentOnPullRequest(project, attemptId, env);
    out(result.plan ? formatPlan(result.plan) : JSON.stringify(result.record, null, 2));
    return 0;
  }
  if (sub === 'capture') {
    const change = parsed.rest[1];
    if (!change) throw new Error('Usage: idefactory pr capture <change>');
    const threadsFile = typeof parsed.flags['threads-file'] === 'string'
      ? path.resolve(parsed.flags['threads-file'])
      : '';
    const result = capturePullRequestComments(project, change, env, { threadsFile });
    out(JSON.stringify(result.record, null, 2));
    return 0;
  }
  throw new Error(
    'Usage: idefactory pr open <change>\n'
    + '       idefactory pr comment <attemptId>\n'
    + '       idefactory pr capture <change>',
  );
}

const BOARD_USAGE = [
  'Usage: idefactory board configure --organization <url> --project <name>',
  '       idefactory board publish <change>',
  '       idefactory board claim <change> --work-item <id> [--revision N] [--run-url <url>] [--json]',
  '       idefactory board report <change>',
  '       idefactory board comment <change> --message "text" [--key key]',
  '       idefactory board transition <change> --to <state> [--note "text"]',
].join('\n');

function handleBoard(project, parsed, env, out) {
  const sub = parsed.rest[0];
  const change = parsed.rest[1];
  const text = (value) => (typeof value === 'string' ? value : '');
  if (sub === 'configure') {
    out(JSON.stringify(configureBoard(project, parsed.flags), null, 2));
    return 0;
  }
  if (sub === 'publish') {
    const result = publishBoard(project, change, env);
    if (result.plan) {
      out(formatPlan(result.plan));
      return 0;
    }
    const verb = result.created ? 'Created' : (result.updated ? 'Updated' : 'Unchanged');
    out(`${verb} work item ${result.record.workItem.id} for ${result.record.change}: ${result.record.workItem.url}`);
    return 0;
  }
  if (sub === 'claim') {
    const result = claimBoard(project, change, {
      workItem: parsed.flags['work-item'],
      revision: parsed.flags.revision,
      runUrl: text(parsed.flags['run-url']),
      snapshot: text(parsed.flags.snapshot) ? path.resolve(text(parsed.flags.snapshot)) : '',
    }, env);
    if (parsed.flags.json) {
      out(JSON.stringify(result, null, 2));
      return 0;
    }
    out(`Decision: ${result.decision}`);
    out(`Reason: ${result.reason}`);
    out(`Next: ${result.next || '(stop; do not run the factory)'}`);
    if (result.plan) {
      out('Apply this plan and acknowledge it before the next step:');
      out(formatPlan(result.plan));
    }
    return 0;
  }
  if (sub === 'comment') {
    const result = commentBoard(project, change, {
      message: text(parsed.flags.message),
      key: text(parsed.flags.key),
    }, env);
    if (result.plan) {
      out(formatPlan(result.plan));
      return 0;
    }
    out(result.posted ? 'Comment posted.' : 'Comment already posted for that key.');
    return 0;
  }
  if (sub === 'transition') {
    const result = transitionBoard(project, change, {
      to: text(parsed.flags.to),
      note: text(parsed.flags.note),
    }, env);
    if (result.plan) {
      out(formatPlan(result.plan));
      return 0;
    }
    out(`Work item ${result.record.workItem.id} is ${result.record.state}.`);
    return 0;
  }
  if (sub === 'report') {
    const result = reportBoard(project, change, env);
    if (result.plan) {
      out(formatPlan(result.plan));
      return 0;
    }
    out(`Work item ${result.record.workItem.id} is ${result.state}. Reported tasks: ${result.posted.join(', ') || '(none)'}.`);
    return 0;
  }
  throw new Error(BOARD_USAGE);
}

const MCP_USAGE = [
  'Usage: idefactory mcp ack <planId> [--result <json> | --result-file <path>]',
  '       idefactory mcp record <planId> --operation <n> --outcome <applied|failed|unknown> [--cause <code>] --decision <code> [--readback <present|absent|unavailable>] [--note "text"]',
  '       idefactory mcp pending [--json]',
].join('\n');

function renderPendingText(plans) {
  if (plans.length === 0) return '(no pending plans)';
  return plans.map((plan) => [
    `${plan.id} ${plan.kind} ${plan.change} (${plan.operations} operations)`,
    ...plan.progress.map((row) => `  operation ${row.operation}: ${row.outcome}, ${row.retries} ${row.retries === 1 ? 'retry' : 'retries'}`),
  ].join('\n')).join('\n');
}

function handleMcp(project, parsed, out) {
  const sub = parsed.rest[0];
  if (sub === 'pending') {
    const plans = pendingPlans(project);
    out(parsed.flags.json ? JSON.stringify(plans, null, 2) : renderPendingText(plans));
    return 0;
  }
  if (sub === 'record') {
    const id = parsed.rest[1];
    const text = (name) => (typeof parsed.flags[name] === 'string' ? parsed.flags[name] : undefined);
    if (!id || ['operation', 'outcome', 'cause', 'decision', 'readback', 'note'].some((name) => parsed.flags[name] === true)) {
      throw new Error(MCP_USAGE);
    }
    try {
      const result = recordOperation(project, id, {
        operation: text('operation'),
        outcome: text('outcome'),
        cause: text('cause'),
        decision: text('decision'),
        readback: text('readback'),
        note: text('note'),
      });
      out(`Recorded ${result.record.outcome} for operation ${result.record.operation} of ${id}: ${result.record.decision}${result.record.readback ? ` (read-back ${result.record.readback})` : ''}.`);
      return 0;
    } catch (error) {
      if (error instanceof BlockedError && parsed.flags.json) {
        out(JSON.stringify(buildBlockedReport(project, {
          code: error.invariant,
          change: error.context.change,
          message: error.message,
        }), null, 2));
        return 1;
      }
      throw error;
    }
  }
  if (sub === 'ack') {
    const id = parsed.rest[1];
    if (!id) throw new Error(MCP_USAGE);
    const inline = parsed.flags.result;
    const file = parsed.flags['result-file'];
    if ((inline !== undefined && file !== undefined) || inline === true || file === true) {
      throw new Error(MCP_USAGE);
    }
    let result = {};
    try {
      if (typeof file === 'string') result = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
      else if (typeof inline === 'string') result = JSON.parse(inline);
    } catch (error) {
      throw new Error(`Invalid ack result: ${error.message}`);
    }
    const acked = ackPlan(project, id, result);
    out(`Recorded plan ${id}: ${acked.written.join(', ')}`);
    return 0;
  }
  throw new Error(MCP_USAGE);
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

const REOPEN_USAGE = 'Usage: idefactory attempt reopen <attemptId> --kind <kind>... --for method|exception --by <id> --reason "text" [--principal-provider <id> --principal-subject <id>]';
const REUSE_USAGE = 'Usage: idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind>... --note "text" --approver <id>';
const WAIVE_USAGE = 'Usage: idefactory red waive <targetAttemptId> --kind <kind>... --note "text" --approver <id> [--acknowledge-not-stuck] [--invalid-red "text"]';
const INVALIDATE_USAGE = 'Usage: idefactory red invalidate <attemptId> --kind <kind> --class <post-implementation|wrong-failure> --note "text" --by <identity>';
const EXCEPTION_NEW_RUN_NOTE = 'The closed vacuous-red run session reopens on the next run once the red is resolved. A retry-cap session needs --new-run within run.maxNewRuns.';

function handleRedInvalidate(project, parsed, out) {
  const attemptId = parsed.rest[1];
  const kind = stringFlag(parsed.flags, 'kind');
  const invalidationClass = stringFlag(parsed.flags, 'class');
  const note = stringFlag(parsed.flags, 'note');
  const by = stringFlag(parsed.flags, 'by');
  if (!attemptId || !kind || !invalidationClass || !note || !by) throw new Error(INVALIDATE_USAGE);
  const { record, file } = recordRedInvalidation(project, {
    attemptId,
    kind,
    class: invalidationClass,
    note,
    by,
  });
  out(JSON.stringify({
    attemptId,
    invalidation: {
      id: record.id,
      kind: record.kind,
      class: record.class,
      file: path.relative(project, file),
    },
    note: 'The red ran and is withdrawn as not genuine. It does not satisfy red; a reviewed method, an exception, or a later failing red is still needed.',
  }, null, 2));
  return 0;
}

function stringFlag(flags, key) {
  return typeof flags[key] === 'string' && flags[key].length > 0 ? flags[key] : '';
}

const METHOD_PROPOSE_USAGE = 'Usage: idefactory method propose <attemptId> --choice no-red --reason <class> --rationale "text" --implementer <id> --kind <kind>... [--test-path <path>...]';
const METHOD_REVIEW_USAGE = 'Usage: idefactory method review <attemptId> --verdict ACCEPT|REJECT --reviewer <id> --note "text" [--principal-provider <id> --principal-subject <id>]';
const METHOD_SHOW_USAGE = 'Usage: idefactory method show <attemptId>';

function sequenceValues(parsed, key) {
  return (parsed.sequence || [])
    .filter((entry) => entry.key === key && typeof entry.value === 'string')
    .map((entry) => entry.value);
}

function handleMethod(project, parsed, out) {
  const sub = parsed.rest[0];
  const attemptId = parsed.rest[1];
  if (sub === 'show') {
    if (!attemptId) throw new Error(METHOD_SHOW_USAGE);
    const attempt = getAttempt(project, attemptId);
    if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);
    const row = describeAttemptMethod(project, attempt);
    out(row ? `${[describeMethod(row), ...describeCoverage(row)].join('\n')}\n` : `Attempt ${attemptId} uses the red-first method.\n`);
    return 0;
  }
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  if (sub === 'propose') {
    const kinds = sequenceValues(parsed, 'kind');
    const rationale = stringFlag(parsed.flags, 'rationale');
    const proposer = stringFlag(parsed.flags, 'implementer');
    const reason = stringFlag(parsed.flags, 'reason');
    const choice = stringFlag(parsed.flags, 'choice');
    if (!attemptId || kinds.length === 0 || !rationale || !proposer || !reason || !choice) {
      throw new Error(METHOD_PROPOSE_USAGE);
    }
    const result = proposeMethod(project, {
      attemptId,
      choice,
      reason,
      rationale,
      proposer,
      kinds,
      testPaths: sequenceValues(parsed, 'test-path'),
    });
    out(JSON.stringify({
      attemptId,
      method: {
        id: result.record.id,
        choice: result.record.choice,
        reason: result.record.reason,
        kinds: result.record.kinds,
        sourceRevision: result.record.sourceRevision,
        changedFiles: result.record.changedFiles,
        file: path.relative(project, result.file),
      },
      note: 'A different role must record idefactory method review before this attempt can be accepted.',
    }, null, 2));
    return 0;
  }
  if (sub === 'review') {
    const verdict = stringFlag(parsed.flags, 'verdict');
    const reviewer = stringFlag(parsed.flags, 'reviewer');
    const note = stringFlag(parsed.flags, 'note');
    if (!attemptId || !verdict || !reviewer || !note) throw new Error(METHOD_REVIEW_USAGE);
    const result = reviewMethod(project, {
      attemptId,
      verdict,
      reviewer,
      note,
      principalProvider: stringFlag(parsed.flags, 'principal-provider') || undefined,
      principalSubject: stringFlag(parsed.flags, 'principal-subject') || undefined,
    });
    out(JSON.stringify({
      attemptId,
      review: {
        id: result.record.id,
        verdict: result.record.verdict,
        reviewer: result.record.reviewer,
        file: path.relative(project, result.file),
      },
    }, null, 2));
    return 0;
  }
  throw new Error(`${METHOD_PROPOSE_USAGE}\n       ${METHOD_REVIEW_USAGE}\n       ${METHOD_SHOW_USAGE}`);
}

function handleRed(project, parsed, out) {
  if (parsed.rest[0] === 'list') {
    const attemptId = parsed.rest[1] || (typeof parsed.flags.json === 'string' ? parsed.flags.json : '');
    if (!attemptId) throw new Error('Usage: idefactory red list <attemptId> [--json]');
    const attempt = getAttempt(project, attemptId);
    if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);
    const doc = listReds(project, attempt);
    out(parsed.flags.json ? `${JSON.stringify(doc, null, 2)}\n` : `${renderRedList(doc)}\n`);
    return 0;
  }
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const sub = parsed.rest[0];
  if (sub === 'invalidate') return handleRedInvalidate(project, parsed, out);
  if (sub !== 'reuse' && sub !== 'waive') {
    throw new Error(`${REUSE_USAGE}\n       ${WAIVE_USAGE}\n       Usage: idefactory red list <attemptId> [--json]`);
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
      invalidRed: parsed.flags['invalid-red'],
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
    if (token.startsWith('--') && token.indexOf('=', 2) > 2) {
      const at = token.indexOf('=', 2);
      const key = token.slice(2, at);
      const value = token.slice(at + 1);
      flags[key] = value;
      sequence.push({ key, value });
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
