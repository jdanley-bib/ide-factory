# Tasks

## 1. Evidence binding

- [x] 1.1 Add `commandDigest` and `sourceRevision` to red failure diagnostics in `src/lib/verification-evidence.mjs`, with null revision outside git; verify with `test/verification-evidence.test.mjs` asserting both fields on a vacuous entry and a null revision in a non-git directory.
- [x] 1.2 Record `startRevision` in `startAttempt` (HEAD or null) without changing `baseRev`; verify with `test/attempt.test.mjs` asserting the revision in a git project and null otherwise.

## 2. The reason class

- [x] 2.1 Add `already-satisfied` to the closed reason set and refuse it without a vacuous entry per covered kind that matches the registered command digest, naming the kinds missing evidence; verify with tests for no entry, a stale command digest, and one kind of two covered.
- [x] 2.2 Compute the net diff (D3), require at least one existing `--test-path`, and refuse changed paths outside the cited tests with up to ten named; verify with tests for a test-only diff accepted, a production file refused, an untracked cited test accepted, a deleted file outside the paths refused, and an attempt with no start revision refused with a message saying so.
- [x] 2.3 Store `observedPass`, `testPaths`, `startRevision`, and bounded `changedPaths` in the immutable method record; verify with a test that the record holds digests only and that a second proposal is refused.
- [x] 2.4 Lift the explicit task type refusal for this class only and keep every other refusal; verify with tests that an explicit `code` item accepts it, and that a prior method rejection and a stored failing red still refuse it.
- [x] 2.5 Re-run the diff check at the transition to `accepted` and at `complete`; verify with a test where a production file is edited after the proposal and both are refused naming the file.

## 3. Report, packet, and guidance

- [x] 3.1 Add the `propose-already-satisfied` option to the `vacuous-red` report and correct the `propose-method` state text to the states the command accepts; verify with `test/blocked-states.test.mjs` asserting option order, flags, and availability by state.
- [x] 3.2 Show the method hint in `orchestrate` whenever a proposal would be accepted; verify with an orchestrate test for an explicit-class item with a vacuous entry.
- [x] 3.3 Show observed passes, the diff check, cited paths, and the coverage instruction in the reviewer packet and in status and the verdict comment; verify with packet tests asserting those lines and the absence of any claim that a red ran.
- [x] 3.4 Update `method propose` help (flags, class list) and the build, test-first, verify, and review guidance and adapter copies to name six classes and the vacuous-red path; verify with `test/command-help.test.mjs`, regenerated adapters, and the adapter-history checks.
