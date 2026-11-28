import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHORITY, ENFORCEMENTS, LEVELS } from '../src/lib/authority.mjs';
import { BLOCKED_TABLE } from '../src/lib/blocked-states.mjs';

export const GUIDANCE_HEADING = '## Blocked states and authority';
export const GUIDANCE_TARGETS = [
  'templates/cursor/rules/factory.mdc',
  'templates/cline/rules/factory.md',
  'templates/copilot/factory.agent.md',
  ...['factory-run', 'factory-coordinator', 'factory-governance', 'factory-openspec']
    .map((skill) => `templates/skills/${skill}/SKILL.md`),
];

const LEVEL_TEXT = {
  agent: '`agent` (an implementing agent may decide)',
  independent: '`independent` (an identity other than the implementer decides)',
  human: '`human` (a person decides)',
};
const ENFORCEMENT_TEXT = {
  none: '`none` (recorded, not checked)',
  identity: '`identity` (the command checks the approver identity)',
  principal: '`principal` (the command checks a verified principal)',
};

const ROUTINE_HEADING = '## Routine steps and external effects';
const SECTION_END = /^## |^<!-- idefactory:owned -->/m;

function commandFor(table, gateId) {
  for (const row of Object.values(table)) {
    const option = row.options.find((entry) => entry.id === gateId);
    if (option) {
      return option.command
        .replaceAll('{change}', '<change>')
        .replaceAll('{task}', '<task>')
        .replaceAll('{action}', '<action>')
        .replaceAll('{attemptId}', '<attemptId>');
    }
  }
  return null;
}

/** The block every shipped copy carries, rendered from the authority and blocked-state tables. */
export function renderGuidanceBlock({ authority = AUTHORITY, table = BLOCKED_TABLE } = {}) {
  const humanGates = Object.entries(authority)
    .filter(([, gate]) => gate.level === 'human')
    .map(([id, gate]) => ({ id, why: gate.why, command: commandFor(table, id) }));
  const levelLines = LEVELS.map((level) => LEVEL_TEXT[level]);
  const enforcementLines = ENFORCEMENTS.map((label) => ENFORCEMENT_TEXT[label]);
  return [
    GUIDANCE_HEADING,
    '',
    'Read the report with `--json` before you act on it. Take the first option that is `supported`, has `resolves: true`, and has an authority of `agent` or `independent`:',
    '- `agent`: run it yourself.',
    '- `independent`: run it only under an identity other than the implementer\'s, such as the reviewing role. Never run it as the implementer.',
    '- `human`: a person decides. Stop and quote the report to them. Do not ask for a decision that the packet lists under standing decisions.',
    '',
    'A person is needed only for these gates, which the authority table marks `human`:',
    ...humanGates.map((gate) => `- \`${gate.id}\`: ${gate.why}${gate.command ? `. Command: \`${gate.command}\`` : '.'}`),
    '',
    'Stop rules:',
    '- `retry: never`: stop and report. Do not retry.',
    '- `retry: only-after-change`: retry only after the recorded state changes.',
    '- Condition stops (`vacuous-red`, `unchanged-state`, `host-usage-unavailable`, `invalid-budget`) clear when their condition is resolved. Resolve it and run again without `--new-run`.',
    '- Budget stops (`max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`) take `--new-run` only within `run.maxNewRuns`. Past the cap, the report names a person.',
    '- `max-tokens` and `max-cost` take `--new-run` only after a person decides.',
    '',
    `Authority levels: ${levelLines.join('; ')}. Enforcement labels: ${enforcementLines.join('; ')}.`,
  ].join('\n');
}

function sectionEnd(text, from) {
  const rest = text.slice(from);
  const match = rest.search(SECTION_END);
  return match < 0 ? text.length : from + match;
}

/** Replace the generated block in one template, or insert it after the routine-steps section. */
export function applyGuidanceBlock(text, block) {
  const trimmed = block.trim();
  const start = text.indexOf(`${GUIDANCE_HEADING}\n`);
  if (start >= 0) {
    const end = sectionEnd(text, start + GUIDANCE_HEADING.length);
    return `${text.slice(0, start)}${trimmed}\n\n${text.slice(end)}`;
  }
  const routine = text.indexOf(`${ROUTINE_HEADING}\n`);
  if (routine < 0) throw new Error(`no ${ROUTINE_HEADING} section to place the guidance block after`);
  const end = sectionEnd(text, routine + ROUTINE_HEADING.length);
  const before = text.slice(0, end).replace(/\s*$/, '');
  return `${before}\n\n${trimmed}\n\n${text.slice(end)}`;
}

/** Each target whose block differs from the rendered block, or whose heading is missing. */
export function staleGuidanceTargets({ root, authority, table, targets = GUIDANCE_TARGETS } = {}) {
  const block = renderGuidanceBlock({ authority, table });
  return targets.filter((rel) => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    return applyGuidanceBlock(text, block) !== text;
  });
}

export function writeGuidanceBlocks({ root, authority, table, targets = GUIDANCE_TARGETS } = {}) {
  const block = renderGuidanceBlock({ authority, table });
  const written = [];
  for (const rel of targets) {
    const file = path.join(root, rel);
    const text = fs.readFileSync(file, 'utf8');
    const next = applyGuidanceBlock(text, block);
    if (next !== text) {
      fs.writeFileSync(file, next);
      written.push(rel);
    }
  }
  return written;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv.includes('--check')) {
    const stale = staleGuidanceTargets({ root });
    if (stale.length) {
      process.stderr.write(`guidance block differs from the tables; run node scripts/build-guidance.mjs:\n${stale.map((rel) => `  ${rel}`).join('\n')}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write('guidance blocks match the tables\n');
    }
  } else {
    const written = writeGuidanceBlocks({ root });
    process.stdout.write(`wrote the guidance block to ${written.length} file(s)\n`);
  }
}
