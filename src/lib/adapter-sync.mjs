import {
  applyPlan,
  createRun,
  markReplacements,
  planAdapters,
  stageConflicts,
} from './adapters.mjs';

export const EXIT_CONFLICTS = 3;

const STATUS_ORDER = [
  'current',
  'update',
  'create',
  'modified',
  'preserved',
  'replace',
  'pinned',
  'malformed',
  'orphan',
];

function emptyCounts() {
  const counts = {};
  for (const status of STATUS_ORDER) counts[status] = 0;
  return counts;
}

function buildReport(plan, staged, run, backups, notes, command, dryRun) {
  const summary = emptyCounts();
  const files = plan.files.map((item) => {
    summary[item.status] += 1;
    const entry = { path: item.key, status: item.status, digest: item.rendering };
    const saved = staged && staged.files.get(item.key);
    if (saved) {
      entry.incoming = saved.incoming;
      if (saved.diff) entry.diff = saved.diff;
    }
    if (backups.has(item.key)) entry.backup = backups.get(item.key);
    if (item.reason) entry.reason = item.reason;
    if (item.status === 'pinned' && item.upstreamChanged) entry.upstreamChanged = true;
    return entry;
  });
  summary.orphan = plan.orphans.length;
  const orphans = plan.orphans.map((item) => ({ path: item.path, source: item.source }));
  const exitCode = summary.preserved + summary.malformed > 0 ? EXIT_CONFLICTS : 0;
  return {
    version: 1,
    command,
    dryRun,
    summary,
    run: run ? run.rel : null,
    notes,
    files,
    orphans,
    exitCode,
  };
}

/**
 * Plan, stage, and apply the generated adapter files and instruction sections.
 * @param {string} project
 * @param {{ command?: string, now?: Date, dryRun?: boolean, force?: boolean, replace?: string[] }} [options]
 */
export function syncAdapters(project, options = {}) {
  const command = options.command || 'upgrade';
  const dryRun = Boolean(options.dryRun);
  const planned = planAdapters(project);
  const { plan, notes } = markReplacements(project, planned, {
    force: options.force,
    replace: options.replace,
  });
  if (dryRun) {
    return { plan, staged: null, result: null, report: buildReport(plan, null, null, new Map(), notes, command, true) };
  }
  const needsRun = plan.files.some((item) => item.status === 'preserved' || item.status === 'replace');
  const run = needsRun ? createRun(project, options.now) : null;
  const staged = stageConflicts(project, plan, { run });
  const result = applyPlan(project, plan, { run });
  const backups = new Map(result.files.filter((file) => file.backup).map((file) => [file.key, file.backup]));
  return { plan, staged, result, report: buildReport(plan, staged, run, backups, notes, command, false) };
}

/** Human-readable report lines. */
export function formatReport(report) {
  const { summary } = report;
  const lines = [
    `${report.command}${report.dryRun ? ' (dry run)' : ''}: ${STATUS_ORDER.map((status) => `${summary[status]} ${status}`).join(', ')}`,
  ];
  for (const file of report.files) {
    if (file.status === 'current') continue;
    const reason = file.reason ? `: ${file.reason}` : '';
    const note = file.upstreamChanged ? ' (upstream changed since pin)' : '';
    lines.push(`  ${file.status.padEnd(9)} ${file.path}${reason}${note}`);
    if (file.incoming) lines.push(`    incoming: ${file.incoming}`);
    if (file.diff) lines.push(`    diff:     ${file.diff}`);
    if (file.backup) lines.push(`    backup:   ${file.backup}`);
  }
  for (const orphan of report.orphans) {
    lines.push(`  ${'orphan'.padEnd(9)} ${orphan.path} (a past release generated this path; left in place)`);
  }
  for (const note of report.notes) lines.push(`note: ${note}`);
  if (summary.preserved > 0) {
    lines.push(
      'Resolve with: idefactory adapters pin <path> | idefactory upgrade --replace <path> | edit the file, then run upgrade again.',
    );
  }
  if (summary.malformed > 0) {
    lines.push('Repair the instruction file markers by hand, then run upgrade again.');
  }
  return lines;
}
