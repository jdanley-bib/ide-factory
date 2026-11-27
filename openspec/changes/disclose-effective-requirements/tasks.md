# Tasks

## 1. Resolver

- [x] 1.1 Add `resolveRequirements` in `src/lib/required-checks.mjs` returning checks with sources, red kinds, human decisions, dependencies, and problems, and make `requiredChecksFor` a projection of it; verify with unit tests for an item-only check, a profile-only check, a check in both, an undefined profile (a problem, no throw), an unmapped kind, a gate with policy version 2 and no verifier, and a missing dependency.
- [x] 1.2 Add a drift test that fails when any module under `src/lib` passes `item.factory.checks` or `item?.factory?.checks` directly to `requiredTestKinds`; verify the test fails on the current tree and passes after tasks 2.1 to 2.4.

## 2. Consumers read the one set

- [x] 2.1 Make the packet in `src/lib/queue.mjs` list every required check with its source and derive `Red required for` from the full set; verify with packet tests for the four scenarios in the `guided-build` delta, including a profile that adds `contract` to an item that lists only `unit`.
- [x] 2.2 Make the gate into `verifying` in `src/lib/attempt.mjs` and both run-request sites in `src/lib/orchestrate.mjs` use the resolved red kinds; verify with tests that an attempt missing a profile-derived red is refused at `verifying` naming the kind, and that the run request asks for that red with `idefactory verify run --red`.
- [x] 2.3 Make red-exception eligibility in `src/lib/red-exceptions.mjs` use the resolved red kinds; verify with tests that `red waive --kind contract` succeeds before verifying when only the profile requires `contract`, and refuses a kind outside the set recording nothing.
- [x] 2.4 Make the reviewer and security packets, `idefactory status`, and `verify status` show the same set; verify with tests that each names the profile-derived kind and its red state.

## 3. Preflight

- [x] 3.1 Refuse `startAttempt` when the resolved set has problems, naming each invariant and where to fix it, and print the same problems as warnings from `sync-tasks`; verify with tests that an undefined profile, an unmapped kind, and an unsatisfiable gate each create no attempt and leave the item `todo`, and that a valid set starts as before.
- [x] 3.2 Make `run` surface the preflight problems as its stop text; verify with a test that `idefactory run` for an item with an unmapped required kind stops without creating an attempt and names the kind and the registry.

## 4. Completion and handoff reporting

- [x] 4.1 Report every unmet required check and missing red together in completion (`src/lib/complete.mjs`) and the review handoff; verify with tests for two missing checks, and for a missing check plus a missing red, each asserting all names appear in one error and the work item stays unfinished.

## 5. Command, help, and guidance

- [x] 5.1 Add `idefactory requirements <change> <task> [--json]` with help; verify with CLI tests that stdout is one JSON document with `schemaVersion` 1, that nothing is written (directory digest unchanged), and that `node src/cli.mjs help requirements` and `help requirements --json` describe the fields and the read-only effect, with the drift tests in `test/command-help.test.mjs` passing.
- [x] 5.2 Update the `verifying` precondition text in `src/lib/command-help.mjs`, and `templates/skills/factory-build/SKILL.md`, `factory-run`, `factory-verify`, and `README.md` to name the single set and the `requirements` command, then copy to adapter paths and run `node scripts/build-adapter-history.mjs`; verify with `node --test test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/help-guidance.test.mjs test/readme-adapters.test.mjs` all passing.

## 6. Integration

- [x] 6.1 Add an end-to-end test in which a profile adds `contract` to a `unit`-only item, and assert that the packet discloses it before implementation, that skipping its red is refused at `verifying`, and that the attempt can be completed once both reds exist; verify the test passes.
- [x] 6.2 Run `npm test` and `npx openspec validate disclose-effective-requirements --strict`; verify both exit zero.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
