# Proposal

## Why

Part of #51 (failure 1, regression scenario 2). An attempt was independently reviewed and accepted, every check passed at a clean revision, and completion then demanded a red that was never required during implementation. `red waive` refused with `red exceptions apply only before verifying (target state=accepted)`. The attempt lifecycle sends `accepted` only to `finalized` or `finalize-failed`, and `red reuse` needs a rejected source attempt, so no documented step leads out. The attempt is stuck with valid evidence, and the only remaining options are to fabricate a test failure or to edit evidence by hand. Neither is acceptable.

`disclose-effective-requirements` prevents this class of failure going forward. It does not help an attempt that is already accepted, and other late discoveries can still strand one (a red invalidated after acceptance, or a method that turns out wrong). The factory needs one audited way back that keeps the real evidence and the original review.

## What Changes

- New `idefactory attempt reopen <attemptId> --kind <kind>... --for method|exception --by <id> --reason <text>`. It moves an `accepted` attempt back to `awaiting-review`, only for named kinds that lack a satisfying red, method, or exception.
- Reopen keeps the original review verdict, reviewer identity, and every stored record unchanged in a review history, and records who reopened, why, and for which kinds. The earlier verdict is not treated as a review of the amended evidence.
- While an attempt is reopened, `red reuse`, `red waive`, and `method propose` accept the named kinds on that attempt, and nothing else. An exception issued this way counts as stuck for the stuck-warning rule, so no `--acknowledge-not-stuck` is needed.
- `--for method` needs only an identity that differs from the implementer, so an autonomous run can recover through a reviewer-accepted `no-red` method. `--for exception` follows the existing exception authorization: a human approver, and a verified principal under policy version 2.
- After the amendment the reviewer records a fresh verdict. Completion still needs it, and every other gate stays in force.
- Reopen is bounded: at most two per attempt, refused once a finalization journal exists, and never from `finalize-failed` or `finalized`.
- Completion's missing-red error on an accepted attempt names `idefactory attempt reopen`.
- Status, packets, and the verdict comment show each reopen and the prior verdict.
- **BREAKING**: none. The generic `attempt transition` command still refuses `accepted` to `awaiting-review`.

## Capabilities

### New Capabilities

- `evidence-recovery`: the audited route for an accepted attempt whose red requirement turns out to be unmet.

### Modified Capabilities

- `red-evidence-exceptions`: reuse and waive accept a reopened attempt for the named kinds, in addition to attempts that have not entered `verifying`.

## Impact

- New `src/lib/attempt-reopen.mjs`, an `attempt reopen` entry in `src/lib/run.mjs` and `src/lib/command-help.mjs`, and an `evidence.reopens` list and review history on the attempt.
- `src/lib/red-exceptions.mjs` (`requireBeforeVerifying` and `redSatisfaction` callers), `src/lib/red-method.mjs` (proposal window), `src/lib/complete.mjs` (error text), `src/lib/orchestrate.mjs` (reviewer request names the reopen), `src/lib/queue.mjs` and `src/lib/pull-request.mjs` (display), `src/lib/event-log.mjs`.
- `templates/skills/factory-governance/SKILL.md`, `factory-build`, `factory-verify`, `templates/factory/governance.md`, `README.md`, adapter copies.
- Depends on `disclose-effective-requirements` for the requirement set and on `red-method-selection` for the `--for method` route. `--for exception` works without it.
- No new dependencies. Existing attempts are unchanged.

Out of scope:

- Fabricating, editing, or deleting any stored evidence.
- Reopening an attempt that is finalized, finalize-failed, or has a finalization journal.
- Recovering a missing or stale passing check. `verify run` already records a new passing attestation at the current clean revision, and completion judges attestations at completion time.
- Changing who may approve an exception, or removing the stuck warning for waivers outside a reopen.
- Rewriting the attempt lifecycle's allowed transitions for the generic transition command.
