# Tasks

## 1. Generated block

- [ ] 1.1 Add `scripts/build-guidance.mjs` that renders the `## Blocked states and authority` block from `AUTHORITY` and the blocked table, writes it into each template carrying the heading, and supports `--check`; verify with `test/guidance-block.test.mjs` asserting the check passes on a clean tree and fails after a table entry changes without a regenerate.
- [ ] 1.2 Add the block to the three rules and the `factory-run`, `factory-coordinator`, `factory-governance`, and `factory-openspec` templates, then regenerate adapters with `node src/cli.mjs upgrade` and `node scripts/build-adapter-history.mjs`; verify with the drift test extended to both blocks, `test/adapter-history.test.mjs`, and `test/adapters-apply.test.mjs`.
- [ ] 1.3 Generalize the extraction helper in the guidance tests to take a heading, so both blocks use it; verify that the routine-steps tests still pass and that a deliberately edited copy fails naming that file.

## 2. Stale guidance

- [ ] 2.1 Rewrite the `--new-run` and `vacuous-red` sentences in the routine-steps block and the `factory-run` skill per design D3 in every copy; verify with `test/routine-steps-guidance.test.mjs` updated to the new wording and with a test that no shipped copy contains "Only a human passes `--new-run`" or "Only the human may add that flag".
- [ ] 2.2 Rewrite `vacuous-red` handling in `factory-tdd`, `factory-verify`, and `factory-build` to the ordered agent options, naming `--invalid-red` and `red invalidate` correctly; verify with `test/help-guidance.test.mjs` and `test/review-guidance.test.mjs` updated, and a test that each of the three skills names `method propose` and `already-satisfied` before `red waive`.
- [ ] 2.3 Update the README stop-rule prose to the three classes and the authority table; verify with `test/readme-adapters.test.mjs` and a README assertion naming the three classes.

## 3. Phrase allowlist

- [ ] 3.1 Add the human-phrase scan, the allowlist fixture, and the gate check against the authority table; verify with a test that an unlisted phrase fails, a listed phrase with a non-human gate fails, and every current hit is either rewritten or listed with a valid gate or reserved reason.

## 4. Option conformance

- [ ] 4.1 Add `test/blocked-options.test.mjs` driving each state-bound blocked option in an allowed and a disallowed attempt state; verify that it fails against the current `propose-method` state list and passes after the table is corrected.
- [ ] 4.2 Correct the state lists in `BLOCKED_TABLE` found by 4.1 (`propose-method`, and any others the test reports); verify with the test passing and `test/blocked-states.test.mjs` updated.
