# Design

## Context

See proposal.md for why this change exists. `syncTasks` in `src/lib/queue.mjs` parses `tasks.md` with `parseCheckboxes`. The checkbox id is the token after the mark (`1.1`). The title is the rest of that line. A checked box is skipped. An id that already has `.factory/work/items/<change>--<id>.json` is skipped, including its title and status. The command then rewrites `.factory/active-change.json` and appends a ledger line. Nothing stores a hash of the task text.

`complete` is the writer that marks a work item `done` and checks the OpenSpec box (`withCheckedCheckbox` in `src/lib/finalization-recovery.mjs`). No factory command reads `openspec/changes/archive/` or treats a main-spec write as an attempt transition.

`@fission-ai/openspec` is declared as `^1.14.3`. The lockfile resolves `1.14.3`. `backlog.md` is already a devDependency used by `src/lib/backlog.mjs`. This change does not add or remove it.

## Goals / Non-Goals

**Goals:**

- One locator: the change name plus the checkbox id, with a provenance hash of the normalized task title.
- Repeated sync of an unchanged `tasks.md` leaves work-item ids and statuses unchanged.
- A whitespace-only rewrite at the same id, and a one-to-one renumber of the same titles, does not create a second item.
- An ambiguous split, merge, or reorder writes nothing under `.factory/work/` and prints a reconciliation report.
- A hand-checked box does not mark a work item done and does not accept an attempt.
- Archive and main-spec writes do not change attempt state, evidence, or work-item status.
- The manifest pins OpenSpec at `1.14.3` and gains no Squad or Squad4Cursor package.

**Non-Goals:**

- A second task id that is independent of the checkbox token.
- Updating evidence bytes, or moving an attempt to `accepted`, during sync, archive, or spec sync.
- An `idefactory` archive or spec-sync command. Those stay OpenSpec operations outside the factory.
- Removing `backlog.md`, vendoring OpenSpec, or running OpenSpec apply.

## Decisions

### Normalize the title, not the whole task block

Normalized text is the checkbox title with leading and trailing whitespace removed and each internal whitespace run collapsed to one space. The factory block and the indented acceptance lines stay out of the hash. `parseCheckboxes` already separates that title from the rest of the file.

The provenance value on a new work item is `{ algorithm: "sha256", text, digest }`, where `digest` is the hex SHA-256 of the UTF-8 normalized text. The work-item id stays the checkbox id, and the file stays `.factory/work/items/<change>--<id>.json`.

An item synced before this change has no provenance. Its stored text is `item.title` run through the same normalization.

Alternatives considered:

- Hash the whole task, including the factory block. Rejected. A metadata edit would look like a different task.
- Use a UUID that ignores the checkbox id. Rejected. Attempts, complete, and the item filename already use the checkbox id.

### Match in four steps, and write only after the match is known

Compare every current checkbox, checked or not, with every work item for that change.

1. Same ids and the same normalized text for every item. This is the idempotent case, including a whitespace-only rewrite and a hand-checked box. Do not rewrite item files when provenance is already present and equal. If provenance is missing, fill it and leave id, status, and `attemptId` alone. A checked mark does not change status and does not transition the attempt.
2. Same id set, and at least one title differs. Update that item's title, factory classification, acceptance criteria, and provenance. Leave status and `attemptId` alone. Do not create another item.
3. The normalized texts are a one-to-one match and at least one checkbox id differs. Rename the work item to the new id and keep status, `attemptId`, factory metadata, acceptance criteria, and provenance text. If an attempt for that change stores the old task id, set its `taskId` to the new id and leave `state` and evidence bytes alone. That is not an accept transition.
4. Anything else, including a split, a merge, duplicate normalized titles, or a mix of edits and id moves that is not a one-to-one text match. Write nothing under `.factory/work/`, do not rewrite active-change or the ledger, and exit non-zero. Stdout is a reconciliation report that names the change, the previous ids that did not match, and the current ids that did not match.

A checked box that has no work item still creates nothing. That is the existing skip rule, applied only on the create path.

Alternatives considered:

- Treat every title edit as ambiguous. Rejected. An in-place wording change still has one checkbox id, so identity is not ambiguous.
- Treat every renumber as ambiguous, even when each title matches one item. Rejected. The wording-preserving case would mint a second item, which is the bug this change closes.
- Leave a renumbered attempt pointing at the old task id. Rejected. `complete` refuses an attempt whose task id does not match the work item.

### Pin the manifest without taking new packages

Change the root `package.json` dependency and the matching lockfile declaration from `^1.14.3` to `1.14.3`. Leave the resolved tarball at `1.14.3`. Do not run an install that fetches packages. Do not add `@bradygaster/squad` or `@squad4cursor/*`.

### Archive and spec sync stay outside the factory

Do not add a factory command that archives a change or copies delta specs. The regression test moves the change directory to `openspec/changes/archive/` and writes main spec text in a temporary project, then asserts the attempt file, evidence files, and work-item status are unchanged and the attempt state is not `accepted`.

## Risks / Trade-offs

- [A split that used to create an extra work item now exits non-zero] → The report names the unmatched ids. The human edits `tasks.md` until the match is one to one, then syncs again. `.factory/work/` is still the queue from before the failed sync.
- [Renaming a checkbox id rewrites `attempt.taskId`] → `state` and evidence stay put, so the attempt is not accepted. Ambiguous remaps do not perform this write.
- [Idempotent sync still refreshes active-change and the ledger] → Work-item ids and statuses are the contract. Item files are not rewritten when provenance already matches.
- [The existing `backlog.md` devDependency remains] → This change must not add another copy or a Squad package. Removing the current dependency is a separate change.

## Migration Plan

No data migration of committed work items is required. The next same-id sync fills provenance when it is missing. Rollback is reverting the sync matcher and the manifest pin. Failed ambiguous syncs leave the previous work items in place.

## Open Questions

None. The match rules above are the ones the tasks implement.
