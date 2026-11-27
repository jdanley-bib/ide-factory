# Proposal

## Why

Part of #51 (failure 2, regression scenario 4). A human revised product scope, changed an in-progress task, and deferred others. `sync-tasks` exited 1 with a list of unmatched checkbox ids, the queue stayed unchanged, and no supported route existed to update or defer the in-progress task without losing or hiding its history. A separate change did not help: it left the original task and its stale queue entry in place.

Running `sync-tasks` against a throwaway project for this change showed the problem is wider than the report:

- Appending a new task to an already-synced change fails with `unmatched current checkbox ids`, even though `spec-to-backlog` already says an unchecked task not tied to a work item gets one.
- Removing or deferring a task fails the same way. There is no way to say "this task is deferred".
- Re-wording a task whose id is unchanged succeeds silently and rewrites the stored classification. An item that was `in_progress`, `code`, with `unit` checks was rewritten to `lightweight` with `build` checks, mid-attempt, dropping its red requirement, and the command reported `skipped 2`.

Failing closed on ambiguity is right. Failing on an unambiguous addition is a bug, and silently changing the gates of in-flight work is worse than failing. The factory needs a previewable, recorded way to say what happened to each task.

## What Changes

- Unambiguous additions work: a task with no matching work item is created, and a checked task with no item is ignored.
- A plan edit never rewrites the classification, dependencies, or acceptance criteria of an item that has an attempt. Wording changes update the title and provenance and keep the earlier text in a title history. A classification difference is reported as drift and needs a recorded decision.
- New read-only `idefactory sync-tasks <change> --plan [--json]` prints what sync would do: automatic actions, every unmatched stored item and unmatched current task, items with in-flight work, dependents that would be affected, overlapping active changes, and a plan digest.
- New `idefactory sync-tasks <change> --apply --decisions-file <path> --plan-digest <digest> --decided-by <id>` applies explicit decisions for each ambiguous item: `keep`, `renumber`, `defer`, `resume`, `drop`, `split`, `merge`, `move`, and `adopt-classification` or `keep-classification` for drift. Nothing is guessed from text similarity.
- Deferred and dropped items stay on disk with their attempts and evidence. They are never selected by `next` or `run`, never picked up as in-progress work, and cannot be completed. A dropped item can name the items that supersede it, including items in another change.
- A decision that loosens what an in-flight attempt must satisfy, or drops or merges an item with accepted work, needs a `--decided-by` identity that differs from that attempt's implementer, and a verified principal under policy version 2.
- Every applied reconciliation writes an immutable record with the plan digest, decisions, actor, and before and after digests of the touched items, and appends a control event.
- Renumbering stops deleting every item before rewriting them. Item files are written first and removed after.
- **BREAKING**: a same-id wording edit on an item with an attempt no longer rewrites its classification. Callers who relied on that must record `adopt-classification`.

## Capabilities

### New Capabilities

- `task-reconciliation`: the plan, the decisions, held items, and the audit record for changes to a synced task list.

### Modified Capabilities

- `spec-to-backlog`: appended tasks join an existing change, and an ambiguous remap names the plan command.

## Impact

- `src/lib/queue.mjs` (`syncTasks`, `reconcileExistingItems`, `applyTitleUpdates`, `applyRenumbers`), `src/lib/work.mjs` (selection, status encoding), `src/lib/orchestrate.mjs` (in-progress selection), `src/lib/complete.mjs` (held item refusal), `src/lib/run.mjs`, `src/lib/command-help.mjs`, `src/lib/event-log.mjs`, and a new `src/lib/reconcile.mjs`.
- `templates/skills/factory-openspec/SKILL.md`, `factory-coordinator`, `factory-run`, adapter copies, `README.md`.
- Records under `.factory/work/reconciliations/`.
- `test/queue.test.mjs` and new reconcile tests. No new dependencies.

Out of scope:

- Editing OpenSpec `tasks.md` or any change artifact. The human or the agent edits the plan; reconciliation only records what the queue does about it.
- Similarity matching or any guess at which old task became which new task.
- Archiving a change or syncing specs. Archive and spec sync keep the behavior in `spec-to-backlog`. This change only reports overlapping capability deltas.
- Moving evidence or attempts between work items.
- Deleting any work item, attempt, or evidence file.
