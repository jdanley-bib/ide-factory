# Proposal

## Why

Part of #51 (failure 3, regression scenario 3), following #49 and PR #50. After a human invalidates a post-implementation red with `red waive --invalid-red`, the implementer still needs a genuine failing test of the same check kind. Today that is impossible: `verify run --red` refuses any kind that already has an exception, so the attempt cannot record a later red at all, and the documentation does not say what happens to the invalidated record, the waiver's digest reference, or its provenance if one were recorded.

Reading the code for this change found a related gap in the same area. `verify run --red` stores a red as `{ ...reds, [kind]: record }`, so a second red for a kind with no exception silently overwrites the first. Red evidence is therefore not append-only today, which the project requires and #51 asks to preserve.

## What Changes

- Red records are append-only. Every red recorded for a kind is kept, in order, in a per-kind red history on the attempt. The current red for a kind is the latest entry, and existing readers keep reading it from the same place.
- After an invalid-red waiver, `verify run --red` is allowed again for that kind, once. The new red is appended. The invalidated red stays in the history unchanged, and the waiver's digest reference still resolves to it.
- A later failing red satisfies red for the kind only when it is a failing CLI red whose recorded start is after the waiver's issuance and the waiver's invalidated digest is still present in the history. Otherwise the kind is not satisfied.
- A kind may be invalidated at most once on an attempt. A later red that is itself post-hoc cannot be invalidated again on the same attempt.
- Other exceptions (reuse and ordinary waivers) still refuse `verify run --red` for their kind, as today.
- New read-only `idefactory red list <attemptId> [--json]` prints every red in the history with its digest, which is current, which is invalidated, the exception that references it, and what satisfies red for each kind.
- Status, the reviewer packet, and the verdict comment show both the invalidated red and the later red, and never describe the later red as proof of test-first work.
- **BREAKING**: a second `--red` for a kind with no exception now appends to the history instead of replacing the stored red. The current red reads the same, so no consumer changes, but the old record is no longer lost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `verification-evidence`: red records are append-only and listed.
- `red-evidence-exceptions`: the invalid-red rules allow one later red and define when it satisfies red; visibility covers both records.

## Impact

- `src/lib/verification-evidence.mjs` (`verifyRun` red storage and the exception refusal), `src/lib/red-evidence.mjs` (`redForKind` and history helpers), `src/lib/red-exceptions.mjs` (`redSatisfaction`, `describeException`, `listAttemptExceptions`), `src/lib/run.mjs` and `src/lib/command-help.mjs` (`red list`), `src/lib/queue.mjs`, `src/lib/pull-request.mjs` (display).
- `templates/skills/factory-build/SKILL.md`, `factory-tdd`, `factory-verify`, `templates/factory/governance.md`, `README.md`, adapter copies.
- `test/red-exceptions.test.mjs`, `test/verification-evidence.test.mjs`, and new `red list` tests. No new dependencies.
- Existing attempts are read as before. An attempt without a history is treated as having one entry per stored red.

Out of scope:

- Detecting whether a later red was produced before the implementation it tests. The CLI still cannot see ordering; the implementer and the reviewer remain responsible.
- Allowing a second exception for a kind, or a second invalidation.
- Changing reuse, the stuck rule, or the approver rule.
- Rewriting or migrating stored reds or earlier waivers.
