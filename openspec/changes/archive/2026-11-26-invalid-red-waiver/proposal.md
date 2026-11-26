# Proposal

## Why

Issue #49: the factory cannot tell a test-first red from a red recorded after the implementation was written. `idefactory verify run --red` accepts any assertion failure from a registered check on the current worktree, and `red waive` refuses only until a `vacuous-red` has been recorded. An attempt whose red was produced after implementation therefore has no way to be recorded as invalid, so either the record stands as genuine evidence or it must be hidden. Neither is honest.

Reading the code for this change also found an audit gap: `red waive` never checks for an existing failing CLI red, so a waiver can be recorded on an attempt that already has a real red. The waiver is inert for gating, but the record is misleading.

The chosen direction is that a human may invalidate a post-implementation red and waive it on the same attempt, with a recorded reason, the red it invalidates named by digest, and an explicit acknowledgment. The waiver never substitutes for clean verification, distinct review, or lockouts.

## What Changes

- Add `idefactory red waive --invalid-red "<reason>"`. It names one or more kinds that each have a failing CLI red on the target attempt. It records a waiver that binds the invalidated red's record digest and the reason, and it requires `--acknowledge-not-stuck`. The waiver's `noRedExists` is false, because a red did run; it is not counted as genuine red.
- **BREAKING**: `red waive` without `--invalid-red` now refuses when a failing CLI red already exists for the kind, and names `--invalid-red` as the path for a post-hoc red. Earlier waivers on attempts with a real red remain on disk and are not rewritten.
- `verify run --red` refuses a kind that already has an exception on the attempt, so an invalidated red cannot be replaced silently.
- An invalidated red does not satisfy red. Completion and the verifying gate treat the kind as satisfied only through the bound waiver, and only while the current red record still matches the invalidated digest.
- `red reuse` requires that each source red satisfies red on its own attempt, so a red invalidated on the rejected attempt cannot be carried into a replacement.
- Status, the reviewer packet, and the verdict comment show an invalidated red by digest with its reason, and never say that no red ran.
- Help text, `factory-build`, `factory-tdd`, `factory-verify`, the governance template, and the README state the post-implementation rule and the new flag. Adapter copies and `templates/adapter-history.json` are regenerated.
- The approver rule stays as it is: the approver differs from the implementer, and under policy version 2 is a verified principal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `red-evidence-exceptions`: adds the invalid-red waiver, refusal of waivers over an existing red, refusal of a second red on an excepted kind, the reuse rule for a valid source red, guidance that matches the CLI, and changes how exceptions are shown.

## Impact

- `src/lib/red-exceptions.mjs` (`waiveRed`, `redSatisfaction`, `reuseRed`, `describeException`, the waiver record shape).
- `src/lib/verification-evidence.mjs` (refuse `--red` on an excepted kind).
- `src/lib/run.mjs` (`red waive` flag parsing, usage text, `--invalid-red` without a value).
- `src/lib/command-help.mjs` (red waive help and notes).
- Callers of `redSatisfaction` (`complete.mjs`, `orchestrate.mjs`, `attempt.mjs`) get the new satisfaction rule without changes of their own.
- `templates/skills/factory-build/SKILL.md`, `templates/skills/factory-tdd/SKILL.md`, `templates/skills/factory-verify/SKILL.md`, `templates/factory/governance.md`, `README.md`, and the regenerated adapter copies and `templates/adapter-history.json`.
- `test/red-exceptions.test.mjs`, `test/verification-reuse.test.mjs`, and help and guidance tests.
- No new dependencies. Existing `.factory/exceptions/red/` files and attempt records are read as before.

Out of scope:

- Detecting a post-implementation red automatically. A git-history gate, which would check that test changes precede implementation changes, is not part of this change. The CLI still cannot detect an undetected post-hoc red, so the rule is enforced by the implementer and the reviewer.
- Changing the approver rule, or requiring the approver to differ from the reviewer. A waiver's approver may still be the reviewer who later accepts or rejects the attempt.
- Rewriting or migrating earlier waivers or reuse exceptions.
- Changing reuse for a source red that was never invalidated, even when it was recorded after implementation.
- Any change to lockouts, the retry cap, or the verification attestation rules.
