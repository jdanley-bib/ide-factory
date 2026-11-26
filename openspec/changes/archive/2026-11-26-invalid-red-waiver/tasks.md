# Tasks

## 1. Invalidation record

- [x] 1.1 Add `invalidRed` to `waiveRed` in `src/lib/red-exceptions.mjs` and the `--invalid-red` flag to the `red waive` dispatch in `src/lib/run.mjs`; verify in `test/red-exceptions.test.mjs` that a waiver with `invalidRed` on a stored failing red writes `noRedExists: false`, `invalidRed.redDigest` equal to the digest of the stored red, and leaves `evidence.reds` byte-identical.
- [x] 1.2 Refuse `--invalid-red` for a kind with no failing CLI red, and refuse it without `--acknowledge-not-stuck`; verify with tests that each refusal names the kind or flag, writes no exception file, and leaves the attempt file unchanged.
- [x] 1.3 Refuse a bare `--invalid-red` with no value, naming the flag; verify with a CLI test that exits non-zero and writes nothing.

## 2. Refusal over a real red

- [x] 2.1 Make `waiveRed` refuse a kind with a stored failing CLI red unless `invalidRed` is given, naming that red and `--invalid-red`; verify with a test that waives over `writeCliRed` and asserts non-zero exit, no exception file, and unchanged attempt bytes.
- [x] 2.2 Keep the existing waive tests passing, including those that waive attempts with no red; verify by running `node --test test/red-exceptions.test.mjs` and confirming zero failures.

## 3. Satisfaction and replacement

- [x] 3.1 Make `redSatisfaction` return `waiver` for an invalidated red whose stored digest matches `invalidRed.redDigest` and `missing` otherwise, checked before the CLI red; verify with tests for the unchanged red (`waiver`) and for a red edited after the waiver (`missing`, and the transition into `verifying` is rejected).
- [x] 3.2 Refuse `verify run --red` for a kind that already has an exception, before the check runs; verify with a registry check whose argv writes a marker file, asserting that the command refuses, the marker is absent, and no red is stored.

## 4. Reuse

- [x] 4.1 Make `reuseRed` require `redSatisfaction(source, kind) === 'cli'` for each kind; verify with a test that reuse from a replacement fails and records nothing when the source red was invalidated, and that the existing reuse tests still pass.

## 5. Display

- [x] 5.1 Make `listAttemptExceptions` report `noRedRan: false` with `invalidRedDigest` and `invalidRedReason` for invalidated reds, and change `describeException` to say the red does not satisfy red; verify with a test that `idefactory status` and the reviewer packet for an invalidated red name the digest and reason and do not contain "No red ran", and that ordinary waivers still say "No red ran".

## 6. Help and guidance

- [x] 6.1 Add `--invalid-red` to the `red waive` help entry's flags and notes in `src/lib/command-help.mjs`, and to the `red waive` error usage in `src/lib/run.mjs`, with a note that a post-implementation red is invalidated and not genuine; leave the `red waive` usage line and the global help unchanged, because the global help is digest-pinned and the cli-help spec keeps it unchanged; verify with `node src/cli.mjs help red waive` that the flag and notes appear and that the drift tests in `test/command-help.test.mjs` pass.
- [x] 6.2 Update `templates/skills/factory-build/SKILL.md`, `templates/skills/factory-tdd/SKILL.md`, `templates/skills/factory-verify/SKILL.md`, `templates/factory/governance.md`, and the red section of `README.md` (no shipped reviewer charter discusses red waivers, so none changes); copy each shipped skill to its adapter paths as in the lockout change and run `node scripts/build-adapter-history.mjs`; verify with `node --test test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/help-guidance.test.mjs test/readme-adapters.test.mjs` that all pass.

## 7. Integration

- [x] 7.1 Add an end-to-end test in `test/red-exceptions.test.mjs` that records a real failing red with `verify run --red` for a check whose argv exits 1, waives it with `--invalid-red` through the CLI, then shows that a second `verify run --red` for the same kind is refused, the status shows the digest and reason, and the transition into `verifying` is accepted only while the stored red is unchanged; verify the test passes.
- [x] 7.2 Run `npm test` and `openspec validate invalid-red-waiver --strict`; verify both exit zero.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
