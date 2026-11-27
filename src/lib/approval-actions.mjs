/**
 * The one table of approvable actions. Approve, authorize, validation, help, and the governance
 * text read it, so none of them can list a different set.
 */
export const APPROVAL_ACTIONS = [
  { id: 'accept', kind: 'gate', binding: 'task and revision', waivableByProfile: true },
  { id: 'complete', kind: 'gate', binding: 'task and revision', waivableByProfile: true },
  { id: 'publish', kind: 'external-effect', binding: 'change and target', waivableByProfile: false },
  { id: 'deploy', kind: 'external-effect', binding: 'change and target', waivableByProfile: false },
  { id: 'spend', kind: 'external-effect', binding: 'change and target', waivableByProfile: false },
  { id: 'account', kind: 'external-effect', binding: 'change and target', waivableByProfile: false },
];

export const AUTHORIZATION_REASONS = [
  'no-approval',
  'expired',
  'revoked',
  'revision-mismatch',
  'dirty-worktree',
  'same-approver',
  'policy-mismatch',
  'principal-required',
  'target-mismatch',
];

export const TARGET_FORMAT = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
export const DEFAULT_STANDING_MAX_HOURS = 168;
export const MAX_STANDING_MAX_HOURS = 720;

export function actionIds() {
  return APPROVAL_ACTIONS.map((row) => row.id);
}

export function actionRow(id) {
  return APPROVAL_ACTIONS.find((row) => row.id === id) || null;
}

export function isExternalEffectAction(id) {
  return actionRow(id)?.kind === 'external-effect';
}

export function actionListText() {
  return actionIds().join(', ');
}

export function unknownActionMessage(value) {
  return `unknown action ${JSON.stringify(String(value ?? ''))}; valid actions: ${actionListText()}`;
}

export function assertTarget(value) {
  if (typeof value !== 'string' || !TARGET_FORMAT.test(value)) {
    throw new Error('--target must be 1 to 128 characters from letters, digits, ".", "_", ":", "/", and "-", starting with a letter or digit');
  }
  return value;
}

/** One line per action with its binding, for help. */
export function actionHelpLines() {
  return APPROVAL_ACTIONS.map((row) => `${row.id}: bound to ${row.binding}${row.kind === 'external-effect' ? '; needs --target; a profile humanGate of false never waives it' : '; a profile humanGate of false waives it'}`);
}
