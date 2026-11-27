# Tasks

## 1. Safe automatic cases

- [ ] 1.1 Classify each stored item and current task as exact, reword, renumber, addition, or pre-checked in `src/lib/queue.mjs`, and make addition-only and pre-checked-only edits apply automatically; verify with tests that appending a task to a synced change creates one item and leaves the others byte-identical, that a pre-checked task without an item is ignored, and that an addition together with a reword changes nothing and reports.
- [ ] 1.2 Stop `applyTitleUpdates` from rewriting classification, dependencies, and acceptance criteria for an item with an attempt, keeping title and provenance updates and a `titleHistory` entry; verify with the reproduction from the proposal (an in-progress `code` item with `unit` checks reworded with a new `factory` block) asserting that class, checks, and dependencies are unchanged and that drift is reported.
- [ ] 1.3 Make `applyRenumbers` write the new item files before removing the old ones; verify with a test that injects a failure after the first write and finds every item still present on disk, and that a repeat sync completes the renumber.

## 2. Held items

- [ ] 2.1 Add an `isHeld` helper and the `hold` marker (stored as `blocked` with `hold.kind`, `previousStatus`, `decisionRecord`, and optional `supersededBy`) in `src/lib/work.mjs`; verify with unit tests that held items are not ready, not selected across changes, and round-trip through `upsertWorkItem`.
- [ ] 2.2 Make `orchestrate` and `next` skip held items, including the in-progress lookup, and report held work as the cause when no ready item exists; verify with a test where a deferred in-progress item is skipped, other ready work is selected, and the deferred item's attempt file is byte-identical.
- [ ] 2.3 Make `complete` refuse a held item naming the hold; verify with a test that completes an accepted attempt whose item is dropped and asserts the error and that the item stays unfinished.

## 3. Plan

- [ ] 3.1 Add `sync-tasks --plan [--json]` producing automatic actions, unmatched items and tasks, in-flight items with attempt state, drift with old and new requirement sets, dependents of items that would be held, overlapping active changes, and a plan digest; verify with tests of the text and JSON output for removed, split, merged, reworded, and renumbered cases, and that the directory digest is unchanged after the command.
- [ ] 3.2 Report overlapping capability deltas across active changes with unfinished work in the plan; verify with a fixture of two changes that touch the same capability and a third that does not.

## 4. Decisions and apply

- [ ] 4.1 Add `sync-tasks --apply --decisions-file --plan-digest --decided-by` with the decision vocabulary (`keep`, `renumber`, `defer`, `resume`, `drop`, `split`, `merge`, `move`, `adopt-classification`, `keep-classification`, and the `dependents` setting); verify with tests for each decision, for a missing decision, for a conflicting file, and for a stale digest, each refusal leaving `.factory/work/` byte-identical.
- [ ] 4.2 Enforce the independence rule and the policy version 2 verified-principal rule for `adopt-classification`, `drop`, `merge`, and `move` on items with an attempt past `planned`; verify with tests that an implementer identity is refused and an independent identity is applied.
- [ ] 4.3 Write the immutable record under `.factory/work/reconciliations/` with plan digest, decisions, identity, time, and before and after item digests, make a repeat apply idempotent, and append a `tasks.reconciled` control event; verify with tests for the record content, a crash after the record is written (the repeat finishes the work), and the event.
- [ ] 4.4 Support `move` by recording `supersededBy` and requiring the target task to exist in the other change's `tasks.md`; verify with a test that moves an item to a second change, that the stale entry no longer appears in selection, and that a missing target task is refused.

## 5. Help and guidance

- [ ] 5.1 Document `--plan`, `--apply`, the decisions file, and each decision in the `sync-tasks` help entry without changing the pinned global usage text; verify with `node src/cli.mjs help sync-tasks --json` and `node --test test/command-help.test.mjs` passing.
- [ ] 5.2 Update `templates/skills/factory-openspec/SKILL.md`, `factory-coordinator`, `factory-run`, and `README.md` to run `sync-tasks --plan` after a reconciliation error and to stop recommending a separate change as a workaround, then copy to adapter paths and run `node scripts/build-adapter-history.mjs`; verify with `node --test test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/help-guidance.test.mjs test/readme-adapters.test.mjs` all passing.

## 6. Integration

- [ ] 6.1 Add an end-to-end test that reproduces the issue: sync a change, start an attempt for one task, then remove it, add a replacement, and defer another; assert that plain sync fails with a report naming `--plan`, that the plan shows the in-flight item and its dependents, that apply with an independent identity records the decisions, that `run` selects only ready current work, and that the original attempt and evidence are byte-identical; verify the test passes.
- [ ] 6.2 Run `npm test` and `npx openspec validate reconcile-changed-tasks --strict`; verify both exit zero.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
