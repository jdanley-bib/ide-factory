# Tasks

## 1. Shared block

- [x] 1.1 Write the shared block under the heading `## Routine steps and external effects` into `templates/cursor/rules/factory.mdc`, `templates/cline/rules/factory.md`, `templates/copilot/factory.agent.md`, and the `factory-run`, `factory-coordinator`, `factory-governance`, and `factory-openspec` skill templates, removing the old wait sentence in each; verify with `rg "run only after the human asks" templates` returning nothing.
- [x] 1.2 Keep the `pr open`, `pr comment`, `pr capture`, and never-merge text in the rule and the run skill unchanged; verify with the assertions in `test/pr-guidance.test.mjs` for those lines passing.
- [x] 1.3 Keep the archive paragraph and the `isDeliverableChange` instruction in the coordinator and openspec skills, and keep the `--new-run` wording in the run skill; verify by reading each template against the `Separate requests remain` requirement.

## 2. Tests

- [x] 2.1 Replace the pinned `HUMAN_GATE` sentence in `test/pr-guidance.test.mjs` with assertions for the new block in the installed rule and run skill (covered steps, separate requests, enforced gates, the `authorize` rule); verify the test passes after `init`.
- [x] 2.2 Add a drift test that extracts the block from every copy in `templates` and in `.cursor`, `.cline`, `.github`, `.agents`, and `.claude` and fails naming a file whose text differs; verify by editing one copy in a temporary fixture and watching the test fail.
- [x] 2.3 Add a test that the installed factory-run skill and rule do not tell the agent to wait before `sync-tasks`, `verify`, or `complete`, and that the governance skill says the agent does not run `approve` for itself; verify the test passes.

## 3. Adapters and upgrade

- [x] 3.1 Copy the templates to the adapter paths and run `node scripts/build-adapter-history.mjs`; verify with `node --test test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/adapters-apply.test.mjs test/adapters-plan.test.mjs`.
- [x] 3.2 Add an upgrade test with an unmodified file from the legacy-release fixture and an edited one; verify the unmodified file takes the new text and the edited one is preserved and reported.

## 4. Documentation

- [x] 4.1 Update `README.md` where it describes the human gate for routine commands to match the block, and check `templates/commands/factory-run.md` and `factory-full.md` for text that tells the agent to wait; verify with `node --test test/readme-adapters.test.mjs test/help-guidance.test.mjs`.

## 5. Integration

- [x] 5.1 Confirm `align-approval-actions` has landed (the `authorize` command exists), then run `npm test` and `npx openspec validate cover-routine-steps-on-request --strict`; verify both exit zero.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
