export const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@:+-]{0,127}$/;

export const IDENTITY_FORMAT_TEXT = 'use 1-128 characters from letters, digits, . _ @ : + - and start with a letter or digit';

const SHOWN_VALUE_LIMIT = 64;

export function isIdentity(value) {
  return typeof value === 'string' && IDENTITY_PATTERN.test(value);
}

function shownValue(value) {
  const text = JSON.stringify(value);
  if (text.length <= SHOWN_VALUE_LIMIT) return text;
  return `${text.slice(0, SHOWN_VALUE_LIMIT)}..."`;
}

/**
 * Throw unless `value` is a valid identity, naming `label` (a flag or evidence key)
 * in the message. A missing, empty, or non-string value (a bare flag parses as
 * `true`) reports that the label needs a value.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
export function assertIdentity(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} needs a value`);
  }
  if (!IDENTITY_PATTERN.test(value)) {
    throw new Error(`${label} ${shownValue(value)} is not a valid identity: ${IDENTITY_FORMAT_TEXT}`);
  }
  return value;
}
