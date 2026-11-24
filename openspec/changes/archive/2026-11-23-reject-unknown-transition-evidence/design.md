# Design

## Context

`attempt transition` reads evidence in `src/lib/run.mjs` (the `transition` branch), which hands the parsed object to `transitionAttempt` in `src/lib/attempt.mjs`. That function reads a fixed set of keys (`reviewerId`, `notes`, `verdict`, `securityReviewerId`, `changedFiles`, `baseRev`, `implementerId`) and ignores the rest. Two internal callers also pass evidence through `transitionAttempt`: the `assigned` transition in `startAttempt` (`{assignedRole}`) and `finalize-failed` in `src/lib/complete.mjs` (`{error}`). Those keys never come from the command line, so a check written inside `transitionAttempt` would have to know about them. See proposal.md for the motivation.

`rejectCallerSuppliedCheckResults` already refuses `red`, `verification`, and similar keys before any write. The new check follows the same pattern.

## Goals / Non-Goals

**Goals:**
- A command-line transition with an unsupported key or a wrongly typed value fails before the attempt file is written.
- The error names the key, and for `review` it says where the notes belong.
- Valid evidence behaves exactly as before.

**Non-Goals:**
- Changing internal transitions or their evidence.
- Changing the stored attempt shape.
- Warnings in place of errors.

## Decisions

**Validate at the command-line boundary, not in every caller.** `transitionAttempt` takes a new option, `supplied`, which `run.mjs` sets to `true` for evidence read from `--evidence` or `--evidence-file`. When `supplied` is true, the function runs the new check after `rejectCallerSuppliedCheckResults` and before `validateEvidence`. The existing check-result refusal keeps its message for `red`, `verification`, and similar keys, which are also unknown to the new check. Internal callers omit the option and are unaffected. Alternative considered: validate inside every call. Rejected because the internal keys (`assignedRole`, `error`) would have to be whitelisted as well.

**One shared allowlist, not one per state.** The keys mean the same thing across states, and the state-specific rules (such as the security verdict and `reviewerId` requirements) already live in `validateEvidence`. A per-state list would duplicate those rules without adding protection.

**Hand-written checks, no schema dependency.** The check is a small table of key to type rule and a verdict comparison, consistent with the rest of `attempt.mjs`. No new package is needed.

**Verdict conflict is compared case-insensitively.** This matches the existing `accepted` check, which uppercases the verdict before comparing.

**Error text.** Unsupported keys are reported as `unsupported evidence key "<key>"`. The `review` key adds `put review notes in top-level "notes"`. Wrong types report the key and the expected type.

## Risks / Trade-offs

- [Breaking for callers that pass extra keys] → The repository's docs and work packet use only supported keys. The error names the key, so a caller can fix it in one step. Record the change as BREAKING in the release notes.
- [A key added later must also be added to the allowlist] → The allowlist is a single constant, and a test pins it to the exact key set in the spec requirement, so a change to either one fails the build until the other is updated.
- [Existing attempts stored with empty notes stay empty] → Out of scope. Those records are not rewritten.

## Migration Plan

No data migration. Ship with the release note. Rollback is reverting the check; no stored state depends on it.
