# Proposal

## Why

Part of #51 (failure 1, regression scenario 1). The red requirement is computed from two different sets. The work packet, the run request, the gate into `verifying`, and red exceptions all read only the item's own `checks`. Completion reads the item's checks together with its `verificationProfile` checks. A profile that adds `contract` therefore stays invisible until completion, at which point a genuine red can no longer be produced and the attempt is stranded in `accepted` with passing evidence and a clean review. The packet even prints `Checks:` without the profile's checks, so a human or agent reading it cannot tell.

The requirement set should be resolved once, before implementation, and every consumer should read that one answer. Incompatible requirements should be found before an attempt starts, not after review.

## What Changes

- One resolved requirement set per work item: the profile and item checks together (each tagged with where it came from), the kinds that need red evidence, the human decisions the item will need (accept and complete gates), and the item's dependencies. The packet, the reviewer packet, status, the run request, the gate into `verifying`, red exceptions, and completion all use it.
- New read-only command `idefactory requirements <change> <task> [--json]` prints the set and any problems.
- The work packet lists every required check with its source and states red required for every test kind in the full set, not only the item's list.
- A preflight runs when an attempt starts and when `sync-tasks` creates or updates an item. It reports a problem when: the profile is undefined; a required kind has no registry argv; a human gate is required but cannot be satisfied under the configured policy; or a dependency does not exist. An attempt does not start while a problem exists.
- The gate into `verifying` and the run request require red for every kind in the full set, so a missing red is found at implementation time.
- Completion and the review handoff report every unmet requirement in one message instead of stopping at the first.
- Help for `requirements` and the attempt lifecycle names the single set.
- **BREAKING**: an attempt whose profile adds a test kind not listed in the item's own checks is now refused at `verifying` for a missing red. Previously it passed that gate and failed at completion, so no completable attempt is newly refused.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `guided-build`: adds the single resolved requirement set and its preflight, and changes the packet requirement and the red gates to read it.
- `red-evidence-exceptions`: an exception is judged against the full set, so a profile-derived test kind can be reused or waived before verifying.
- `cli-help`: the new command and lifecycle notes.

## Impact

- `src/lib/required-checks.mjs` (new resolver beside `requiredChecksFor`), `src/lib/queue.mjs` (`renderPacket`, `redRequiredKinds`), `src/lib/attempt.mjs` (the `verifying` gate and `startAttempt` preflight), `src/lib/orchestrate.mjs` (run request, two sites), `src/lib/red-exceptions.mjs` (kind eligibility), `src/lib/complete.mjs` and the review handoff (report all unmet), `src/lib/verification-status.mjs`, `src/lib/run.mjs`, `src/lib/command-help.mjs`.
- `templates/skills/factory-build/SKILL.md`, `factory-run`, `factory-verify`, adapter copies, `README.md`.
- `test/` additions for each consumer and for the preflight.
- No new dependencies and no change to stored attempts or work items.

Out of scope:

- Choosing whether a task should use a red at all. That is `red-method-selection`; this change only makes the full set visible and consistent.
- Recovery for an attempt already stranded at `accepted`. That is `accepted-attempt-evidence-recovery`.
- A machine-readable blocked-state document for preflight failures. That is `actionable-blocked-states`; until it lands, preflight failures are ordinary errors that name the unmet invariant.
- Changing which checks a profile contains or how profiles are authored.
