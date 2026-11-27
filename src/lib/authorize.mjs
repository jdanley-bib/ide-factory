import { actionIds, actionRow, assertTarget, isExternalEffectAction, unknownActionMessage } from './approval-actions.mjs';
import { attemptsForItem } from './reconcile-diff.mjs';
import { readPolicyVersion } from './principal.mjs';
import { authorizes } from './risk-gates.mjs';
import { getWorkItem } from './work.mjs';

const AUTHORIZE_USAGE = 'Usage: idefactory authorize --change <name> [--task <id>] --action <action> [--target <name>] [--json]';

/** The approve command a human would run, with the request's own values filled in. */
export function approveCommandFor(project, request) {
  const parts = ['idefactory approve <id>', '--note "<why>"', `--change ${request.change}`];
  const external = isExternalEffectAction(request.action);
  if (request.task) parts.push(`--task ${request.task}`);
  else if (!external) parts.push('--task <id>');
  parts.push(`--action ${request.action}`);
  if (external) parts.push(`--target ${request.target}`);
  parts.push('--approver <id>');
  if (readPolicyVersion(project) >= 2) parts.push('--principal-provider <id> --principal-subject <id>');
  parts.push('--expiry <iso>');
  return parts.join(' ');
}

/**
 * Answer "am I authorized to do this?" without writing or performing anything.
 * A malformed request throws; both authorized and not-authorized answers are returned.
 */
export function authorizeRequest(project, flags) {
  const change = typeof flags.change === 'string' ? flags.change : '';
  const action = typeof flags.action === 'string' ? flags.action : '';
  const task = typeof flags.task === 'string' ? flags.task : undefined;
  const target = typeof flags.target === 'string' ? flags.target : undefined;
  if (!change || !action) throw new Error(AUTHORIZE_USAGE);
  const row = actionRow(action);
  if (!row) throw new Error(`${unknownActionMessage(action)}\n${AUTHORIZE_USAGE}`);
  if (isExternalEffectAction(action)) {
    if (target === undefined) throw new Error(`--target is required for ${action}\n${AUTHORIZE_USAGE}`);
    assertTarget(target);
  } else {
    if (target !== undefined) throw new Error(`--target applies only to external-effect actions (${actionIds().filter(isExternalEffectAction).join(', ')})`);
    if (!task) throw new Error(`--task is required for ${action}\n${AUTHORIZE_USAGE}`);
  }

  let verificationProfile;
  let implementerId = typeof flags.implementer === 'string' ? flags.implementer : undefined;
  if (task) {
    const item = getWorkItem(project, change, task);
    verificationProfile = item?.factory?.verificationProfile;
    if (!implementerId && item) {
      const attempts = attemptsForItem(project, item);
      implementerId = attempts[attempts.length - 1]?.implementerId;
    }
  }
  const result = authorizes(project, { action, change, task, target, verificationProfile, implementerId });
  const request = { change, action, ...(task ? { task } : {}), ...(target ? { target } : {}) };
  if (result.authorized) {
    return {
      authorized: true,
      ...request,
      ...(result.approvalId ? { approvalId: result.approvalId } : {}),
      ...(result.waived ? { waived: true } : {}),
    };
  }
  return {
    authorized: false,
    ...request,
    reason: result.reason,
    approveCommand: approveCommandFor(project, request),
  };
}

export function renderAuthorizeText(doc) {
  if (doc.authorized) {
    const via = doc.approvalId ? `approval ${doc.approvalId}` : 'the verification profile (humanGate is false)';
    return `authorized: ${doc.action} for ${doc.change}${doc.task ? ` ${doc.task}` : ''}${doc.target ? ` at ${doc.target}` : ''} by ${via}`;
  }
  return [
    `not authorized: ${doc.action} for ${doc.change}${doc.task ? ` ${doc.task}` : ''}${doc.target ? ` at ${doc.target}` : ''}`,
    `reason: ${doc.reason}`,
    `A human can authorize it with: ${doc.approveCommand}`,
  ].join('\n');
}
