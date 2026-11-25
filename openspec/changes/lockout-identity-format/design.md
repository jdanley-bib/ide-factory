# Design

## Context

See proposal.md for motivation. Today:

- `createLockout`, `resolveLockout`, and `parseLegacyLockoutFields` in `src/lib/govern.mjs` each inline `^[a-z0-9-]+$`.
- `parseArgs` in `src/lib/run.mjs` turns a bare `--flag` into the boolean `true`, which the regex then coerces to "true".
- `assertSuppliedEvidence` in `src/lib/attempt.mjs` is the single gate for CLI-supplied evidence. It checks types only.
- Attempt identities are exact-string compared (`implementerId` vs `reviewerId`, `securityReviewerId` vs `implementerId`, resolver vs locked agent). Under policy version 2, `complete` also passes the reviewer id to the principal verifier as the subject.
- The global `HELP` text is digest-pinned in `test/command-help.test.mjs`; this change must not edit it.

## Goals / Non-Goals

**Goals:**

- One definition of a valid identity, used at every input boundary, with errors that say which input is wrong and why.
- No identity that works today for a lockout stops working, and no identity is rewritten or matched loosely.

**Non-Goals:**

- Changing the `approve` and `red` approver ids or other flags.
- Re-validating stored data.

## Decisions

**1. A small `src/lib/identity.mjs` module owns the format.**
It exports the pattern and `assertIdentity(value, label)`, which throws a message of the form `<label> "<value>" is not a valid identity: use 1-128 characters from letters, digits, . _ @ : + - and start with a letter or digit`. A missing, empty, or non-string value (the bare-flag `true`) throws `<label> needs a value`. The echoed value is JSON-quoted and cut at 64 characters so control characters and long input cannot corrupt the terminal or logs.
Alternative: keep per-site regexes and widen each. Rejected: that is how the formats diverged.

**2. The format is permissive but safe.**
Letters, digits, `. _ @ : + -`, starting alphanumeric, at most 128 characters. It admits task-number ids (`engineer-5.1-abc`), emails, and GitHub logins, and excludes whitespace, quotes, slashes, and newlines. The newline exclusion matters because legacy lockout notes are parsed line by line and identities are echoed into `decisions.md` and the event log. The leading alphanumeric keeps a value from looking like a flag.
Alternative: accept any non-empty token. Rejected: it would let newline and control characters into line-oriented files.

**3. Validation lives in the library functions, not only the dispatcher.**
`createLockout`, `resolveLockout`, and `parseLegacyLockoutFields` call `assertIdentity`, so the `lockout --agent ...` alias and any programmatic caller get the same behavior. `assertSuppliedEvidence` calls it for the three id keys, so a bad id is refused before the attempt file is touched. Internal transitions that do not pass `supplied: true` are unchanged.

**4. Exact-match exception for identities already on attempts.**
When a lockout identity fails the format, `recordedAttemptIdentities(project)` reads `.factory/orchestration/attempts/*.json` and collects `implementerId`, `reviewerId`, `evidence.review.reviewerId`, and `evidence.securityReview.reviewerId`. The identity is accepted only if it equals one of them exactly. The scan runs only on the failure path, skips unreadable files, and never writes.
Alternatives: (a) no exception - simpler, but an older attempt with an unusual id could never be locked out, which is the failure in the issue; (b) accept anything an attempt accepted - reopens the newline problem.

**5. `--reviewer` is required with no default.**
`createLockout` validates it like `--agent`. The old default `reviewer` is removed. Existing lockout records keep whatever they stored.

**6. Lockout usage text comes from one place.**
The help entries and the lockout errors in `govern.mjs` and `run.mjs` read their usage strings from the same constants, placed in a leaf module so `command-help.mjs`, `govern.mjs`, and `run.mjs` do not import each other. A test compares each lockout error's usage with `help lockout create|resolve`. The scope is lockout only; other commands keep their strings.

## Risks / Trade-offs

- [New attempt evidence ids stricter than before: whitespace or slashes are now refused] → Only newly supplied ids are checked, the error names the key and the allowed characters, and the proposal marks it BREAKING.
- [A previously valid lockout id that starts with `-` is no longer accepted] → Such a value cannot be passed reliably as a flag value; the exact-match exception does not cover it, and this is accepted.
- [Policy version 2 verifier returns a subject outside the format] → The resolver cannot be accepted unless it was recorded on an attempt; verifiers that need broader subjects are a separate change.
- [Scanning attempts on the failure path is slow in a very large `.factory/`] → It runs only after a format failure and reads small JSON files.
- [Identities echoed in errors] → JSON-quoted and truncated.

## Migration Plan

No data migration. Stored attempts and lockout records are read as before. Rollback is a revert of the code; records written by the new code use the same schema version 1 shape.
