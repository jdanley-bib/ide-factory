# Proposal

## Why

An attempt can reach a reviewer, and even complete, without the checks its verification profile requires. Issue #36 reports a `code` item that lists only `unit` while its `frontend-low` profile also requires `build`. The orchestrator hands the attempt to a reviewer with "verification evidence recorded," and the reviewer is not told that `build` is missing.

The gap is in two places, not one:

- The `verifying` stage in `src/lib/orchestrate.mjs` hands off to review without comparing recorded evidence against any profile.
- `requiredChecksFor` in `src/lib/complete.mjs` returns the item's own `checks` whenever that list is non-empty, so the profile is ignored at completion too.

This repository also has no `build` command: its check registry maps only `unit`. Its CLI work items therefore need a profile whose checks are only `unit`. Without one, the rule below would block every new item.

## What Changes

- **Required checks are the union.** For each attempt, the required checks are the checks of the item's `verificationProfile` plus the item's own `checks`. One function computes this set, and both the review handoff and completion use it.
- **Handoff names what is missing.** An attempt in `verifying` whose required checks lack a passing record at the current clean revision is routed to the implementer, not the reviewer. The request names each missing check and says to record it with `idefactory verify run`.
- **Entry into review is refused.** The transitions from `verifying` and `security-checking` to `awaiting-review` are refused, leaving the attempt unchanged, while any required check lacks a passing record.
- **Unknown profiles fail closed.** A `verificationProfile` that is not defined in `.factory/profiles.json` refuses handoff and completion with an error that names it. Today it silently falls back to `unit`.
- **A `cli` profile.** `.factory/profiles.json` in this repository gains `cli` with checks `["unit"]` and `humanGate` false. `templates/factory/profiles.json` gains the same entry so new installs have it. The template is team state, so `upgrade` does not add it to existing installs. The release notes say to add it by hand.
- **This repository's new items use `cli`** through an explicit `verificationProfile` annotation in `tasks.md`. Existing items are not changed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `guided-build`: adds a requirement that the required checks for an attempt are the union of its profile and item checks, enforced at review handoff and at completion, and that an unknown profile fails closed.

## Impact

- `src/lib/orchestrate.mjs`: the `verifying` stage and the handoff request text.
- `src/lib/complete.mjs`: `requiredChecksFor` and the profile lookup.
- `src/lib/attempt.mjs`: the refusal for `verifying` or `security-checking` to `awaiting-review`.
- `.factory/profiles.json` and `templates/factory/profiles.json`.
- Tests in `test/orchestration.test.mjs`, which already drive the CLI through the verifying, review and completion path.
- Existing completed items are not re-checked. Items in progress in this repository's queue, if any, will need the new checks recorded before they can proceed.

## Out of Scope

- Changing the red gate. It still uses the item's own `checks` to decide which test kinds need a red. Whether profile test kinds such as `integration` should also require a red is a separate question.
- Changing the default `verificationProfile` that classification infers for `general` tasks in other projects. Existing projects keep their current inference.
- Changing `humanGate`, the security stage, or the review wording beyond the handoff message.
- Re-checking or repairing completed items, or the 83 items noted in #36's analysis; they are already `done`.
- Adding a `build` command or check mapping to this repository.
