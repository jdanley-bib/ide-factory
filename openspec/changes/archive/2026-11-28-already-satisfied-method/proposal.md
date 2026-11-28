# Proposal

## Why

Part of #54 and #51. When an agent writes a test for behavior that already exists, the red run exits zero and the factory reports `vacuous-red`. That is the correct signal that no failing test can be recorded, but the supported ways out do not fit the situation. The `no-red` method has five reason classes, and none of them says "the behavior already exists and I added only tests". `behavior-preserving` is the nearest, but it is meant for refactors, it needs tracked test files (a new test is not yet tracked), and a reviewer reading it would be told something false. `red waive` and `red reuse` need a human. So the honest case, which is common when a change was partly implemented earlier, has no autonomous path, and #54 ended there.

The fix is a reason class whose claim is true and checkable. An attempt that added only tests, for behavior the registered check already passes, can say so. The factory can verify the two parts of that claim itself: that a CLI-run red passed, and that the attempt's net diff touches nothing but the cited tests.

## What Changes

- `already-satisfied` becomes a sixth `no-red` reason class. It is accepted only when every covered kind has a `vacuous-red` entry on the attempt that was recorded by the CLI against the check's current registered command, and the attempt's net diff since it started touches only the cited test paths (plus factory run state).
- The proposal names `--test-path` entries (existing files or directories; they need not be tracked yet), and records the observed passing runs (log digest, source revision, command digest) and the changed-path check in the method record.
- Attempts record the git revision they started at, so the net diff has a base. An attempt with no start revision cannot use the class.
- Completion re-runs the diff check. If production files changed after the proposal, completion is refused and the attempt must use red-first.
- Vacuous-red entries on an attempt carry the source revision and a digest of the registered command, so the evidence can be matched to the check later.
- The `vacuous-red` blocked report lists the `already-satisfied` proposal as the first option, with the exact flags.
- An explicit `factory.taskType` still blocks the judgment-based reason classes, but not `already-satisfied`, because that class rests on recorded evidence, not on the agent's reading of the task.
- The reviewer packet shows the observed passes and the diff check, and tells the reviewer to confirm the cited tests cover the task's acceptance criteria.

## Capabilities

### Modified Capabilities

- `red-method`: the sixth reason class, its conditions, the net-diff rule, the start revision, visibility, and guidance.
- `verification-evidence`: red failure entries bind to a revision and command.
- `blocked-states`: the vacuous-red report offers the matching method.

## Impact

- `src/lib/red-method.mjs` (class, conditions, diff check), `src/lib/attempt.mjs` (start revision, completion recheck), `src/lib/verification-evidence.mjs` (entry fields), `src/lib/blocked-states.mjs`, `src/lib/orchestrate.mjs` (hint wording), the reviewer packet builder, `src/lib/command-help.mjs`, and the build, test-first, verify, and review guidance with adapter copies.
- `test/red-method.test.mjs`, `test/verification-evidence.test.mjs`, `test/blocked-states.test.mjs`, `test/orchestrate.test.mjs`.
- No new dependencies.

Out of scope:

- Judging whether the tests are good. That stays with the independent method review.
- Changing what a vacuous red means or storing it as a red record. It remains a refusal; the method is the recorded exit.
- Items with no git repository. The class needs a start revision and is unavailable without one.
