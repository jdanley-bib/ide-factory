# Tasks

## 1. Install and shared state

- [x] 1.1 Add the idefactory CLI, GOLDEN_RULES.md, and init that writes `.factory` team state. Verify a temporary project gains `team.md`, `decisions.md`, `config.json`, and the five default roles.
- [x] 1.2 Preserve decisions and histories on a second init, leave `.squad/` untouched, and merge a marked section into an existing AGENTS.md without dropping its original text. Verify with tests.

## 2. IDE adapters

- [x] 2.1 Install Cursor, Copilot, and Claude commands for status, plan, build, and review, plus the Cursor rule, Copilot agent, and factory-coordinator skill in each IDE tree. Verify the three `factory-build` command paths exist and name the factory-build skill.
- [x] 2.2 Add factory-build, factory-tdd, and factory-verify skills that require a failing test, a verification step, a different reviewer, and that do not instruct Ollama or web ideation. Verify by scanning the installed skill text.

## 3. Queue and guidance

- [x] 3.1 Implement sync-tasks so each unchecked OpenSpec checkbox becomes one labeled Backlog.md task, checked boxes are skipped, and a second run does not duplicate. Verify with a fake backlog binary. Confirm `.factory/` has no `backlog.md`.
- [x] 3.2 Implement next so it prints one engineer packet with only that charter path, and so HALT makes next and sync-tasks exit with an error and no packet. Verify a fake model binary on PATH is not executed.
- [x] 3.3 Implement status, doctor, approve, reject, lockout, and upgrade. Verify doctor fails in an empty directory and passes after init, two approvals both remain in decisions.md, and upgrade does not remove a custom decision.

## 4. Documentation

- [x] 4.1 Replace the README with what this factory is and how to add it to a new or existing project. Verify the README documents `idefactory init` and states that the IDE's own model does the work.

## Workflow follow-up

- Archive the change after the tasks are checked and the draft pull request is open.
