# Proposal

## Why

Issue #47: after a review rejection, `idefactory lockout create --agent engineer-5.1-abc123 ...` fails with a generic usage line. Attempts accept any string as `implementerId`, `reviewerId`, and `securityReviewerId`, but lockout `--agent` and `--resolver` accept only `^[a-z0-9-]+$`. An id built from a task number such as `5.1` always contains a dot, so the lockout step breaks exactly when a review rejects.

Reading the code for the issue shows related defects that make the failure hard to diagnose and weaken the audit record:

- A bare `--agent` flag is stored as the boolean `true`, and the regex test passes it as the string "true".
- `--reviewer` is documented as required but silently defaults to the literal `reviewer`.
- The dispatcher and `createLockout` usage lines omit `--reviewer`, and a given-but-invalid `--resolver` is reported as missing.
- Under policy version 2 the resolver is a verified principal subject, which can contain uppercase letters or `@` and is blocked by the same regex.

## What Changes

- Add one shared identity format and use it for every identity the CLI accepts as input: lockout `--agent`, `--reviewer`, `--resolver`, the legacy lockout note `Agent:` line, and the attempt evidence keys `implementerId`, `reviewerId`, and `securityReviewerId`.
- Reject a bad identity before any write and name the offending flag or evidence key, the value, and the allowed characters. A flag given without a value gets its own "needs a value" error.
- Make `lockout create --reviewer` required, matching help and the governance skill. No default value is recorded.
- Accept an identity outside the shared format for a lockout only when it exactly equals an identity already stored on an attempt. Stored attempts are never re-validated and no id is normalized or aliased.
- Build the lockout usage errors from the command help entries and add a test that fails when they drift.
- **BREAKING**: `lockout create` without `--reviewer` now fails instead of recording `reviewer`. New `attempt transition` evidence ids containing whitespace, quotes, slashes, or other characters outside the format are refused.

Out of scope:

- An `--attempt <id>` shortcut that fills the identities in from a stored attempt.
- Any change to how an active lockout blocks completion.
- Re-validating, rewriting, or migrating attempt or lockout records already on disk.
- Case folding, trimming, or alias matching when comparing identities.
- Validating other free-text flags, and the `approve` and `red` approver ids.
- Any automation or intake workflow for issues.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `human-governance`: adds the shared identity format, lockout input validation with field-naming errors, a required reviewer, and the exact-match exception for identities already recorded on attempts.
- `guided-build`: adds identity validation for supplied `implementerId`, `reviewerId`, and `securityReviewerId` evidence on `attempt transition`.
- `cli-help`: adds that lockout usage errors match the lockout help entries.

## Impact

- `src/lib/govern.mjs` (`createLockout`, `resolveLockout`, `parseLegacyLockoutFields`), a new shared validator module, `src/lib/attempt.mjs` (`assertSuppliedEvidence`), `src/lib/run.mjs` (lockout dispatch and usage), `src/lib/command-help.mjs`.
- `test/govern.test.mjs`, `test/command-help.test.mjs`, and attempt evidence tests.
- `README.md` line stating the ids are strings, `templates/skills/factory-governance/SKILL.md`, and the adapter copies and `templates/adapter-history.json` they generate.
- No new dependencies. Existing `.factory/` data stays readable.
