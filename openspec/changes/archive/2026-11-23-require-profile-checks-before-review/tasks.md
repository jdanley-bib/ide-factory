# Tasks

## 1. Failing tests

- [x] 1.1 Add failing tests to `test/orchestration.test.mjs` for the union rule: an item that lists only `unit` with profile `frontend-low` is not handed to the reviewer while `build` has no passing record, and the request names `build` and `idefactory verify run`; a direct transition to `awaiting-review` is refused and the attempt file is unchanged; completion fails naming `build`; an item with profile `cli` and a passing `unit` record can be handed off and completed. Verify they fail with `node --test test/orchestration.test.mjs`.
- [x] 1.2 Add a failing test to `test/orchestration.test.mjs` that an item whose `verificationProfile` is not in `.factory/profiles.json` is refused at handoff and at completion with an error that names the profile, and that the factory does not fall back to `unit`. Verify it fails with `node --test test/orchestration.test.mjs`.
- [x] 1.3 Add a failing test that the `cli` entry in `templates/factory/profiles.json` and in `.factory/profiles.json` is exactly `{"checks":["unit"],"humanGate":false}`. The two files already differ on `security-sensitive` `humanGate` (template true, repo false); that difference is out of scope and the test does not check it. Verify it fails with `node --test test/install.test.mjs`.

## 2. Shared required-check module

- [x] 2.1 Create `src/lib/required-checks.mjs` with `requiredChecksFor(project, item)` returning the union of profile and item checks without duplicates, throwing for an unknown profile, and `missingChecks(project, attempt, item)`, moving the per-kind matching out of `assertChecksPassed` in `src/lib/complete.mjs`. Verify with `node --test test/orchestration.test.mjs` that the existing completion tests still pass unchanged.
- [x] 2.2 Point `complete.mjs` at the shared module and map its results to the existing completion messages. Verify with `node --test test/orchestration.test.mjs` and `grep -n "Missing passing check evidence" src/lib/*.mjs` showing the message still exists.

## 3. Enforcement

- [x] 3.1 In `src/lib/attempt.mjs`, refuse `verifying` or `security-checking` to `awaiting-review` while `missingChecks` is non-empty, leaving the attempt unchanged, with an error that names the missing kinds. Verify 1.1's refusal case passes.
- [x] 3.2 In `src/lib/orchestrate.mjs`, route `verifying` with missing checks to the implementer with `nextState` `awaiting-review` and a message naming each missing kind and `idefactory verify run --check <kind>`. Route to security or the reviewer only when nothing is missing. Verify 1.1's handoff case passes.
- [x] 3.3 Make an unknown profile a refusal in the orchestrator stop and in the transition and completion paths. Verify 1.2 passes with `node --test test/orchestration.test.mjs`.

## 4. Profiles and fixtures

- [x] 4.1 Add `cli` with checks `["unit"]` and `humanGate` false to `.factory/profiles.json` and `templates/factory/profiles.json`. Verify 1.3 passes with `node --test test/install.test.mjs`.
- [x] 4.2 Change the `seedChange` fixture in `test/orchestration.test.mjs` to `verificationProfile: cli`, and set `frontend-low` explicitly only in tests that exercise profile-only checks. Verify with `node --test test/orchestration.test.mjs` that every test passes.
- [x] 4.3 Write the migration note for existing installs in `implementation-notes.md`: they add the `cli` entry to `.factory/profiles.json` by hand, because `upgrade` does not rewrite team state. Verify by `grep -n "cli" implementation-notes.md` printing the note.

## 5. Verification

- [x] 5.1 Run `npx openspec validate require-profile-checks-before-review --strict` and confirm it exits 0.
- [x] 5.2 Run `npm test` and confirm every test passes.
- [x] 5.3 Run `node src/cli.mjs doctor` and confirm it reports ok.
