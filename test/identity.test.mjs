import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDENTITY_FORMAT_TEXT, assertIdentity, isIdentity } from '../src/lib/identity.mjs';

test('assertIdentity accepts dotted, email-style, and maximum-length identities', () => {
  for (const value of [
    'engineer-5.1-abc123',
    'Reviewer.One@example.com',
    'user_name',
    'org:team+tag',
    '7',
    `a${'b'.repeat(127)}`,
  ]) {
    assert.equal(assertIdentity(value, '--agent'), value);
    assert.equal(isIdentity(value), true);
  }
});

test('assertIdentity refuses unsafe identities and names the label', () => {
  for (const value of ['bad id', 'line\nbreak', '-flaglike', '.hidden', 'a/b', 'q"uote', `a${'b'.repeat(128)}`]) {
    assert.throws(
      () => assertIdentity(value, '--agent'),
      (error) => error.message.startsWith('--agent ')
        && error.message.includes('is not a valid identity')
        && error.message.includes(IDENTITY_FORMAT_TEXT),
      `expected refusal for ${JSON.stringify(value)}`,
    );
    assert.equal(isIdentity(value), false);
  }
});

test('assertIdentity reports a missing value for empty and non-string input', () => {
  for (const value of ['', true, undefined, null, 5]) {
    assert.throws(() => assertIdentity(value, '--reviewer'), /^Error: --reviewer needs a value$/);
  }
});

test('assertIdentity JSON-quotes and truncates the echoed value', () => {
  assert.throws(
    () => assertIdentity('bad\nid', 'evidence key "reviewerId"'),
    (error) => error.message.includes('"bad\\nid"') && !error.message.includes('\n'),
  );
  const long = `a b${'x'.repeat(500)}`;
  assert.throws(
    () => assertIdentity(long, '--agent'),
    (error) => error.message.length < 300 && error.message.includes('..."'),
  );
});
