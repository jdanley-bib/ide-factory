import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  MARKER,
  ROLES,
  ledger,
  mergeMarked,
  packageRoot,
  readText,
  templatesRoot,
  writeIfMissing,
  writeText,
} from './layout.mjs';
import { findBinary, runBacklog } from './backlog.mjs';

const STATE_FILES = [
  'team.md',
  'routing.md',
  'decisions.md',
  'config.json',
  'governance.md',
  'ceremonies.md',
  'README.md',
  'identity/now.md',
  'identity/wisdom.md',
];

const COMMANDS = [
  {
    name: 'factory-status',
    description: 'Show factory team, OpenSpec, and backlog status',
  },
  {
    name: 'factory-plan',
    description: 'Staff a human-authored OpenSpec change into Backlog.md',
  },
  {
    name: 'factory-build',
    description: 'Implement the next factory backlog task with the factory-build skill',
  },
  {
    name: 'factory-review',
    description: 'Review the current factory task as a different role',
  },
];

export function initProject(project, options = {}) {
  fs.mkdirSync(project, { recursive: true });
  const created = writeState(project, options);
  writeAdapters(project);
  mergeInstructions(project);
  const rules = path.join(project, 'GOLDEN_RULES.md');
  if (!fs.existsSync(rules)) {
    writeText(rules, readText(path.join(packageRoot, 'GOLDEN_RULES.md')));
    created.push('GOLDEN_RULES.md');
  }
  if (options.withOpenspec) ensureOpenspec(project, options.env || process.env);
  if (options.withBacklog) ensureBacklog(project, options.env || process.env);
  ledger(project, 'init', { created });
  return created;
}

export function upgradeProject(project) {
  if (!fs.existsSync(path.join(project, '.factory', 'team.md'))) {
    throw new Error('No .factory/ team state. Run idefactory init first.');
  }
  writeAdapters(project);
  mergeInstructions(project);
  ledger(project, 'upgrade', {});
}

function writeState(project, options) {
  const created = [];
  const factory = path.join(project, '.factory');
  const force = Boolean(options.forceRoster);
  for (const rel of STATE_FILES) {
    const from = path.join(templatesRoot, 'factory', rel);
    const to = path.join(factory, rel);
    if (force && (rel === 'team.md' || rel === 'routing.md')) {
      writeText(to, readText(from));
      created.push(rel);
      continue;
    }
    if (writeIfMissing(to, readText(from))) created.push(rel);
  }
  for (const role of ROLES) {
    for (const leaf of ['charter.md', 'history.md']) {
      const rel = path.join('agents', role, leaf);
      const from = path.join(templatesRoot, 'factory', rel);
      const to = path.join(factory, rel);
      if (force && leaf === 'charter.md') {
        writeText(to, readText(from));
        created.push(rel);
        continue;
      }
      if (writeIfMissing(to, readText(from))) created.push(rel);
    }
  }
  writeIfMissing(path.join(factory, 'approvals', '.gitkeep'), '');
  writeIfMissing(path.join(factory, 'orchestration', '.gitkeep'), '');
  return created;
}

function writeAdapters(project) {
  const skills = path.join(templatesRoot, 'skills');
  const destinations = [
    '.cursor/skills',
    '.claude/skills',
    '.github/skills',
    '.agents/skills',
  ];
  for (const name of fs.readdirSync(skills)) {
    const from = path.join(skills, name);
    if (!fs.statSync(from).isDirectory()) continue;
    for (const dest of destinations) {
      fs.cpSync(from, path.join(project, dest, name), { recursive: true });
    }
  }
  for (const command of COMMANDS) {
    const body = readText(path.join(templatesRoot, 'commands', `${command.name}.md`)).trim();
    const owned = `${body}\n\n${MARKER}\n`;
    writeText(
      path.join(project, '.cursor/commands', `${command.name}.md`),
      `---\ndescription: ${command.description}\n---\n\n${owned}`,
    );
    writeText(
      path.join(project, '.claude/commands', `${command.name}.md`),
      `---\ndescription: ${command.description}\n---\n\n${owned}`,
    );
    writeText(
      path.join(project, '.github/prompts', `${command.name}.prompt.md`),
      `---\ndescription: ${command.description}\nagent: factory\n---\n\n${owned}`,
    );
  }
  writeText(
    path.join(project, '.cursor/rules/factory.mdc'),
    readText(path.join(templatesRoot, 'cursor/rules/factory.mdc')),
  );
  writeText(
    path.join(project, '.github/agents/factory.agent.md'),
    readText(path.join(templatesRoot, 'copilot/factory.agent.md')),
  );
}

function mergeInstructions(project) {
  const section = readText(path.join(templatesRoot, 'fragments/instructions.md'));
  const targets = [
    'AGENTS.md',
    'CLAUDE.md',
    path.join('.github', 'copilot-instructions.md'),
  ];
  for (const rel of targets) {
    const file = path.join(project, rel);
    const existing = fs.existsSync(file) ? readText(file) : '';
    writeText(file, mergeMarked(existing, section));
  }
}

function ensureOpenspec(project, env) {
  if (fs.existsSync(path.join(project, 'openspec', 'config.yaml'))) return;
  const bin = findBinary('openspec', project, env);
  if (!bin) {
    throw new Error('openspec CLI not found. Install @fission-ai/openspec, then re-run with --with-openspec.');
  }
  const result = spawnSync(bin, [
    'init', '--tools', 'cursor,github-copilot,claude', '--no-copilot-cloud', '--no-animation',
  ], { cwd: project, env: { ...env, OPENSPEC_TELEMETRY: '0' }, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'openspec init failed').trim());
  }
}

function ensureBacklog(project, env) {
  if (fs.existsSync(path.join(project, 'backlog', 'config.yml'))) return;
  const name = path.basename(project);
  try {
    runBacklog(project, [
      'init', name,
      '--defaults',
      '--agent-instructions', 'none',
      '--integration-mode', 'cli',
      '--auto-open-browser', 'false',
      '--no-git',
    ], env);
  } catch (error) {
    if (error.code === 'NO_BACKLOG') {
      throw new Error('backlog CLI not found. Install backlog.md, then re-run with --with-backlog.');
    }
    throw new Error(error.message || 'backlog init failed');
  }
}
