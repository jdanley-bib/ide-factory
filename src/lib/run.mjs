import fs from 'node:fs';
import path from 'node:path';
import { approve, doctor, lockout, reject, status } from './govern.mjs';
import { initProject, upgradeProject } from './install.mjs';
import { halted, projectDir } from './layout.mjs';
import { buildPacket, syncTasks } from './queue.mjs';

const HELP = `idefactory — IDE-native software factory

The IDE session model does the work. This CLI installs shared state and
prints work packets. It does not launch a model, and it does not invent products.

Usage:
  idefactory init [path] [--force-roster] [--with-openspec] [--with-backlog]
  idefactory upgrade [path]
  idefactory doctor [path]
  idefactory status [path]
  idefactory sync-tasks <change> [--path dir]
  idefactory next [--change name] [--path dir]
  idefactory approve <id> --note "text" [--path dir]
  idefactory reject <id> --note "text" [--path dir]
  idefactory lockout --agent <id> --reviewer <id> --reason "text" [--path dir]
  idefactory halt [path]
  idefactory resume [path]

Team memory is .factory/. The human authors OpenSpec changes.
Backlog.md is the only execution queue.
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
    out(HELP);
    return 0;
  }
  const project = projectDir(parsed.flags, parsed.rest, cwd, cmd);
  try {
    switch (cmd) {
      case 'init': {
        const created = initProject(project, {
          forceRoster: Boolean(parsed.flags['force-roster']),
          withOpenspec: Boolean(parsed.flags['with-openspec']),
          withBacklog: Boolean(parsed.flags['with-backlog']),
          env,
        });
        out(`Initialized ${project}`);
        if (created.length) out(`Created: ${created.join(', ')}`);
        else out('Team state already present. Adapters refreshed.');
        return 0;
      }
      case 'upgrade':
        upgradeProject(project);
        out(`Upgraded adapters in ${project}`);
        return 0;
      case 'doctor':
        return reportDoctor(project, out, err);
      case 'status':
        out(status(project, env));
        return 0;
      case 'sync-tasks': {
        const change = parsed.rest[0];
        const result = syncTasks(project, change, env);
        out(`Synced ${result.change}: created ${result.created}, skipped ${result.skipped}.`);
        return 0;
      }
      case 'next': {
        const packet = buildPacket(project, env, parsed.flags.change || '');
        out(packet.text);
        return 0;
      }
      case 'approve': {
        const file = approve(project, parsed.rest[0], parsed.flags.note || '');
        out(`Recorded approval ${file}`);
        return 0;
      }
      case 'reject': {
        const file = reject(project, parsed.rest[0], parsed.flags.note || '');
        out(`Recorded rejection ${file}`);
        return 0;
      }
      case 'lockout': {
        const file = lockout(project, {
          agent: parsed.flags.agent,
          reviewer: parsed.flags.reviewer,
          reason: parsed.flags.reason,
        });
        out(`Wrote ${path.relative(project, file)}`);
        return 0;
      }
      case 'halt':
        fs.writeFileSync(path.join(project, 'HALT'), 'stop\n');
        out('HALT is set. next and sync-tasks will refuse to run.');
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
  } catch (error) {
    err(error.message || String(error));
    return 1;
  }
}

function reportDoctor(project, out, err) {
  const report = doctor(project);
  if (report.errors.length) {
    out('doctor: fail');
    for (const item of report.errors) out(`- ${item}`);
  } else {
    out('doctor: ok');
  }
  for (const item of report.warnings) err(`warning: ${item}`);
  if (halted(project) && !report.warnings.some((item) => item.includes('HALT'))) {
    err('warning: HALT file is present');
  }
  return report.errors.length ? 1 : 0;
}

function parseArgs(argv) {
  const rest = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
    } else rest.push(token);
  }
  return { cmd: rest[0], rest: rest.slice(1), flags };
}
