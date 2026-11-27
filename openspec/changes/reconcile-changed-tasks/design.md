# Design

## Context

See proposal.md for motivation, including the three defects found by running `sync-tasks` on a throwaway project. Current behavior in `src/lib/queue.mjs`:

- A first sync creates an item per unchecked task. Later syncs call `reconcileExistingItems`, which takes one of three paths. If the id sets are equal, it updates titles (`applyTitleUpdates`). If every task text matches one item text one to one, it renumbers (`applyRenumbers`). Otherwise it throws `reconciliationError`.
- `applyTitleUpdates` calls `classifyTask` again and writes the whole classification, dependencies, and acceptance criteria over the stored item, whatever its status.
- `applyRenumbers` deletes every item file for the change and then writes the new ones. A crash between the two leaves the change with no items.
- Work item statuses are `todo`, `in_progress`, `done`, `blocked`. `normalizeStatus` turns an unknown status into `todo`, so an unrecognized status would be selected as ready work. `orchestrate` takes the first `in_progress` item before it consults readiness. `isReady` requires every dependency to be `done`.
- `complete` ticks the checkbox for the item's id in `tasks.md`, which cannot work for a task that was removed.
- Item files are `.factory/work/items/<change>--<id>.json`. Attempts name `change` and `taskId`.

## Goals / Non-Goals

**Goals:**

- Unambiguous plan edits apply without a human.
- Ambiguous edits get a preview, explicit decisions, and a record.
- In-flight work is never re-gated or selected by accident.
- Nothing is deleted.

**Non-Goals:**

- Guessing mappings, moving evidence, or editing the plan.

## Decisions

**1. Classify each difference deterministically before deciding what needs a person.**
Sync compares stored items to current tasks and labels each pair: exact (same id and text), reword (same id, text changed), renumber (same text, new id, unique), addition (no id or text match), pre-checked (checked task with no item). Automatic: exact, renumber, pre-checked, an addition when it is the only difference, and a reword when it is the only difference. Any other combination, including an addition together with a reword, needs decisions, because a split is indistinguishable from a reword plus an addition. This keeps the existing silent paths that are safe and removes the ones that are not. Alternative: fuzzy text matching to propose mappings. Rejected: it hides a judgment behind a number and can map evidence to the wrong task.

**2. Never re-classify an item that has an attempt.**
For an item with an attempt, a reword updates `title` and `provenance` and appends the old text to `titleHistory`. The plan's `factory` block is compared with the stored one. A difference is drift, shown as the old and new requirement sets (using the resolver from `disclose-effective-requirements`). `adopt-classification` writes the plan's classification and records the decision; `keep-classification` records that the stored one stays. For an item with no attempt, drift is adopted automatically as today. Alternative: always require a decision for drift. Rejected: it adds friction for items that have not started.

**3. Held items reuse an existing status, with a hold marker.**
A held item is stored with status `blocked` and `hold: { kind: 'deferred' | 'dropped', previousStatus, decisionRecord, supersededBy? }`. Every shipped build already treats `blocked` as not ready and not in progress, so a rollback to an older build cannot select held work. A new status value would be read as `todo` by older builds. Reports and `status` show the hold kind, not the raw status. Alternative: new `deferred` and `dropped` statuses. Rejected for the rollback hazard above.

**4. Selection and completion checks look at the hold.**
`selectReady`, the `in_progress` lookup in `orchestrate`, `next`, and `complete` all go through one `isHeld(item)` helper. `complete` refuses a held item with a message naming the hold and the record. This closes the case where a dropped item's accepted attempt could otherwise try to tick a checkbox that no longer exists.

**5. Dependents are explicit.**
The plan walks `dependencies` and lists every item depending on a held item. A dropped item's decision carries `dependents: block | release`; `release` removes the dependency edge from the dependents and records that in the reconciliation record. A deferred item's dependents stay blocked by default. Alternative: automatically release. Rejected: a dependent may truly need the work that was dropped.

**6. Plan digest and apply.**
`--plan` computes a digest over the normalized task list and the stored items' ids, statuses, attempt ids, and classification digests. `--apply` recomputes it and refuses a mismatch, so a decision made against stale information changes nothing. The decisions file is JSON keyed by stored item id.

**7. Authority follows the effect.**
Decisions that cannot loosen anything (`keep`, `renumber`, `defer`, `resume`, `keep-classification`, and any decision on an item with no attempt past `planned`) need only an identity. Decisions that can change what in-flight work must satisfy or hide accepted work (`adopt-classification`, `drop`, `merge`, `move` on an item with an attempt past `planned`) need an identity different from the attempt's implementer, and a verified principal under policy version 2. This reuses the separation the factory already applies to red exceptions and does not require a human, which fits #51. Alternative: a human for every ambiguous decision. Rejected: it recreates the interruptions #51 describes.

**8. Atomic enough and idempotent.**
Apply writes the reconciliation record in a `pending` state, writes new and changed item files, removes superseded item files only for renumbers (after the new ones exist), and then marks the record `applied`. A repeat apply with the same digest and decisions finds the record and finishes any missing step. The record names the before and after digest of each touched item. This follows the journal pattern in `recoverable-finalization` in spirit without sharing its code.

**9. Overlap report, not overlap control.**
The plan lists other active changes whose `specs/<capability>/` directories overlap this change's and which have items not done. It does not block anything, since archive and spec sync remain the human's step and keep their existing guarantee that they do not touch attempts or work items.

**10. A cross-change move is a drop with a successor.**
`move` drops the old item with `supersededBy: [{ change, id }]` and requires that the target task exists in the other change's `tasks.md`. The target change's own sync creates its item. This is the supported form of the "separate change" workaround, and it removes the stale queue entry that the workaround left.

## Risks / Trade-offs

- [A reword that changes meaning is adopted automatically] → For an item with an attempt only the title changes, never the gates, and the reviewer sees the title history. A meaning change that needs new gates shows as drift.
- [A decisions file written by an agent is wrong] → The plan digest, the independence rule, and the immutable record bound the damage, and nothing is deleted, so a wrong `drop` is reversed by `resume`.
- [Using `blocked` for holds makes status counts less precise] → `status` and the plan report the hold kind. The counts keep older tooling safe.
- [Dependents of a held item can starve a run] → `run` reports no ready work with the held item named as the cause, and the plan names dependents up front.
- [Identity rule blocks a single-agent setup] → The same limit already applies to exceptions. A setup with one identity can still use `keep`, `renumber`, `defer`, and decisions on items that have not started.

## Migration Plan

No data migration. Items without `hold` or `titleHistory` read as before. The first sync after upgrade stops rewriting classification for items with an attempt. Rollback is a code revert: held items stay `blocked`, so older builds do not select them, and reconciliation records are ignored.

## Open Questions

- Whether `--decided-by` should default from the writer lease identity. It can be added later without changing the specs.
