# Tasks

## 1. Reopen

- [x] 1.1 Add `src/lib/attempt-reopen.mjs` and the `attempt reopen` command, moving an `accepted` attempt to `awaiting-review` in one atomic attempt-file write and recording `evidence.reopens` and `evidence.reviewHistory` (original verdict, reviewer, notes, time, digest); verify with tests that the original verdict is readable afterwards, that `evidence.reds`, verification, and exception records are byte-identical, and that the attempt needs a new verdict to be accepted again.
- [x] 1.2 Refuse a reopen when the state is not `accepted`, a named kind is already satisfied, the identity equals the implementer, the reopen count is two, a finalization journal exists, or the state is `finalize-failed` or `finalized`; verify with one test per refusal asserting the message names the cause and the attempt file is byte-identical.
- [x] 1.3 Apply the authority rules (`--for method`: reviewer identity rule under policy version 2; `--for exception`: exception approver rules with a verified principal); verify with tests under policy versions 1 and 2, including an unverified approver refused for `--for exception`.
- [x] 1.4 Keep `attempt transition` refusing `accepted` to `awaiting-review`; verify with a test that supplies matching evidence and still gets the illegal-transition error.

## 2. Amendment window

- [x] 2.1 Replace `requireBeforeVerifying` with an amendable check that passes the pre-verifying states, and passes `awaiting-review` only for kinds named by the open reopen, in `src/lib/red-exceptions.mjs`; verify with tests that waive and reuse succeed for a reopened kind, are refused for another kind, and are refused again after the attempt returns to `accepted`.
- [x] 2.2 Treat a reopened kind as stuck for the waiver warning; verify with a test that `red waive` on a reopened kind needs no `--acknowledge-not-stuck` and records `acknowledgedNotStuck: false`, and that a non-reopened attempt still gets the warning.
- [x] 2.3 Let `method propose` accept a reopened kind (after `red-method-selection` lands); verify with a test that a method proposal for a reopened kind is recorded, a method review ACCEPT is recorded, and the attempt can be accepted again and completed with no red.
- [x] 2.4 Refuse an exception on an `accepted` attempt that was not reopened with an error naming `idefactory attempt reopen`; verify with a test that asserts the message and no file written.

## 3. Visibility and orchestration

- [x] 3.1 Show reopens and the prior verdict in status, the reviewer packet, the review run request, and the pull request verdict comment in `src/lib/queue.mjs`, `src/lib/orchestrate.mjs`, and `src/lib/pull-request.mjs`; verify with tests that each contains the reopen reason, kinds, and earlier reviewer.
- [x] 3.2 Name `idefactory attempt reopen` in the missing-red error from `src/lib/complete.mjs` when the attempt is `accepted`; verify with a test that completes an accepted attempt with a missing red and asserts the message.
- [x] 3.3 Append `attempt.reopened` to the control event log; verify with an event-log test.

## 4. Help and guidance

- [x] 4.1 Add `attempt reopen` to `src/lib/command-help.mjs` and note it in the lifecycle help without changing the pinned global usage text; verify with `node src/cli.mjs help attempt reopen --json` and with `node --test test/command-help.test.mjs` passing.
- [x] 4.2 Update `templates/skills/factory-governance/SKILL.md`, `factory-build`, `factory-verify`, `templates/factory/governance.md` (rule 12), and `README.md` to describe reopen, its two purposes, its bound, and that it is not a substitute for review, then copy to adapter paths and run `node scripts/build-adapter-history.mjs`; verify with `node --test test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/help-guidance.test.mjs test/readme-adapters.test.mjs` all passing.

## 5. Integration

- [x] 5.1 Add an end-to-end test that reproduces the issue: a profile adds `contract`, genuine `unit` and `integration` reds exist, the attempt is reviewed and accepted, completion fails on `contract`, reopen for an exception succeeds with a different approver, waive records the exception, a new reviewer verdict is recorded, and completion succeeds with the original review visible in history; verify the test passes.
- [x] 5.2 Run `npm test` and `npx openspec validate accepted-attempt-evidence-recovery --strict`; verify both exit zero.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
