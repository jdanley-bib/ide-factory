# Tasks

## 1. Review command and build skill

- [x] 1.1 Add failing tests in new `test/review-guidance.test.mjs` that read `templates/commands/factory-review.md`, a fresh `init`'s four generated review commands (`.cursor/commands`, `.claude/commands`, `.github/prompts`, `.cline/workflows`), and the factory-build skill in `templates/skills` and the five skill directories. Each must name the task class, the test kinds that need a red, the lightweight and no-test-check cases, that a red exception is not a red that ran, a different reviewer role, and clean-HEAD verification, and none may contain "Accept only if a failing test was written first" or "Acceptance requires red evidence". Verify they fail with `node --test test/review-guidance.test.mjs`.
- [x] 1.2 Rewrite `templates/commands/factory-review.md` and the two unconditional lines in `templates/skills/factory-build/SKILL.md` with the wording in design.md. Run `node src/cli.mjs upgrade`, check with `git status` that only the generated review commands and factory-build skill copies changed, and verify with `node --test test/review-guidance.test.mjs test/install.test.mjs`.

## 2. Charters

- [x] 2.1 Add a failing test in `test/review-guidance.test.mjs` that a fresh `init` writes an engineer charter that requires a failing test only for a `code` item whose checks include a test kind and a reviewer charter that accepts a valid recorded red exception, and that a second `init` leaves an edited charter byte-identical. Update the two charter templates. Verify with `node --test test/review-guidance.test.mjs test/install.test.mjs`.

## 3. Work packet

- [x] 3.1 Add failing tests in `test/queue.test.mjs` that the packet states `Task class` and `Red required for` for a `code` item with checks `unit` and `build` (red required for `unit`), a `lightweight` item with `unit` (none), and a `code` item with only `build` (none), and that the implementer-only method line is conditional. Implement the lines in `src/lib/queue.mjs` from `taskType` and `requiredTestKinds`. Verify with `node --test test/queue.test.mjs`.

## 4. Run request

- [x] 4.1 Add failing tests in `test/orchestration.test.mjs` that the implementing-stage request for a `code` attempt whose checks are `build` says a failing test is not required and names `verifying` as the next state, and that a `code` attempt with `unit` and no red or exception still asks for a red with next state `red-confirmed`. Change `stageForState` in `src/lib/orchestrate.mjs`. Verify with `node --test test/orchestration.test.mjs test/run-session.test.mjs test/red-exceptions.test.mjs`.

## 5. Integration

- [x] 5.1 Run `npx openspec validate align-review-guidance-with-red-requirements --strict`, `npm test`, and `node src/cli.mjs doctor`. Add a test that a recorded waiver on a `code` attempt appears in the reviewer packet next to `Red required for`, and that the review command in a fresh `init` tells the reviewer to accept it. Record the results in `implementation-notes.md` in the change directory. Verify with `node --test test/review-guidance.test.mjs`.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
