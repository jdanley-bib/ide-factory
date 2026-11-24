# Tasks

## 1. Failing tests

- [x] 1.1 Add failing tests to `test/orchestration.test.mjs` for each scenario in the `guided-build` delta: the nested `review` form is refused with an error that names `review` and points to `notes`, and the attempt file bytes are unchanged; the documented top-level `notes` form is accepted and `evidence.review.notes` equals the text; misspelled `note` is refused; `notes` as an object and `changedFiles` as a non-array are refused; a reviewer rejection with `verdict: "ACCEPT"` is refused; a rejection with no verdict is accepted. Verify they fail with `node --test test/orchestration.test.mjs`.
- [x] 1.2 Add a failing test to `test/evidence-file.test.mjs` that pins the supported evidence keys to exactly `reviewerId`, `implementerId`, `securityReviewerId`, `verdict`, `notes`, `changedFiles`, and `baseRev`, and that checks the type rule for each. Verify it fails with `node --test test/evidence-file.test.mjs`.
- [x] 1.3 Add a test that internal transitions still work: `idefactory attempt start` reaches `assigned` (the internal `assignedRole` key is not refused; it is not stored today, and this change does not store it), and a direct `transitionAttempt` to `finalize-failed` with an `error` key is not refused. Verify it passes before any implementation, so it guards the change.

## 2. Implementation

- [x] 2.1 In `src/lib/attempt.mjs`, add the supported-key constant and type rules, and a `supplied` option to `transitionAttempt`. When `supplied` is true, run the new check after `rejectCallerSuppliedCheckResults` and before `validateEvidence`, and make it throw with the message forms in design.md. Verify 1.1 and 1.2 pass with `node --test test/orchestration.test.mjs test/evidence-file.test.mjs`.
- [x] 2.2 In `src/lib/run.mjs`, pass `supplied: true` from the `transition` branch. Verify by running `idefactory attempt transition` against a temporary project with the nested `review` payload and confirming a non-zero exit and an unchanged `.factory/attempts/<id>.json`.
- [x] 2.3 Run `node --test test/orchestration.test.mjs test/red-exceptions.test.mjs test/queue.test.mjs` and confirm the internal-transition test from 1.3 still passes and no existing test changed expectation.

## 3. Documentation

- [x] 3.1 Update the "Transition evidence" section of `README.md` to list the supported keys, state that other keys and wrong types fail before any write, and give the top-level `notes` form. Verify by adding an assertion in `test/evidence-file.test.mjs` that the README names each supported key and the word `notes`, then running that file.

## 4. Verification

- [x] 4.1 Run `npx openspec validate reject-unknown-transition-evidence --strict` and confirm it exits 0.
- [x] 4.2 Run `npm test` and confirm every test passes.
- [x] 4.3 Run `node src/cli.mjs doctor` and confirm it reports ok.
