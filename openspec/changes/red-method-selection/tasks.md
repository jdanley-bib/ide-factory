# Tasks

## 1. Class marker and method record

- [x] 1.1 Add `taskTypeSource` (`explicit` or `inferred`) to the result of `classifyTask` in `src/lib/classify.mjs` and keep it through sync; verify with tests that a task with `factory.taskType: code` is `explicit`, that a docs task with no `taskType` is `inferred`, that an item stored without the field is read as explicit, and that existing queue tests still pass.
- [x] 1.2 Add `src/lib/red-method.mjs` writing an immutable `.factory/methods/<id>.json` with `wx` and binding it to the attempt by digest under `evidence.method`, plus a reader that returns null for a missing or altered file; verify with tests for the record fields (proposer, reason class, covered kinds, rationale, source revision, changed-file count, schema version), for a second proposal on the same attempt being refused, and for an edited file reading as null.
- [x] 1.3 Add `.factory/methods/` to the factory run-state prefixes in `src/lib/verification-evidence.mjs` so recording a method does not dirty the source revision; verify with a test that writes a method record and then passes `recordValidity` and an approval check at the same HEAD without committing, and a test that a product-file change still makes them stale.

## 2. Propose

- [x] 2.1 Add `idefactory method propose <attemptId> --choice no-red --reason <class> --rationale <text> --implementer <id> --kind <kind>... [--test-path <path>...]` with the state window, the closed reason classes, and the `behavior-preserving` tracked-test rule; verify with tests for a valid proposal, an unknown class, a late proposal in `verifying`, a `behavior-preserving` proposal with no path, a missing file, and an untracked file, each refused case recording nothing and leaving the attempt file byte-identical.
- [x] 2.2 Refuse a proposal for an explicit class, for a covered kind with a stored failing red or an exception, for a kind outside the required set, for a lightweight item, and for an item whose earlier attempt has a `REJECT` method review; verify with one test per refusal naming the cause and writing nothing.

## 3. Gates

- [x] 3.1 Add the `method` source to `redSatisfaction` in `src/lib/red-exceptions.mjs`, valid only for covered kinds while the record digest matches; verify with tests for covered, uncovered, altered-file, and mixed cases (red for one kind, method for another), and extend the drift test so no module outside `redSatisfaction` reads `evidence.method`.
- [x] 3.2 Let the gate into `verifying` and the run request accept a covered kind; verify with a test that an attempt with a recorded method for its only test kind enters `verifying` with no red, and that the run request names `verifying` as the next state.
- [x] 3.3 Require, in the `accepted` precondition in `src/lib/attempt.mjs` and again in `src/lib/complete.mjs`, an `ACCEPT` method review from a reviewer different from the implementer whenever a `no-red` method exists; verify with tests that `accepted` is refused with no review, with a same-role review, and with a `REJECT` review, and that completion repeats the check against an attempt edited to skip the review.

## 4. Review

- [x] 4.1 Add `idefactory method review <attemptId> --verdict ACCEPT|REJECT --reviewer <id> --note <text>` writing an immutable record bound under `evidence.methodReview` and naming the method digest; verify with tests for ACCEPT, REJECT, a same-role reviewer refused, a reviewer under policy version 2 who is not a verified principal refused, and a review of an attempt with no method refused.
- [x] 4.2 After a `REJECT` review, make the next attempt for the item start with `red-first` and refuse a new proposal; verify with a test that rejects an attempt through the CLI, starts a second attempt, and asserts the proposal is refused and the red gate applies.

## 5. Display and guidance

- [x] 5.1 Show the method, reason class, rationale, covered kinds, revision, changed-file count, and review in the work packet, run request, reviewer and security packets, `idefactory status`, and the pull request verdict comment in `src/lib/queue.mjs`, `src/lib/orchestrate.mjs`, and `src/lib/pull-request.mjs`; verify with tests that each surface contains the method text and none contains "No red ran" or "exception" for a covered kind, and that ordinary exceptions still print as before.
- [x] 5.2 Add `method propose`, `method review`, and `method show` to `src/lib/command-help.mjs` without changing the pinned global usage text; verify with `node src/cli.mjs help method propose` and `help method review --json`, and with the drift tests in `test/command-help.test.mjs` passing.
- [x] 5.3 Update `templates/skills/factory-build/SKILL.md`, `factory-tdd`, `factory-verify`, the engineer and reviewer charters, the review command template, `templates/factory/governance.md`, and `README.md` to describe the default, the five reason classes, the explicit-class rule, and the reviewer's duty, then copy to adapter paths and run `node scripts/build-adapter-history.mjs`; verify with `node --test test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/help-guidance.test.mjs test/review-guidance.test.mjs test/readme-adapters.test.mjs` all passing.
- [x] 5.4 Add `method.proposed` and `method.reviewed` to the control event log in `src/lib/event-log.mjs`; verify with a test that both events are appended with attempt, change, and task and that the event log tests still pass.

## 6. Integration

- [x] 6.1 Add an end-to-end test that runs a `code` item with an inferred class through propose, implement, verify, method review ACCEPT, accept, and complete without any red and without any human approval record, and a second test where the reviewer rejects the method, the attempt is rejected, and the retry attempt needs a red; verify both pass.
- [x] 6.2 Run `npm test` and `npx openspec validate red-method-selection --strict`; verify both exit zero.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
