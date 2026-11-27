/**
 * An error that names the unmet invariant it stands for. The message is the text
 * the command already printed; the invariant lets a caller build a blocked-state report.
 */
export class BlockedError extends Error {
  constructor(message, invariant, context = {}) {
    super(message);
    this.name = 'BlockedError';
    this.invariant = invariant;
    this.context = context;
    if (invariant === 'halted') this.code = 'HALT';
  }
}

export const HALT_MESSAGE = 'HALT file present. Factory commands are stopped. Remove it with idefactory resume.';

export function haltError() {
  return new BlockedError(HALT_MESSAGE, 'halted');
}

export const ACTORS = ['human', 'independent-agent', 'implementing-agent', 'tooling'];
export const RETRY_CLASSES = ['safe', 'only-after-change', 'never'];
