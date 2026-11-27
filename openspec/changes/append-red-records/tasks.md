# Tasks

## 1. Append-only storage

- [x] 1.1 Add `evidence.redHistory[kind]` in `src/lib/verification-evidence.mjs` and `src/lib/red-evidence.mjs`, appended in the same attempt-file write that updates `evidence.reds[kind]`, with lazy seeding for attempts that have only `reds[kind]`; verify with tests that a second `--red` for `unit` keeps both records in order, leaves the first byte-identical, makes the second the current red, and that an attempt with only `reds` reads as a one-entry history.
- [x] 1.2 Add a history reader that returns each entry with its canonical-JSON digest; verify with a test that the digest of a seeded entry equals the digest `red waive --invalid-red` recorded for the same red before the change.

## 2. Red after invalidation

- [x] 2.1 Allow `verify run --red` for a kind whose exception is an invalid-red waiver and keep refusing it for reuse and ordinary waivers; verify with tests for all three cases, the refusal cases storing no red and spawning no check process.
- [x] 2.2 Update `redSatisfaction` in `src/lib/red-exceptions.mjs` per the later-red rule (`waiver` while unchanged, `cli` for a later failing CLI red that started after the waiver with the digest still in history, otherwise `missing`); verify with tests for each outcome, including a red started before the waiver, a history missing the invalidated digest, and a tampered entry.
- [x] 2.3 Confirm a second invalidation for the same kind is refused with a message naming the existing exception; verify with a test that records nothing and leaves the attempt file byte-identical.

## 3. Listing and display

- [x] 3.1 Add `idefactory red list <attemptId> [--json]` joining history, digests, exception references, current marker, and satisfier per kind; verify with tests of the text and JSON output for an invalidated red plus a later red, and that the project directory digest is unchanged after the command.
- [x] 3.2 Update `describeException` and `listAttemptExceptions` so status, the reviewer packet, and the pull request verdict comment show both records and the limitation sentence; verify with tests that each surface names both digests, the reason, and the approver, and that ordinary exceptions print unchanged.

## 4. Help and guidance

- [x] 4.1 Add `red list` to `src/lib/command-help.mjs` and update the `red waive` and `verify run` notes without changing the pinned global usage text; verify with `node src/cli.mjs help red list --json` and `node --test test/command-help.test.mjs` passing.
- [x] 4.2 Update `templates/skills/factory-build/SKILL.md`, `factory-tdd`, `factory-verify`, `templates/factory/governance.md`, and `README.md` to say that reds are append-only, that one later red is allowed after an invalidation, and that it does not prove write order, then copy to adapter paths and run `node scripts/build-adapter-history.mjs`; verify with `node --test test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/help-guidance.test.mjs test/readme-adapters.test.mjs` all passing.

## 5. Integration

- [x] 5.1 Add an end-to-end test: record a failing red with `verify run --red`, invalidate it, record a later failing red, and assert the gate into `verifying` passes through the CLI red, `red list` shows both with a verifiable waiver reference, the invalidated record is byte-identical, a second invalidation is refused, and completion succeeds; verify the test passes.
- [x] 5.2 Run `npm test` and `npx openspec validate append-red-records --strict`; verify both exit zero.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
