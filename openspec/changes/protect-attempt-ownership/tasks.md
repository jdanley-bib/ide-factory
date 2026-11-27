# Tasks

## 1. Start guard and history

- [ ] 1.1 Add an `attemptEvidence` summary helper and make `startAttempt` refuse a live attempt with evidence through `BlockedError` with invariant `attempt-active`, writing nothing; verify with `test/attempt-ownership.test.mjs` asserting a refusal for each evidence type (red, verification, method, exception, review) and no change to the work item file.
- [ ] 1.2 Return the current attempt with `reused: true` when it is live and empty, creating no file; verify with a test that a second `attempt start` returns the same id, leaves the attempts directory unchanged, and leaves the work item byte-identical.
- [ ] 1.3 Append `attemptHistory` entries on every pointer change, including the first start and a start after rejection or abandon; verify with tests for `first`, `after-rejection`, and `after-abandon` entries and for history surviving completion.
- [ ] 1.4 Add the `attempt-active` row to the blocked-state table with the option to continue the named attempt; verify with `test/blocked-states.test.mjs` asserting the invariant code, the actor, and that the report names the attempt id.

## 2. Repair command

- [ ] 2.1 Add `attempt repoint` preview that prints current and target attempts, evidence summaries, and a plan digest, and writes nothing; verify with a test that the preview leaves `.factory/` byte-identical.
- [ ] 2.2 Add apply with `--plan-digest`, `--decided-by`, and `--reason`, writing only the pointer, the history entry, and a record under `.factory/work/repairs/`; verify with tests that no attempt file changes, that a stale digest is refused, and that a missing flag writes nothing.
- [ ] 2.3 Enforce the identity rule (different from the displaced implementer when the displaced attempt has evidence; policy version 2 principal check) and the target rules (same change and task, not current, not rejected or abandoned); verify with one test per refusal.
- [ ] 2.4 Refuse repair while HALT is set and treat `attempt repoint` as a mutating command under the writer lease; verify with a HALT test and `test/writer-lease.test.mjs` covering the new command.

## 3. Orphans

- [ ] 3.1 Detect orphan attempt files for a work item and print a notice from `run` and `status` that names the id and the repair command without stopping the run; verify with tests that an orphan produces the notice, a repaired orphan does not, and `run` still proceeds.

## 4. Events, help, and guidance

- [ ] 4.1 Emit `attempt.repointed` events with ids only and add `previousAttemptId` to the allowlist; verify with `test/event-log.test.mjs` asserting the reason text is absent from the event and the record file.
- [ ] 4.2 Register help for `attempt repoint` and update the `attempt start` help, leaving the global usage text unchanged; verify with `test/command-help.test.mjs` including the pinned global digest.
- [ ] 4.3 Update the `factory-build` skill and its adapter copies so an agent continues the named attempt on `attempt-active` and uses `attempt repoint` only when the pointer is wrong; verify by regenerating adapters and running `test/adapters.test.mjs` and the adapter-history checks.
