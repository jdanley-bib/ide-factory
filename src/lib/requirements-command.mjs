import { getWorkItem } from './work.mjs';
import { describeProblems, resolveRequirements } from './required-checks.mjs';

/** Read-only requirement set for one work item. */
export function requirementsDocument(project, change, taskId) {
  const item = getWorkItem(project, change, taskId);
  if (!item) throw new Error(`Work item not found: ${change}/${taskId}`);
  return resolveRequirements(project, item);
}

export function renderRequirementsText(doc) {
  const lines = [
    `Requirements for ${doc.change}/${doc.taskId}`,
    `Task class: ${doc.taskClass}`,
    `Verification profile: ${doc.verificationProfile}`,
    'Checks:',
    ...(doc.checks.length
      ? doc.checks.map((entry) => `- ${entry.kind} (${entry.sources.join(', ')})`)
      : ['- none']),
    `Red required for: ${doc.redKinds.join(', ') || 'none'}`,
    'Human decisions:',
    ...doc.humanDecisions.map((entry) => {
      const state = !entry.required ? 'not required' : entry.satisfiable ? 'required' : 'required, cannot be satisfied';
      return `- ${entry.action}: ${state}`;
    }),
    `Dependencies: ${doc.dependencies.map((dep) => `${dep.id}${dep.exists ? '' : ' (missing)'}`).join(', ') || 'none'}`,
  ];
  if (doc.problems.length) lines.push('Problems:', ...describeProblems(doc.problems));
  else lines.push('Problems: none');
  return `${lines.join('\n')}\n`;
}
